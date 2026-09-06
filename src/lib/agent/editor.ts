import "server-only";

import { z } from "zod";
import type { ActiveAiMode } from "@/lib/ai-mode";
import { isFallbackEligible } from "@/lib/agent/planner";
import {
  chatStructured,
  OllamaClientError,
  type ChatMessage,
  type OllamaConfig,
} from "@/lib/ollama";
import {
  AgentEditResponse,
  AgentEditResponseSchema,
  applyGraphOperations,
  GraphOperationError,
  Workflow,
} from "@/lib/workflow";

export const EDITOR_SYSTEM_INSTRUCTION = [
  "You edit an existing Flow Copilot workflow graph via operations only.",
  "Modify the supplied graph; do not create an unrelated graph.",
  "Use existing node and edge IDs exactly when referencing them.",
  "Make the fewest operations that satisfy the command.",
  "Keep a valid connected DAG.",
  "Do not remove locked nodes.",
  "Do not delete user work unless explicitly requested.",
  "When inserting a node, add and remove or replace the necessary edges so data flows through it.",
  "If a command is ambiguous, return zero operations and ask one concise question.",
  "Never claim success with zero operations.",
  "Return only AgentEditResponse (assistantMessage, intentSummary, operations).",
].join(" ");

export function compactGraphSummary(workflow: Workflow): string {
  const nodes = workflow.nodes
    .map(
      (n) =>
        `${n.id}[${n.kind}${n.locked ? ",locked" : ""}${n.config.enabled ? "" : ",disabled"}]`,
    )
    .join(", ");
  const edges = workflow.edges.map((e) => `${e.id}:${e.source}->${e.target}`).join(", ");
  return [
    `id=${workflow.id} v=${workflow.version} title=${workflow.title}`,
    `nodes(${workflow.nodes.length}): ${nodes}`,
    `edges(${workflow.edges.length}): ${edges}`,
  ].join("\n");
}

function honestEmptyEdit(edit: AgentEditResponse): AgentEditResponse {
  if (edit.operations.length > 0) return edit;
  const lower = edit.assistantMessage.toLowerCase();
  const claimsSuccess =
    /\b(added|removed|updated|replaced|changed|done|completed|success)\b/.test(
      lower,
    ) && !/\bno changes\b|\bzero operations\b|\bnothing to\b|\bnot made\b/.test(lower);

  if (!claimsSuccess) return edit;
  return {
    ...edit,
    assistantMessage:
      "I could not apply a safe edit for that command. No changes were made. Please clarify what to change.",
  };
}

export function buildEditorMessages(params: {
  workflow: Workflow;
  message: string;
  recentMessages?: Array<{ role: "user" | "assistant"; content: string }>;
  jsonSchema: Record<string, unknown>;
}): ChatMessage[] {
  const history = (params.recentMessages ?? []).slice(-6).map((m) => ({
    role: m.role,
    content: m.content.slice(0, 2000),
  }));

  return [
    { role: "system", content: EDITOR_SYSTEM_INSTRUCTION },
    ...history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    {
      role: "user",
      content: [
        "Current graph summary:",
        compactGraphSummary(params.workflow),
        "Current workflow JSON:",
        JSON.stringify(params.workflow),
        `Command: ${params.message.slice(0, 2000)}`,
        "AgentEditResponse JSON Schema:",
        JSON.stringify(params.jsonSchema),
        "Return only AgentEditResponse operations for this graph.",
      ].join("\n"),
    },
  ];
}

export function buildEditorRepairMessages(params: {
  workflow: Workflow;
  message: string;
  previousEdit: AgentEditResponse;
  errorText: string;
  jsonSchema: Record<string, unknown>;
}): ChatMessage[] {
  return [
    { role: "system", content: EDITOR_SYSTEM_INSTRUCTION },
    {
      role: "user",
      content: [
        "Your previous AgentEditResponse could not be applied.",
        `Error: ${params.errorText}`,
        "Graph summary:",
        compactGraphSummary(params.workflow),
        `Command: ${params.message.slice(0, 2000)}`,
        `Previous edit: ${JSON.stringify(params.previousEdit)}`,
        "AgentEditResponse JSON Schema:",
        JSON.stringify(params.jsonSchema),
        "Return a corrected AgentEditResponse. Use existing IDs. Keep a valid DAG.",
      ].join("\n"),
    },
  ];
}

function tryApply(
  workflow: Workflow,
  edit: AgentEditResponse,
): { ok: true; workflow: Workflow; edit: AgentEditResponse } | { ok: false; errorText: string } {
  const honest = honestEmptyEdit(edit);
  if (honest.operations.length === 0) {
    return { ok: true, workflow, edit: honest };
  }

  try {
    const next = applyGraphOperations(workflow, honest.operations);
    return { ok: true, workflow: next, edit: honest };
  } catch (error) {
    if (error instanceof GraphOperationError) {
      return { ok: false, errorText: `${error.code}: ${error.message}` };
    }
    return {
      ok: false,
      errorText: error instanceof Error ? error.message : "Unknown apply error",
    };
  }
}

export type EditWorkflowResult = {
  workflow: Workflow;
  edit: AgentEditResponse;
  activeMode: ActiveAiMode;
  model: string | null;
  durationMs: number;
};

export type EditWorkflowDeps = {
  config: OllamaConfig;
  fetchImpl?: typeof fetch;
};

/**
 * Request AgentEditResponse from Ollama, apply on the server, one repair if needed.
 */
export async function editWorkflowWithOllama(
  workflow: Workflow,
  message: string,
  recentMessages: Array<{ role: "user" | "assistant"; content: string }> | undefined,
  deps: EditWorkflowDeps,
): Promise<EditWorkflowResult> {
  const started = Date.now();
  const jsonSchema = z.toJSONSchema(AgentEditResponseSchema) as Record<
    string,
    unknown
  >;

  const first = await chatStructured({
    messages: buildEditorMessages({
      workflow,
      message,
      recentMessages,
      jsonSchema,
    }),
    schema: AgentEditResponseSchema,
    schemaName: "AgentEditResponse",
    config: deps.config,
    fetchImpl: deps.fetchImpl,
    jsonSchema,
  });

  let applied = tryApply(workflow, first.data);
  let model = first.model;

  if (!applied.ok) {
    const repair = await chatStructured({
      messages: buildEditorRepairMessages({
        workflow,
        message,
        previousEdit: first.data,
        errorText: applied.errorText,
        jsonSchema,
      }),
      schema: AgentEditResponseSchema,
      schemaName: "AgentEditResponse",
      config: deps.config,
      fetchImpl: deps.fetchImpl,
      jsonSchema,
    });
    model = repair.model;
    applied = tryApply(workflow, repair.data);
    if (!applied.ok) {
      throw new OllamaClientError(
        "ollama_invalid_structured_output",
        "Ollama edit operations were still invalid after one repair attempt.",
        { retryable: true },
      );
    }
  }

  return {
    workflow: applied.workflow,
    edit: applied.edit,
    activeMode: "ollama",
    model,
    durationMs: Date.now() - started,
  };
}

export { isFallbackEligible };
