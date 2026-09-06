import "server-only";

import { z } from "zod";
import type { ActiveAiMode } from "@/lib/ai-mode";
import {
  chatStructured,
  OllamaClientError,
  type ChatMessage,
  type OllamaConfig,
} from "@/lib/ollama";
import {
  CreativeBrief,
  CreativeBriefSchema,
  NodeModelClassSchema,
  Workflow,
  WorkflowEdge,
  WorkflowIdSchema,
  WorkflowNode,
  WorkflowNodeKindSchema,
  WorkflowSchema,
  createIdleRuntime,
  validateWorkflowGraph,
  type GraphValidationIssue,
} from "@/lib/workflow";

export const PLANNER_SYSTEM_INSTRUCTION = [
  "You are a senior creative workflow architect for Flow Copilot.",
  "Create the smallest useful workflow, normally 7–11 nodes.",
  "Build a left-to-right directed acyclic graph (DAG).",
  "Preserve all brief constraints exactly.",
  "Use only allowed node kinds from the schema.",
  "Do not claim media has already been generated; image/video/audio nodes are provider placeholders.",
  "Every node must contribute to the stated output.",
  "Use concise labels and actionable instructions.",
  "Ensure all enabled nodes are connected from an input to an output.",
  "Return only the schema-conforming Workflow object.",
].join(" ");

/** Looser parse target for LLM output; normalized to WorkflowSchema server-side. */
export const WorkflowDraftSchema = z.object({
  schemaVersion: z.union([z.literal(1), z.number(), z.string()]).optional(),
  id: z.string().optional(),
  title: z.string().optional(),
  objective: z.string().optional(),
  brief: CreativeBriefSchema.optional(),
  nodes: z
    .array(
      z.object({
        id: z.string().min(1),
        kind: WorkflowNodeKindSchema,
        label: z.string().min(1),
        description: z.string().optional(),
        position: z
          .object({
            x: z.number().optional(),
            y: z.number().optional(),
          })
          .optional(),
        config: z
          .object({
            modelClass: NodeModelClassSchema.optional(),
            instruction: z.string().optional(),
            enabled: z.boolean().optional(),
            settings: z
              .array(
                z.object({
                  key: z.string(),
                  value: z.string(),
                }),
              )
              .optional(),
          })
          .optional(),
        runtime: z.unknown().optional(),
        locked: z.boolean().optional(),
      }),
    )
    .min(2)
    .max(80),
  edges: z
    .array(
      z.object({
        id: z.string().min(1),
        source: z.string().min(1),
        target: z.string().min(1),
        label: z.string().optional(),
        animated: z.boolean().optional(),
      }),
    )
    .max(160),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  version: z.number().optional(),
  mode: z.enum(["demo", "ollama"]).optional(),
});

export type WorkflowDraft = z.infer<typeof WorkflowDraftSchema>;

function safeId(candidate: string, fallback: string, used: Set<string>): string {
  let base = candidate.replace(/[^a-zA-Z0-9_-]/g, "_");
  if (!base || !/^[a-zA-Z]/.test(base)) {
    base = fallback.replace(/[^a-zA-Z0-9_-]/g, "_");
  }
  if (!/^[a-zA-Z]/.test(base)) {
    base = `n_${base}`;
  }
  base = base.slice(0, 64);
  if (!WorkflowIdSchema.safeParse(base).success) {
    base = "node";
  }
  let id = base;
  let n = 2;
  while (used.has(id)) {
    const suffix = `_${n}`;
    id = `${base.slice(0, Math.max(1, 64 - suffix.length))}${suffix}`;
    n += 1;
  }
  used.add(id);
  return id;
}

function defaultModelClass(
  kind: WorkflowNode["kind"],
): WorkflowNode["config"]["modelClass"] {
  switch (kind) {
    case "brief_input":
      return "input";
    case "image_generator":
      return "image";
    case "video_generator":
      return "video";
    case "voiceover":
    case "music":
      return "audio";
    case "brand_validator":
    case "platform_adapter":
      return "utility";
    case "output":
      return "output";
    default:
      return "text";
  }
}

/**
 * Normalize LLM workflow output before graph validation / client delivery.
 */
export function normalizePlannedWorkflow(
  raw: WorkflowDraft,
  brief: CreativeBrief,
  mode: ActiveAiMode,
  now = new Date().toISOString(),
): Workflow {
  const usedNodeIds = new Set<string>();
  const idMap = new Map<string, string>();

  const nodes: WorkflowNode[] = raw.nodes.map((node, index) => {
    const fallback = `${node.kind}_${index + 1}`;
    const id = safeId(node.id, fallback, usedNodeIds);
    idMap.set(node.id, id);
    return {
      id,
      kind: node.kind,
      label: node.label.slice(0, 60),
      description: (node.description ?? "").slice(0, 240),
      position: {
        x: Number.isFinite(node.position?.x) ? (node.position!.x as number) : index * 260,
        y: Number.isFinite(node.position?.y)
          ? (node.position!.y as number)
          : (index % 3) * 120,
      },
      config: {
        modelClass: node.config?.modelClass ?? defaultModelClass(node.kind),
        instruction: (node.config?.instruction ?? `Run ${node.kind}`).slice(0, 2000),
        enabled: node.config?.enabled !== false,
        settings: Array.isArray(node.config?.settings)
          ? node.config!.settings!.map((s) => ({
              key: String(s.key).slice(0, 64),
              value: String(s.value).slice(0, 2000),
            }))
          : [],
      },
      runtime: createIdleRuntime(),
      locked: node.kind === "brief_input" ? true : Boolean(node.locked),
    };
  });

  const usedEdgeIds = new Set<string>();
  const pairKeys = new Set<string>();
  const edges: WorkflowEdge[] = [];

  for (const [index, edge] of raw.edges.entries()) {
    const source = idMap.get(edge.source) ?? edge.source;
    const target = idMap.get(edge.target) ?? edge.target;
    if (!nodes.some((n) => n.id === source) || !nodes.some((n) => n.id === target)) {
      continue;
    }
    if (source === target) continue;
    const pair = `${source}->${target}`;
    if (pairKeys.has(pair)) continue;
    pairKeys.add(pair);

    const id = safeId(edge.id, `e_${index + 1}`, usedEdgeIds);
    edges.push({
      id,
      source,
      target,
      label: edge.label?.slice(0, 60),
      animated: Boolean(edge.animated),
    });
  }

  const title =
    (raw.title?.trim() || `${brief.product}: ${brief.objective}`).slice(0, 120) ||
    brief.product.slice(0, 120);

  const workflow: Workflow = {
    schemaVersion: 1,
    id: safeId(raw.id || "wf_plan", "wf_plan", new Set()),
    title,
    objective: (raw.objective?.trim() || brief.objective).slice(0, 500),
    brief: structuredClone(brief),
    nodes,
    edges,
    createdAt: now,
    updatedAt: now,
    version: 1,
    mode,
  };

  return WorkflowSchema.parse(workflow);
}

export function buildPlannerMessages(
  brief: CreativeBrief,
  workflowJsonSchema: Record<string, unknown>,
): ChatMessage[] {
  return [
    { role: "system", content: PLANNER_SYSTEM_INSTRUCTION },
    {
      role: "user",
      content: [
        "Create a Workflow for this creative brief.",
        JSON.stringify(brief),
        "Workflow JSON Schema:",
        JSON.stringify(workflowJsonSchema),
      ].join("\n"),
    },
  ];
}

export function buildGraphRepairMessages(
  brief: CreativeBrief,
  previousWorkflow: unknown,
  issues: GraphValidationIssue[],
  workflowJsonSchema: Record<string, unknown>,
): ChatMessage[] {
  return [
    { role: "system", content: PLANNER_SYSTEM_INSTRUCTION },
    {
      role: "user",
      content: [
        "Your previous Workflow failed graph invariant checks.",
        "Fix the graph with the fewest changes. Keep the same brief.",
        `Violations: ${issues.map((i) => `${i.code}: ${i.message}`).join(" | ")}`,
        `Brief: ${JSON.stringify(brief)}`,
        `Previous workflow: ${JSON.stringify(previousWorkflow)}`,
        "Workflow JSON Schema:",
        JSON.stringify(workflowJsonSchema),
        "Return only a corrected Workflow object.",
      ].join("\n"),
    },
  ];
}

export function plannerAssistantMessage(
  workflow: Workflow,
  activeMode: ActiveAiMode,
): string {
  const media = workflow.nodes.filter(
    (n) =>
      n.kind === "image_generator" ||
      n.kind === "video_generator" ||
      n.kind === "voiceover" ||
      n.kind === "music",
  ).length;
  const engine = activeMode === "demo" ? "demo engine" : "Ollama";
  return [
    `Planned “${workflow.title}” with ${workflow.nodes.length} nodes via the ${engine}.`,
    media > 0
      ? `${media} media node(s) are provider placeholders and are not generated yet.`
      : "All nodes are executable text/utility steps in this prototype.",
  ].join(" ");
}

export type PlanWorkflowResult = {
  workflow: Workflow;
  assistantMessage: string;
  activeMode: ActiveAiMode;
  model: string | null;
  durationMs: number;
};

export type PlanWorkflowDeps = {
  config: OllamaConfig;
  fetchImpl?: typeof fetch;
  now?: string;
};

export function isFallbackEligible(error: unknown): boolean {
  return (
    error instanceof OllamaClientError &&
    (error.code === "ollama_unavailable" ||
      error.code === "ollama_timeout" ||
      error.code === "ollama_missing_model")
  );
}

/**
 * Plan a workflow with Ollama structured outputs + one graph-invariant repair.
 * Does not fall back to demo — callers decide fallback policy.
 */
export async function planWorkflowWithOllama(
  brief: CreativeBrief,
  deps: PlanWorkflowDeps,
): Promise<PlanWorkflowResult> {
  const started = Date.now();
  const jsonSchema = z.toJSONSchema(WorkflowSchema) as Record<string, unknown>;
  const now = deps.now ?? new Date().toISOString();

  const first = await chatStructured({
    messages: buildPlannerMessages(brief, jsonSchema),
    schema: WorkflowDraftSchema,
    schemaName: "Workflow",
    config: deps.config,
    fetchImpl: deps.fetchImpl,
    jsonSchema,
  });

  let normalized = normalizePlannedWorkflow(first.data, brief, "ollama", now);
  let graphCheck = validateWorkflowGraph(normalized);
  let model = first.model;
  let durationMs = Date.now() - started;

  if (!graphCheck.ok) {
    const repair = await chatStructured({
      messages: buildGraphRepairMessages(
        brief,
        first.data,
        graphCheck.issues,
        jsonSchema,
      ),
      schema: WorkflowDraftSchema,
      schemaName: "Workflow",
      config: deps.config,
      fetchImpl: deps.fetchImpl,
      jsonSchema,
    });
    model = repair.model;
    durationMs = Date.now() - started;
    normalized = normalizePlannedWorkflow(repair.data, brief, "ollama", now);
    graphCheck = validateWorkflowGraph(normalized);
    if (!graphCheck.ok) {
      throw new OllamaClientError(
        "ollama_invalid_structured_output",
        "Ollama produced a workflow that still failed graph validation after one repair attempt.",
        { retryable: true },
      );
    }
  }

  return {
    workflow: normalized,
    assistantMessage: plannerAssistantMessage(normalized, "ollama"),
    activeMode: "ollama",
    model,
    durationMs,
  };
}
