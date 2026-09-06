import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/agent/plan/route";
import {
  normalizePlannedWorkflow,
  WorkflowDraftSchema,
} from "@/lib/agent/planner";
import { resetRateLimitBuckets } from "@/lib/agent/rate-limit";
import { createMinimalValidWorkflow, createSneakerLaunchBrief } from "@/lib/workflow";
import { validateWorkflowGraph } from "@/lib/workflow";

beforeEach(() => {
  resetRateLimitBuckets();
});

afterEach(() => {
  resetRateLimitBuckets();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function briefBody(brief = createSneakerLaunchBrief()) {
  return JSON.stringify({ brief });
}

function jsonRequest(body: string, init?: RequestInit) {
  return new Request("http://localhost/api/agent/plan", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
    body,
    ...init,
  });
}

function validDraftFromFixture() {
  const wf = createMinimalValidWorkflow({ mode: "ollama" });
  return {
    ...wf,
    nodes: wf.nodes.map((n) => ({
      ...n,
      runtime: undefined,
    })),
  };
}

function cyclicDraft() {
  const wf = createMinimalValidWorkflow({ mode: "ollama" });
  return {
    ...wf,
    edges: [
      ...wf.edges,
      {
        id: "e_cycle",
        source: "output",
        target: "brief_analyzer",
        animated: false,
      },
    ],
  };
}

describe("normalizePlannedWorkflow", () => {
  it("overwrites schemaVersion, mode, brief, and unsafe ids", () => {
    const draft = WorkflowDraftSchema.parse({
      schemaVersion: 99,
      id: "1-bad",
      title: "T",
      objective: "O",
      nodes: [
        {
          id: "9input",
          kind: "brief_input",
          label: "Brief",
          description: "",
          position: { x: 0, y: 0 },
          config: { modelClass: "input", instruction: "x", enabled: true, settings: [] },
        },
        {
          id: "out",
          kind: "output",
          label: "Out",
          config: { modelClass: "output", instruction: "y", enabled: true, settings: [] },
        },
      ],
      edges: [{ id: "e1", source: "9input", target: "out", animated: false }],
    });

    const brief = createSneakerLaunchBrief();
    const normalized = normalizePlannedWorkflow(
      draft,
      brief,
      "ollama",
      "2026-09-06T12:00:00.000Z",
    );

    expect(normalized.schemaVersion).toBe(1);
    expect(normalized.mode).toBe("ollama");
    expect(normalized.brief).toEqual(brief);
    expect(normalized.id).toMatch(/^[a-zA-Z]/);
    expect(normalized.nodes.every((n) => /^[a-zA-Z]/.test(n.id))).toBe(true);
    expect(validateWorkflowGraph(normalized)).toEqual({ ok: true });
  });
});

describe("POST /api/agent/plan", () => {
  it("rejects invalid requests and unexpected fields", async () => {
    vi.stubEnv("AI_MODE", "demo");
    const res = await POST(
      jsonRequest(JSON.stringify({ brief: { objective: "x" }, extra: true })),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("invalid_request");
    expect(body.error.retryable).toBe(false);
  });

  it("rejects bodies larger than 20KB", async () => {
    vi.stubEnv("AI_MODE", "demo");
    const huge = "x".repeat(21 * 1024);
    const res = await POST(
      jsonRequest(
        JSON.stringify({
          brief: {
            ...createSneakerLaunchBrief(),
            objective: huge,
          },
        }),
      ),
    );
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error.code).toBe("body_too_large");
  });

  it("plans with the demo engine", async () => {
    vi.stubEnv("AI_MODE", "demo");
    const res = await POST(jsonRequest(briefBody()));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = await res.json();
    expect(body.activeMode).toBe("demo");
    expect(body.model).toBeNull();
    expect(body.workflow.mode).toBe("demo");
    expect(validateWorkflowGraph(body.workflow)).toEqual({ ok: true });
    expect(body.assistantMessage).toMatch(/demo engine/i);
  });

  it("plans with Ollama on success", async () => {
    vi.stubEnv("AI_MODE", "ollama");
    vi.stubEnv("OLLAMA_BASE_URL", "http://127.0.0.1:11434");
    vi.stubEnv("OLLAMA_MODEL", "qwen3:4b");

    const draft = validDraftFromFixture();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/tags")) {
          return Response.json({ models: [{ name: "qwen3:4b" }] });
        }
        return Response.json({
          model: "qwen3:4b",
          message: { content: JSON.stringify(draft) },
        });
      }),
    );

    const res = await POST(jsonRequest(briefBody()));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.activeMode).toBe("ollama");
    expect(body.model).toBe("qwen3:4b");
    expect(body.workflow.mode).toBe("ollama");
    expect(validateWorkflowGraph(body.workflow)).toEqual({ ok: true });
    expect(JSON.stringify(body)).not.toContain("127.0.0.1");
  });

  it("falls back to demo in auto mode for unavailable Ollama", async () => {
    vi.stubEnv("AI_MODE", "auto");
    vi.stubEnv("OLLAMA_BASE_URL", "http://127.0.0.1:11434");
    vi.stubEnv("OLLAMA_MODEL", "qwen3:4b");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );

    const res = await POST(jsonRequest(briefBody()));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.activeMode).toBe("demo");
    expect(body.model).toBeNull();
    expect(validateWorkflowGraph(body.workflow)).toEqual({ ok: true });
  });

  it("repairs an invalid Ollama graph once", async () => {
    vi.stubEnv("AI_MODE", "ollama");
    vi.stubEnv("OLLAMA_BASE_URL", "http://127.0.0.1:11434");
    vi.stubEnv("OLLAMA_MODEL", "qwen3:4b");

    const bad = cyclicDraft();
    const good = validDraftFromFixture();
    let chatCalls = 0;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/api/tags")) {
          return Response.json({ models: [{ name: "qwen3:4b" }] });
        }
        if (url.includes("/api/chat")) {
          chatCalls += 1;
          // First chatStructured call may include an internal JSON repair; count top-level chat posts.
          const isRepair =
            typeof init?.body === "string" &&
            init.body.includes("graph invariant");
          return Response.json({
            model: "qwen3:4b",
            message: {
              content: JSON.stringify(isRepair || chatCalls > 1 ? good : bad),
            },
          });
        }
        return new Response("not found", { status: 404 });
      }),
    );

    const res = await POST(jsonRequest(briefBody()));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.activeMode).toBe("ollama");
    expect(validateWorkflowGraph(body.workflow)).toEqual({ ok: true });
    expect(chatCalls).toBeGreaterThanOrEqual(2);
  });

  it("does not fall back in auto mode for invalid structured output", async () => {
    vi.stubEnv("AI_MODE", "auto");
    vi.stubEnv("OLLAMA_BASE_URL", "http://127.0.0.1:11434");
    vi.stubEnv("OLLAMA_MODEL", "qwen3:4b");

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/tags")) {
          return Response.json({ models: [{ name: "qwen3:4b" }] });
        }
        return Response.json({
          model: "qwen3:4b",
          message: { content: '{"not":"a workflow"}' },
        });
      }),
    );

    const res = await POST(jsonRequest(briefBody()));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error.code).toBe("ollama_invalid_structured_output");
    expect(body.error.retryable).toBe(true);
    expect(JSON.stringify(body)).not.toContain("11434");
  });

  it("returns sanitized errors in ollama mode when unreachable", async () => {
    vi.stubEnv("AI_MODE", "ollama");
    vi.stubEnv("OLLAMA_BASE_URL", "http://127.0.0.1:11434");
    vi.stubEnv("OLLAMA_MODEL", "qwen3:4b");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );

    const res = await POST(jsonRequest(briefBody()));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error.retryable).toBe(true);
    expect(JSON.stringify(body)).not.toContain("127.0.0.1");
    expect(JSON.stringify(body)).not.toContain("11434");
  });
});
