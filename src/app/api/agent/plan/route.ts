import { NextResponse } from "next/server";
import { z } from "zod";
import {
  isFallbackEligible,
  planWorkflowWithOllama,
  plannerAssistantMessage,
} from "@/lib/agent/planner";
import { consumeRateLimit } from "@/lib/agent/rate-limit";
import { resolveActiveAiMode, type ActiveAiMode } from "@/lib/ai-mode";
import { planWorkflowFromBrief } from "@/lib/demo";
import {
  checkOllamaHealth,
  getOllamaConfig,
  OllamaClientError,
  OllamaConfigError,
} from "@/lib/ollama";
import { CreativeBriefSchema, validateWorkflowGraph } from "@/lib/workflow";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 20 * 1024;

const PlanRequestSchema = z
  .object({
    brief: CreativeBriefSchema,
  })
  .strict();

export type PlanSuccessResponse = {
  workflow: ReturnType<typeof planWorkflowFromBrief>;
  assistantMessage: string;
  activeMode: ActiveAiMode;
  model: string | null;
  durationMs: number;
};

export type PlanErrorResponse = {
  error: {
    code: string;
    message: string;
    retryable: boolean;
  };
};

function noStoreJson(body: PlanSuccessResponse | PlanErrorResponse, status: number) {
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

function demoPlan(
  brief: z.infer<typeof CreativeBriefSchema>,
  now?: string,
): PlanSuccessResponse | null {
  const started = Date.now();
  const workflow = planWorkflowFromBrief(brief, {
    mode: "demo",
    now: now ?? new Date().toISOString(),
  });
  const graph = validateWorkflowGraph(workflow);
  if (!graph.ok) {
    return null;
  }
  return {
    workflow,
    assistantMessage: plannerAssistantMessage(workflow, "demo"),
    activeMode: "demo",
    model: null,
    durationMs: Date.now() - started,
  };
}

export async function POST(request: Request) {
  const started = Date.now();

  try {
    const rate = consumeRateLimit(`plan:${clientKey(request)}`, {
      limit: 20,
      windowMs: 60_000,
    });
    if (!rate.allowed) {
      return errorResponse(
        "rate_limited",
        "Too many plan requests from this client. Wait a moment and try again. (In-memory prototype limiter — not distributed.)",
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
          "Request body must be 20KB or smaller.",
          false,
          413,
        );
      }
    }

    const rawText = await request.text();
    if (rawText.length > MAX_BODY_BYTES) {
      return errorResponse(
        "body_too_large",
        "Request body must be 20KB or smaller.",
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

    const parsed = PlanRequestSchema.safeParse(json);
    if (!parsed.success) {
      const message = parsed.error.issues
        .slice(0, 5)
        .map((i) => `${i.path.join(".") || "body"}: ${i.message}`)
        .join("; ");
      return errorResponse(
        "invalid_request",
        message || "Invalid plan request.",
        false,
        400,
      );
    }

    const { brief } = parsed.data;
    const config = getOllamaConfig();

    if (config.configuredMode === "demo") {
      const demo = demoPlan(brief);
      if (!demo) {
        return errorResponse(
          "internal_error",
          "Demo planner produced an invalid graph.",
          true,
          500,
        );
      }
      return noStoreJson(demo, 200);
    }

    const health = await checkOllamaHealth({ config });
    const ollamaReady = health.reachable && health.modelAvailable;
    const activeMode = await resolveActiveAiMode(config.configuredMode, async () => ollamaReady);

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
      const demo = demoPlan(brief);
      if (!demo) {
        return errorResponse(
          "internal_error",
          "Demo planner produced an invalid graph.",
          true,
          500,
        );
      }
      return noStoreJson(demo, 200);
    }

    try {
      const result = await planWorkflowWithOllama(brief, { config });
      return noStoreJson(
        {
          ...result,
          durationMs: Math.max(result.durationMs, Date.now() - started),
        },
        200,
      );
    } catch (error) {
      if (config.configuredMode === "auto" && isFallbackEligible(error)) {
        const demo = demoPlan(brief);
        if (!demo) {
          return errorResponse(
            "internal_error",
            "Demo planner produced an invalid graph.",
            true,
            500,
          );
        }
        return noStoreJson(demo, 200);
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

    console.error("[plan] unexpected_error", {
      name: error instanceof Error ? error.name : "unknown",
    });
    return errorResponse(
      "internal_error",
      "Unable to plan workflow.",
      true,
      500,
    );
  }
}
