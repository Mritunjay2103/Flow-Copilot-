import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { GET } from "@/app/api/health/ollama/route";
import {
  chatStructured,
  checkOllamaHealth,
  getOllamaConfig,
  OllamaClientError,
  OllamaConfigError,
} from "@/lib/ollama";

const SampleSchema = z.object({
  title: z.string(),
  count: z.number().int(),
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function configEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    AI_MODE: "ollama",
    OLLAMA_BASE_URL: "http://127.0.0.1:11434",
    OLLAMA_MODEL: "qwen3:4b",
    OLLAMA_TIMEOUT_MS: "120000",
    OLLAMA_KEEP_ALIVE: "10m",
    ...overrides,
  } as unknown as NodeJS.ProcessEnv;
}

describe("ollama config", () => {
  it("normalizes trailing slashes and defaults", () => {
    const config = getOllamaConfig(
      configEnv({
        OLLAMA_BASE_URL: "http://127.0.0.1:11434/",
        OLLAMA_MODEL: undefined,
        AI_MODE: undefined,
      }),
    );
    expect(config.baseUrl).toBe("http://127.0.0.1:11434");
    expect(config.model).toBe("qwen3:4b");
    expect(config.configuredMode).toBe("auto");
    expect(config.timeoutMs).toBe(120_000);
  });

  it("rejects non-http schemes", () => {
    expect(() =>
      getOllamaConfig(configEnv({ OLLAMA_BASE_URL: "file:///tmp/ollama" })),
    ).toThrow(OllamaConfigError);
  });
});

describe("checkOllamaHealth", () => {
  it("reports successful health when tags include the model", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        models: [{ name: "qwen3:4b" }],
      }),
    );
    const result = await checkOllamaHealth({
      config: getOllamaConfig(configEnv()),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.reachable).toBe(true);
    expect(result.modelAvailable).toBe(true);
    expect(result.message).toMatch(/reachable/i);
    expect(JSON.stringify(result)).not.toContain("127.0.0.1");
  });

  it("maps abort to timeout messaging", async () => {
    const fetchImpl = vi.fn(async () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    });
    const result = await checkOllamaHealth({
      config: getOllamaConfig(configEnv()),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.reachable).toBe(false);
    expect(result.message).toMatch(/did not respond in time/i);
  });

  it("maps network failure to unavailable messaging", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const result = await checkOllamaHealth({
      config: getOllamaConfig(configEnv()),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.reachable).toBe(false);
    expect(result.message).toMatch(/unreachable/i);
    expect(result.message).not.toContain("11434");
  });
});

describe("chatStructured", () => {
  it("validates a structured response", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        model: "qwen3:4b",
        message: { content: JSON.stringify({ title: "Demo", count: 2 }) },
      }),
    );

    const result = await chatStructured({
      messages: [{ role: "user", content: "plan" }],
      schema: SampleSchema,
      schemaName: "Sample",
      config: getOllamaConfig(configEnv()),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.data).toEqual({ title: "Demo", count: 2 });
    expect(result.repaired).toBe(false);
    expect(result.model).toBe("qwen3:4b");
    const callArgs = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(callArgs[1]?.body));
    expect(body.stream).toBe(false);
    expect(body.options.temperature).toBe(0);
    expect(body.format).toBeTruthy();
    expect(body.keep_alive).toBe("10m");
  });

  it("repairs malformed JSON on the first retry", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          message: { content: "not-json {{" },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          message: { content: JSON.stringify({ title: "Fixed", count: 1 }) },
        }),
      );

    const result = await chatStructured({
      messages: [{ role: "user", content: "plan" }],
      schema: SampleSchema,
      schemaName: "Sample",
      config: getOllamaConfig(configEnv()),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.repaired).toBe(true);
    expect(result.data.title).toBe("Fixed");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("fails after a second malformed response", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        message: { content: '{"title":1}' },
      }),
    );

    await expect(
      chatStructured({
        messages: [{ role: "user", content: "plan" }],
        schema: SampleSchema,
        schemaName: "Sample",
        config: getOllamaConfig(configEnv()),
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({
      code: "ollama_invalid_structured_output",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("throws sanitized upstream errors for non-2xx responses", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json(
        { error: "connection to http://127.0.0.1:11434 failed" },
        { status: 502 },
      ),
    );

    try {
      await chatStructured({
        messages: [{ role: "user", content: "plan" }],
        schema: SampleSchema,
        schemaName: "Sample",
        config: getOllamaConfig(configEnv()),
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(OllamaClientError);
      const client = (error as OllamaClientError).toClientError();
      expect(client.code).toBe("ollama_upstream_error");
      expect(client.message).not.toContain("127.0.0.1");
      expect(client.message).not.toContain("11434");
      expect(client.message).toContain("[redacted");
    }
  });
});

describe("GET /api/health/ollama", () => {
  it("skips network calls in demo mode and never exposes the base URL", async () => {
    vi.stubEnv("AI_MODE", "demo");
    vi.stubEnv("OLLAMA_BASE_URL", "http://127.0.0.1:11434");
    vi.stubEnv("OLLAMA_MODEL", "qwen3:4b");
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const response = await GET();
    const body = await response.json();

    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body.configuredMode).toBe("demo");
    expect(body.activeMode).toBe("demo");
    expect(body.reachable).toBe(false);
    expect(body.model).toBeNull();
    expect(JSON.stringify(body)).not.toContain("11434");
    expect(JSON.stringify(body)).not.toContain("127.0.0.1");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reports demo as active in auto mode when Ollama is unreachable", async () => {
    vi.stubEnv("AI_MODE", "auto");
    vi.stubEnv("OLLAMA_BASE_URL", "http://127.0.0.1:11434");
    vi.stubEnv("OLLAMA_MODEL", "qwen3:4b");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );

    const response = await GET();
    const body = await response.json();
    expect(body.configuredMode).toBe("auto");
    expect(body.activeMode).toBe("demo");
    expect(body.reachable).toBe(false);
    expect(body.message).toMatch(/demo engine/i);
    expect(JSON.stringify(body)).not.toContain("127.0.0.1");
  });

  it("reports actionable failure in ollama mode when unreachable", async () => {
    vi.stubEnv("AI_MODE", "ollama");
    vi.stubEnv("OLLAMA_BASE_URL", "http://127.0.0.1:11434");
    vi.stubEnv("OLLAMA_MODEL", "qwen3:4b");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );

    const response = await GET();
    const body = await response.json();
    expect(body.configuredMode).toBe("ollama");
    expect(body.activeMode).toBeNull();
    expect(body.reachable).toBe(false);
    expect(body.model).toBe("qwen3:4b");
    expect(body.message).toMatch(/ollama serve|unreachable/i);
    expect(JSON.stringify(body)).not.toContain("11434");
  });
});
