import { NextResponse } from "next/server";
import { resolveActiveAiMode, type ActiveAiMode } from "@/lib/ai-mode";
import { checkOllamaHealth, getOllamaConfig, OllamaConfigError } from "@/lib/ollama";

export const dynamic = "force-dynamic";

export type OllamaHealthResponse = {
  configuredMode: "demo" | "ollama" | "auto";
  activeMode: ActiveAiMode | null;
  reachable: boolean;
  model: string | null;
  latencyMs: number | null;
  message: string;
};

function noStoreJson(body: OllamaHealthResponse, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export async function GET() {
  try {
    const config = getOllamaConfig();

    if (config.configuredMode === "demo") {
      return noStoreJson({
        configuredMode: "demo",
        activeMode: "demo",
        reachable: false,
        model: null,
        latencyMs: null,
        message:
          "Demo engine active. Ollama is not contacted when AI_MODE=demo (required for Vercel).",
      });
    }

    const health = await checkOllamaHealth({ config });
    const activeMode = await resolveActiveAiMode(
      config.configuredMode,
      async () => health.reachable && health.modelAvailable,
    );

    if (config.configuredMode === "ollama" && activeMode === null) {
      return noStoreJson({
        configuredMode: "ollama",
        activeMode: null,
        reachable: health.reachable,
        model: config.model,
        latencyMs: health.latencyMs,
        message: health.modelAvailable
          ? health.message
          : health.reachable
            ? health.message
            : `${health.message} AI_MODE=ollama requires a working local Ollama.`,
      });
    }

    return noStoreJson({
      configuredMode: config.configuredMode,
      activeMode: activeMode ?? "demo",
      reachable: health.reachable,
      model: config.model,
      latencyMs: health.latencyMs,
      message:
        activeMode === "demo"
          ? `${health.message} Falling back to the demo engine (AI_MODE=auto).`
          : health.message,
    });
  } catch (error) {
    const message =
      error instanceof OllamaConfigError
        ? error.message
        : "Unable to resolve Ollama configuration.";

    return noStoreJson(
      {
        configuredMode: "auto",
        activeMode: null,
        reachable: false,
        model: null,
        latencyMs: null,
        message,
      },
      500,
    );
  }
}
