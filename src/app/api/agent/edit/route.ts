import { NextResponse } from "next/server";
import { z } from "zod";
import {
  editWorkflowWithOllama,
  isFallbackEligible,
} from "@/lib/agent/editor";
import { consumeRateLimit } from "@/lib/agent/rate-limit";
import { resolveActiveAiMode, type ActiveAiMode } from "@/lib/ai-mode";
import { editWorkflowWithDemo } from "@/lib/demo";
import {
  checkOllamaHealth,
  getOllamaConfig,
  OllamaClientError,
  OllamaConfigError,
} from "@/lib/ollama";
import {
  AgentEditResponse,
  applyGraphOperations,
  GraphOperationError,
  validateWorkflowGraph,
  Workflow,
  WorkflowSchema,
} from "@/lib/workflow";

export const dynamic = "force-dynamic";

/** Edit payloads include a full workflow; allow more than the plan endpoint. */
const MAX_BODY_BYTES = 100 * 1024;

const RecentMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(2000),
});

const EditRequestSchema = z
  .object({
    workflow: WorkflowSchema,
    message: z.string().min(1).max(2000),
    recentMessages: z.array(RecentMessageSchema).max(6).optional(),
  })
  .strict();

export type EditSuccessResponse = {
  workflow: Workflow;
  edit: AgentEditResponse;
  activeMode: ActiveAiMode;
  model: string | null;
  durationMs: number;
};

export type EditErrorResponse = {
  error: {
    code: string;
    message: string;
    retryable: boolean;
  };
};

function noStoreJson(body: EditSuccessResponse | EditErrorResponse, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function errorResponse(
  code: string,
  message: string,
  retryable: boolean,
  status: number,
) {
  return noStoreJson({ error: { code, message, retryable } }, status);
}

function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return request.headers.get("x-real-ip") || "local";
}

function applyDemoEdit(
  workflow: Workflow,
  message: string,
): EditSuccessResponse {
  const started = Date.now();
  const edit = editWorkflowWithDemo(workflow, message);
  if (edit.operations.length === 0) {
    return {
      workflow,
      edit,
      activeMode: "demo",
      model: null,
      durationMs: Date.now() - started,
    };
  }
  try {
    const next = applyGraphOperations(workflow, edit.operations);
    return {
      workflow: next,
      edit,
      activeMode: "demo",
      model: null,
      durationMs: Date.now() - started,
    };
  } catch (error) {
    if (error instanceof GraphOperationError) {
      return {
        workflow,
        edit: {
          assistantMessage: `I could not apply that edit safely (${error.message}). No changes were made.`,
          intentSummary: edit.intentSummary,
          operations: [],
        },
        activeMode: "demo",
        model: null,
        durationMs: Date.now() - started,
      };
    }
    throw error;
  }
}

export async function POST(request: Request) {
  const started = Date.now();

  try {
    const rate = consumeRateLimit(`edit:${clientKey(request)}`, {
      limit: 30,
      windowMs: 60_000,
    });
    if (!rate.allowed) {
      return errorResponse(
        "rate_limited",
        "Too many edit requests from this client. Wait a moment and try again. (In-memory prototype limiter — not distributed.)",
        true,
        429,
      );
    }

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      return errorResponse(
        "invalid_content_type",
        "Content-Type must be application/json.",
        false,
        415,
      );
    }

    const contentLengthHeader = request.headers.get("content-length");
    if (contentLengthHeader) {
      const contentLength = Number(contentLengthHeader);
      if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
        return errorResponse(
          "body_too_large",
          "Request body must be 100KB or smaller.",
          false,
          413,
        );
      }
    }

    const rawText = await request.text();
    if (rawText.length > MAX_BODY_BYTES) {
      return errorResponse(
        "body_too_large",
        "Request body must be 100KB or smaller.",
        false,
        413,
      );
    }

    let json: unknown;
    try {
      json = JSON.parse(rawText);
    } catch {
      return errorResponse(
        "invalid_json",
        "Request body must be valid JSON.",
        false,
        400,
      );
    }

    const parsed = EditRequestSchema.safeParse(json);
    if (!parsed.success) {
      const message = parsed.error.issues
        .slice(0, 5)
        .map((i) => `${i.path.join(".") || "body"}: ${i.message}`)
        .join("; ");
      return errorResponse(
        "invalid_request",
        message || "Invalid edit request.",
        false,
        400,
      );
    }

    const { workflow, message, recentMessages } = parsed.data;
    const graphCheck = validateWorkflowGraph(workflow);
    if (!graphCheck.ok) {
      return errorResponse(
        "invalid_graph",
        `Incoming workflow failed graph validation: ${graphCheck.issues
          .slice(0, 5)
          .map((i) => i.message)
          .join("; ")}`,
        false,
        400,
      );
    }

    const config = getOllamaConfig();

    if (config.configuredMode === "demo") {
      return noStoreJson(applyDemoEdit(workflow, message), 200);
    }

    const health = await checkOllamaHealth({ config });
    const ollamaReady = health.reachable && health.modelAvailable;
    const activeMode = await resolveActiveAiMode(
      config.configuredMode,
      async () => ollamaReady,
    );

    if (config.configuredMode === "ollama" && activeMode === null) {
      return errorResponse(
        health.reachable && !health.modelAvailable
          ? "ollama_missing_model"
          : "ollama_unavailable",
        health.message,
        true,
        503,
      );
    }

    if (activeMode === "demo") {
      return noStoreJson(applyDemoEdit(workflow, message), 200);
    }

    try {
      const result = await editWorkflowWithOllama(
        workflow,
        message,
        recentMessages,
        { config },
      );
      return noStoreJson(
        {
          ...result,
          durationMs: Math.max(result.durationMs, Date.now() - started),
        },
        200,
      );
    } catch (error) {
      if (config.configuredMode === "auto" && isFallbackEligible(error)) {
        return noStoreJson(applyDemoEdit(workflow, message), 200);
      }

      if (error instanceof OllamaClientError) {
        const client = error.toClientError();
        return errorResponse(
          client.code,
          client.message,
          client.retryable,
          error.code === "ollama_invalid_structured_output" ? 502 : 503,
        );
      }

      throw error;
    }
  } catch (error) {
    if (error instanceof OllamaConfigError) {
      return errorResponse("ollama_config_invalid", error.message, false, 500);
    }

    console.error("[edit] unexpected_error", {
      name: error instanceof Error ? error.name : "unknown",
    });
    return errorResponse(
      "internal_error",
      "Unable to edit workflow.",
      true,
      500,
    );
  }
}
