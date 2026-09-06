import "server-only";

import { z } from "zod";
import { getOllamaConfig, type OllamaConfig } from "./config";

export type OllamaErrorCode =
  | "ollama_unavailable"
  | "ollama_timeout"
  | "ollama_missing_model"
  | "ollama_invalid_structured_output"
  | "ollama_upstream_error"
  | "ollama_config_invalid";

export class OllamaClientError extends Error {
  readonly code: OllamaErrorCode;
  readonly retryable: boolean;
  readonly status?: number;

  constructor(
    code: OllamaErrorCode,
    message: string,
    options?: { retryable?: boolean; status?: number; cause?: unknown },
  ) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = "OllamaClientError";
    this.code = code;
    this.retryable = options?.retryable ?? false;
    this.status = options?.status;
  }

  /** Client-safe payload — never includes base URL, stacks, or raw thinking. */
  toClientError(): { code: string; message: string; retryable: boolean } {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
    };
  }
}

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatStructuredResult<T> = {
  data: T;
  model: string;
  durationMs: number;
  repaired: boolean;
};

type FetchLike = typeof fetch;

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof Error && error.name === "AbortError") ||
    (typeof DOMException !== "undefined" &&
      error instanceof DOMException &&
      error.name === "AbortError")
  );
}

function sanitizeUpstreamMessage(raw: string): string {
  // Never echo hostnames/URLs from upstream payloads
  return raw
    .replace(/https?:\/\/[^\s"'<>]+/gi, "[redacted-url]")
    .replace(/\b127\.0\.0\.1(?::\d+)?\b/g, "[redacted-host]")
    .replace(/\blocalhost(?::\d+)?\b/gi, "[redacted-host]")
    .slice(0, 400);
}

function logSafeMeta(event: string, meta: Record<string, string | number | boolean>) {
  // Avoid logging briefs, prompts, or model outputs
  console.info(`[ollama] ${event}`, meta);
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  fetchImpl: FetchLike,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (isAbortError(error)) {
      throw new OllamaClientError(
        "ollama_timeout",
        "Ollama did not respond in time. Check that ollama serve is running and try again.",
        { retryable: true, cause: error },
      );
    }
    throw new OllamaClientError(
      "ollama_unavailable",
      "Ollama is unreachable. Start it with `ollama serve`, then retry.",
      { retryable: true, cause: error },
    );
  } finally {
    clearTimeout(timer);
  }
}

function modelListed(models: unknown, wanted: string): boolean {
  if (!Array.isArray(models)) return false;
  const wantedBase = wanted.split(":")[0] ?? wanted;
  return models.some((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const name = "name" in entry ? String((entry as { name: unknown }).name) : "";
    const model = "model" in entry ? String((entry as { model: unknown }).model) : "";
    return (
      name === wanted ||
      model === wanted ||
      name.startsWith(`${wantedBase}:`) ||
      name === wantedBase
    );
  });
}

export async function checkOllamaHealth(options?: {
  config?: OllamaConfig;
  fetchImpl?: FetchLike;
}): Promise<{
  reachable: boolean;
  model: string;
  modelAvailable: boolean;
  latencyMs: number;
  message: string;
}> {
  const config = options?.config ?? getOllamaConfig();
  const fetchImpl = options?.fetchImpl ?? fetch;
  const started = Date.now();

  try {
    const response = await fetchWithTimeout(
      `${config.baseUrl}/api/tags`,
      { method: "GET", headers: { Accept: "application/json" } },
      config.healthTimeoutMs,
      fetchImpl,
    );
    const latencyMs = Date.now() - started;

    if (!response.ok) {
      logSafeMeta("health_upstream_error", {
        status: response.status,
        latencyMs,
        model: config.model,
      });
      return {
        reachable: false,
        model: config.model,
        modelAvailable: false,
        latencyMs,
        message: `Ollama health check failed (HTTP ${response.status}).`,
      };
    }

    const body = (await response.json()) as { models?: unknown };
    const modelAvailable = modelListed(body.models, config.model);
    logSafeMeta("health_ok", {
      latencyMs,
      model: config.model,
      modelAvailable,
    });

    return {
      reachable: true,
      model: config.model,
      modelAvailable,
      latencyMs,
      message: modelAvailable
        ? `Ollama reachable with model ${config.model}.`
        : `Ollama reachable, but model ${config.model} was not found. Run: ollama pull ${config.model}`,
    };
  } catch (error) {
    const latencyMs = Date.now() - started;
    if (error instanceof OllamaClientError) {
      logSafeMeta("health_error", {
        code: error.code,
        latencyMs,
        model: config.model,
      });
      return {
        reachable: false,
        model: config.model,
        modelAvailable: false,
        latencyMs,
        message: error.message,
      };
    }
    return {
      reachable: false,
      model: config.model,
      modelAvailable: false,
      latencyMs,
      message: "Ollama is unreachable. Start it with `ollama serve`, then retry.",
    };
  }
}

function extractJsonContent(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return trimmed;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return trimmed;
}

async function postChat(params: {
  config: OllamaConfig;
  messages: ChatMessage[];
  format: Record<string, unknown>;
  fetchImpl: FetchLike;
}): Promise<{ content: string; model: string; durationMs: number }> {
  const { config, messages, format, fetchImpl } = params;
  const started = Date.now();

  const response = await fetchWithTimeout(
    `${config.baseUrl}/api/chat`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        model: config.model,
        messages,
        stream: false,
        format,
        keep_alive: config.keepAlive,
        options: { temperature: 0 },
      }),
    },
    config.timeoutMs,
    fetchImpl,
  );

  const durationMs = Date.now() - started;

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const errBody = (await response.json()) as { error?: string };
      if (errBody.error) detail = sanitizeUpstreamMessage(errBody.error);
    } catch {
      // ignore body parse
    }

    if (response.status === 404 || /not found|pull/i.test(detail)) {
      throw new OllamaClientError(
        "ollama_missing_model",
        `Model ${config.model} is not available. Run: ollama pull ${config.model}`,
        { retryable: true, status: response.status },
      );
    }

    throw new OllamaClientError(
      "ollama_upstream_error",
      `Ollama request failed: ${detail}`,
      { retryable: response.status >= 500, status: response.status },
    );
  }

  const body = (await response.json()) as {
    message?: { content?: string; thinking?: unknown };
    model?: string;
    error?: string;
  };

  if (body.error) {
    throw new OllamaClientError(
      "ollama_upstream_error",
      `Ollama request failed: ${sanitizeUpstreamMessage(body.error)}`,
      { retryable: true },
    );
  }

  const content = body.message?.content;
  if (typeof content !== "string" || content.trim() === "") {
    throw new OllamaClientError(
      "ollama_invalid_structured_output",
      "Ollama returned an empty structured response.",
      { retryable: true },
    );
  }

  // Intentionally ignore body.message.thinking — never request or forward it.
  logSafeMeta("chat_ok", {
    model: body.model ?? config.model,
    durationMs,
    contentChars: content.length,
  });

  return {
    content,
    model: body.model ?? config.model,
    durationMs,
  };
}

function parseAndValidate<T>(
  content: string,
  schema: z.ZodType<T>,
): { ok: true; data: T } | { ok: false; issue: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonContent(content));
  } catch {
    return { ok: false, issue: "Response was not valid JSON." };
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    const issue = result.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    return { ok: false, issue: issue || "Schema validation failed." };
  }
  return { ok: true, data: result.data };
}

/**
 * Call Ollama /api/chat with JSON Schema structured outputs and Zod validation.
 * Performs at most one repair retry on parse/validation failure.
 */
export async function chatStructured<T>(params: {
  messages: ChatMessage[];
  schema: z.ZodType<T>;
  schemaName: string;
  config?: OllamaConfig;
  fetchImpl?: FetchLike;
  jsonSchema?: Record<string, unknown>;
}): Promise<ChatStructuredResult<T>> {
  const config = params.config ?? getOllamaConfig();
  const fetchImpl = params.fetchImpl ?? fetch;
  const format =
    params.jsonSchema ??
    (z.toJSONSchema(params.schema) as Record<string, unknown>);

  const schemaInstruction = [
    `Return only valid JSON matching this schema (${params.schemaName}).`,
    "Do not include markdown fences, commentary, or thinking.",
    JSON.stringify(format),
  ].join("\n");

  const baseMessages: ChatMessage[] = [
    ...params.messages,
    { role: "user", content: schemaInstruction },
  ];

  const first = await postChat({
    config,
    messages: baseMessages,
    format,
    fetchImpl,
  });

  const firstParsed = parseAndValidate(first.content, params.schema);
  if (firstParsed.ok) {
    return {
      data: firstParsed.data,
      model: first.model,
      durationMs: first.durationMs,
      repaired: false,
    };
  }

  logSafeMeta("chat_repair", {
    model: first.model,
    issueChars: firstParsed.issue.length,
  });

  const repairMessages: ChatMessage[] = [
    ...baseMessages,
    { role: "assistant", content: first.content },
    {
      role: "user",
      content: [
        "Your previous response failed validation.",
        `Issue: ${firstParsed.issue}`,
        "Return only corrected JSON matching the schema. No commentary.",
      ].join("\n"),
    },
  ];

  const second = await postChat({
    config,
    messages: repairMessages,
    format,
    fetchImpl,
  });

  const secondParsed = parseAndValidate(second.content, params.schema);
  if (!secondParsed.ok) {
    throw new OllamaClientError(
      "ollama_invalid_structured_output",
      "Ollama returned JSON that did not match the required schema after one repair attempt.",
      { retryable: true },
    );
  }

  return {
    data: secondParsed.data,
    model: second.model,
    durationMs: first.durationMs + second.durationMs,
    repaired: true,
  };
}
