import "server-only";

import {
  parseConfiguredAiMode,
  type ConfiguredAiMode,
} from "@/lib/ai-mode";

export type OllamaConfig = {
  configuredMode: ConfiguredAiMode;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  keepAlive: string;
  healthTimeoutMs: number;
};

const DEFAULT_BASE_URL = "http://127.0.0.1:11434";
const DEFAULT_MODEL = "qwen3:4b";
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_KEEP_ALIVE = "10m";
const DEFAULT_HEALTH_TIMEOUT_MS = 3_000;

export class OllamaConfigError extends Error {
  readonly code = "ollama_config_invalid" as const;

  constructor(message: string) {
    super(message);
    this.name = "OllamaConfigError";
  }
}

function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new OllamaConfigError("OLLAMA_BASE_URL must be a valid URL.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new OllamaConfigError("OLLAMA_BASE_URL must use http or https.");
  }
  // Strip trailing slash from origin+pathname without leaking to clients
  return `${parsed.origin}${parsed.pathname === "/" ? "" : parsed.pathname}`.replace(
    /\/+$/,
    "",
  );
}

function parseTimeoutMs(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_TIMEOUT_MS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1_000 || n > 600_000) {
    throw new OllamaConfigError(
      "OLLAMA_TIMEOUT_MS must be a number between 1000 and 600000.",
    );
  }
  return Math.floor(n);
}

/**
 * Server-only Ollama configuration. Never import this module from client components.
 * Never expose baseUrl in API responses.
 */
export function getOllamaConfig(
  env: NodeJS.ProcessEnv = process.env,
): OllamaConfig {
  const configuredMode = parseConfiguredAiMode(env.AI_MODE);
  const baseUrl = normalizeBaseUrl(env.OLLAMA_BASE_URL || DEFAULT_BASE_URL);
  const model = (env.OLLAMA_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  if (model.length > 120) {
    throw new OllamaConfigError("OLLAMA_MODEL is too long.");
  }
  const timeoutMs = parseTimeoutMs(env.OLLAMA_TIMEOUT_MS);
  const keepAlive = (env.OLLAMA_KEEP_ALIVE || DEFAULT_KEEP_ALIVE).trim() || DEFAULT_KEEP_ALIVE;

  return {
    configuredMode,
    baseUrl,
    model,
    timeoutMs,
    keepAlive,
    healthTimeoutMs: DEFAULT_HEALTH_TIMEOUT_MS,
  };
}
