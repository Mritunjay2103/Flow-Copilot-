import { NextResponse } from "next/server";
import { z } from "zod";
import {
  executeWorkflowNode,
  isFallbackEligible,
  NodeExecutionError,
  type UpstreamOutputItem,
} from "@/lib/agent/run-node";
import { consumeRateLimit } from "@/lib/agent/rate-limit";
import { resolveActiveAiMode, type ActiveAiMode } from "@/lib/ai-mode";
import {
  checkOllamaHealth,
  getOllamaConfig,
  OllamaClientError,
  OllamaConfigError,
} from "@/lib/ollama";
import {
  CreativeBriefSchema,
  NodeExecutionResult,
  NodeExecutionResultSchema,
  NodeRunStatus,
  WorkflowIdSchema,
  WorkflowNodeSchema,
} from "@/lib/workflow";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 40 * 1024;

const UpstreamOutputSchema = z.object({
  nodeId: WorkflowIdSchema,
  nodeLabel: z.string().min(1).max(60),
  result: NodeExecutionResultSchema,
});

const RunRequestSchema = z
  .object({
    workflowContext: z
      .object({
        workflowId: WorkflowIdSchema,
        title: z.string().min(1).max(120),
        brief: CreativeBriefSchema,
        mode: z.enum(["demo", "ollama"]),
      })
      .strict(),
    node: WorkflowNodeSchema,
    upstreamOutputs: z.array(UpstreamOutputSchema).max(40),
  })
  .strict();

export type RunSuccessResponse = {
  result: NodeExecutionResult;
  status: NodeRunStatus;
  activeMode: ActiveAiMode;
  model: string | null;
  durationMs: number;
};

export type RunErrorResponse = {
  error: {
    code: string;
    message: string;
    retryable: boolean;
  };
};

function noStoreJson(body: RunSuccessResponse | RunErrorResponse, status: number) {
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

export async function POST(request: Request) {
  try {
    const rate = consumeRateLimit(`run:${clientKey(request)}`, {
      limit: 60,
      windowMs: 60_000,
    });
    if (!rate.allowed) {
      return errorResponse(
        "rate_limited",
        "Too many run requests from this client. Wait a moment and try again. (In-memory prototype limiter — not distributed.)",
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
          "Request body must be 40KB or smaller.",
          false,
          413,
        );
      }
    }

    const rawText = await request.text();
    if (rawText.length > MAX_BODY_BYTES) {
      return errorResponse(
        "body_too_large",
        "Request body must be 40KB or smaller.",
        false,
        413,
      );
    }

    let json: unknown;
    try {
      json = JSON.parse(rawText);
    } catch {
      return errorResponse("invalid_json", "Request body must be valid JSON.", false, 400);
    }

    const parsed = RunRequestSchema.safeParse(json);
    if (!parsed.success) {
      const message = parsed.error.issues
        .slice(0, 5)
        .map((i) => `${i.path.join(".") || "body"}: ${i.message}`)
        .join("; ");
      return errorResponse(
        "invalid_request",
        message || "Invalid run request.",
        false,
        400,
      );
    }

    const { workflowContext, node, upstreamOutputs } = parsed.data;
    const config = getOllamaConfig();

    let activeMode: ActiveAiMode = "demo";

    if (config.configuredMode === "demo") {
      activeMode = "demo";
    } else {
      const health = await checkOllamaHealth({ config });
      const ready = health.reachable && health.modelAvailable;
      const resolved = await resolveActiveAiMode(
        config.configuredMode,
        async () => ready,
      );

      if (config.configuredMode === "ollama" && resolved === null) {
        return errorResponse(
          health.reachable && !health.modelAvailable
            ? "ollama_missing_model"
            : "ollama_unavailable",
          health.message,
          true,
          503,
        );
      }

      activeMode = resolved ?? "demo";
    }

    // Prefer server-resolved mode; ignore client provider URLs via sanitize in executor.
    void workflowContext.mode;

    try {
      const result = await executeWorkflowNode({
        node,
        brief: workflowContext.brief,
        upstreamOutputs: upstreamOutputs as UpstreamOutputItem[],
        activeMode,
        config,
      });
      return noStoreJson(result, 200);
    } catch (error) {
      if (
        config.configuredMode === "auto" &&
        isFallbackEligible(error) &&
        activeMode === "ollama"
      ) {
        const fallback = await executeWorkflowNode({
          node,
          brief: workflowContext.brief,
          upstreamOutputs: upstreamOutputs as UpstreamOutputItem[],
          activeMode: "demo",
          forceDemo: true,
        });
        return noStoreJson(fallback, 200);
      }

      if (error instanceof NodeExecutionError) {
        return errorResponse(
          error.code,
          error.message,
          error.retryable,
          error.code === "node_disabled" ? 400 : 400,
        );
      }

      if (error instanceof OllamaClientError) {
        const client = error.toClientError();
        return errorResponse(
          client.code,
          client.message,
          client.retryable,
          503,
        );
      }

      throw error;
    }
  } catch (error) {
    if (error instanceof OllamaConfigError) {
      return errorResponse("ollama_config_invalid", error.message, false, 500);
    }
    console.error("[nodes/run] unexpected_error", {
      name: error instanceof Error ? error.name : "unknown",
    });
    return errorResponse("internal_error", "Unable to run node.", true, 500);
  }
}
