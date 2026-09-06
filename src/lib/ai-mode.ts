/**
 * AI operating modes for Flow Copilot.
 *
 * - demo: always use the deterministic interactive demo engine (no Ollama calls).
 * - ollama: require Ollama; callers must surface a useful error if unavailable.
 * - auto: use Ollama when reachable, otherwise fall back to demo.
 *
 * Vercel / public deployments must set AI_MODE=demo explicitly. A hosted
 * deployment cannot reach Ollama on a developer laptop.
 *
 * OLLAMA_BASE_URL and OLLAMA_MODEL must never be exposed via NEXT_PUBLIC_*.
 */

export type ConfiguredAiMode = "demo" | "ollama" | "auto";
export type ActiveAiMode = "demo" | "ollama";

export const AI_MODES = ["demo", "ollama", "auto"] as const;

export function parseConfiguredAiMode(
  value: string | undefined | null,
): ConfiguredAiMode {
  const normalized = (value ?? "auto").trim().toLowerCase();
  if (normalized === "demo" || normalized === "ollama" || normalized === "auto") {
    return normalized;
  }
  return "auto";
}

/**
 * Resolve which engine should handle a request.
 * Pass a reachability probe when configured mode is `auto` or `ollama`.
 * For `ollama`, this returns "ollama" only when reachable; otherwise null
 * so the caller can return an actionable error (do not silently fall back).
 */
export async function resolveActiveAiMode(
  configured: ConfiguredAiMode,
  isOllamaReachable: () => Promise<boolean>,
): Promise<ActiveAiMode | null> {
  if (configured === "demo") {
    return "demo";
  }

  if (configured === "ollama") {
    const reachable = await isOllamaReachable();
    return reachable ? "ollama" : null;
  }

  // auto
  const reachable = await isOllamaReachable();
  return reachable ? "ollama" : "demo";
}

export function describeAiMode(configured: ConfiguredAiMode): string {
  switch (configured) {
    case "demo":
      return "Deterministic demo engine only. Suitable for Vercel and public demos.";
    case "ollama":
      return "Requires a reachable local Ollama server. Fails with a clear error if unavailable.";
    case "auto":
      return "Uses Ollama when reachable; otherwise falls back to the demo engine.";
  }
}
