import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/agent/edit/route";
import { resetRateLimitBuckets } from "@/lib/agent/rate-limit";
import {
  createBranchedHookWorkflow,
  createMinimalValidWorkflow,
  validateWorkflowGraph,
} from "@/lib/workflow";

beforeEach(() => {
  resetRateLimitBuckets();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetRateLimitBuckets();
});

function editRequest(
  body: unknown,
  headers?: Record<string, string>,
) {
  return new Request("http://localhost/api/agent/edit", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/agent/edit", () => {
  it("adds a node via demo operations and bumps version once", async () => {
    vi.stubEnv("AI_MODE", "demo");
    const workflow = createMinimalValidWorkflow();
    const res = await POST(
      editRequest({ workflow, message: "add captions" }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = await res.json();
    expect(body.activeMode).toBe("demo");
    expect(body.edit.operations.some((op: { type: string }) => op.type === "add_node")).toBe(
      true,
    );
    expect(body.workflow.nodes.some((n: { kind: string }) => n.kind === "subtitle")).toBe(
      true,
    );
    expect(body.workflow.version).toBe(workflow.version + 1);
    expect(validateWorkflowGraph(body.workflow)).toEqual({ ok: true });
    // Unchanged node IDs preserved
    expect(body.workflow.nodes.map((n: { id: string }) => n.id)).toEqual(
      expect.arrayContaining(["brief_input", "brief_analyzer", "output"]),
    );
  });

  it("removes a node with cascading edge repair", async () => {
    vi.stubEnv("AI_MODE", "demo");
    const workflow = createBranchedHookWorkflow();
    const res = await POST(
      editRequest({ workflow, message: "remove hook variants" }),
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.workflow.nodes.some((n: { id: string }) => n.id === "hook_variants")).toBe(
      false,
    );
    expect(
      body.workflow.edges.some(
        (e: { source: string; target: string }) =>
          e.source === "hook_variants" || e.target === "hook_variants",
      ),
    ).toBe(false);
    expect(validateWorkflowGraph(body.workflow)).toEqual({ ok: true });
  });

  it("replaces voice-over with subtitles", async () => {
    vi.stubEnv("AI_MODE", "demo");
    const base = createBranchedHookWorkflow();
    // Ensure voiceover exists by editing first
    const withVo = await POST(
      editRequest({ workflow: base, message: "add voice-over" }),
    );
    const voiced = await withVo.json();
    expect(voiced.workflow.nodes.some((n: { kind: string }) => n.kind === "voiceover")).toBe(
      true,
    );

    const res = await POST(
      editRequest({
        workflow: voiced.workflow,
        message: "replace voice-over with subtitles",
      }),
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.workflow.nodes.some((n: { kind: string }) => n.kind === "voiceover")).toBe(
      false,
    );
    expect(body.workflow.nodes.some((n: { kind: string }) => n.kind === "subtitle")).toBe(
      true,
    );
    expect(validateWorkflowGraph(body.workflow)).toEqual({ ok: true });
  });

  it("updates workflow metadata", async () => {
    vi.stubEnv("AI_MODE", "demo");
    const workflow = createMinimalValidWorkflow();
    const res = await POST(
      editRequest({ workflow, message: "make it cinematic" }),
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.edit.operations[0]?.type).toBe("update_workflow_metadata");
    expect(body.workflow.brief.tone).toBe("cinematic");
    expect(body.workflow.version).toBe(workflow.version + 1);
  });

  it("rejects removing a locked node (no destructive apply)", async () => {
    vi.stubEnv("AI_MODE", "demo");
    const workflow = createMinimalValidWorkflow();
    // Demo editor should refuse ambiguous/unsafe brief removal
    const res = await POST(
      editRequest({ workflow, message: "remove the brief" }),
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.edit.operations).toHaveLength(0);
    expect(body.workflow.version).toBe(workflow.version);
    expect(body.workflow.nodes.some((n: { id: string }) => n.id === "brief_input")).toBe(
      true,
    );
  });

  it("rejects nonexistent node operations from Ollama after repair failure", async () => {
    vi.stubEnv("AI_MODE", "ollama");
    vi.stubEnv("OLLAMA_BASE_URL", "http://127.0.0.1:11434");
    vi.stubEnv("OLLAMA_MODEL", "qwen3:4b");

    const badEdit = {
      assistantMessage: "Removed missing node",
      intentSummary: "remove",
      operations: [
        {
          type: "remove_node",
          reason: "drop",
          nodeId: "does_not_exist",
        },
      ],
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/tags")) {
          return Response.json({ models: [{ name: "qwen3:4b" }] });
        }
        return Response.json({
          model: "qwen3:4b",
          message: { content: JSON.stringify(badEdit) },
        });
      }),
    );

    const res = await POST(
      editRequest({
        workflow: createMinimalValidWorkflow({ mode: "ollama" }),
        message: "remove ghost node",
      }),
    );
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error.code).toBe("ollama_invalid_structured_output");
    expect(JSON.stringify(body)).not.toContain("127.0.0.1");
  });

  it("returns ambiguous zero-operation response without version bump", async () => {
    vi.stubEnv("AI_MODE", "demo");
    const workflow = createMinimalValidWorkflow();
    const res = await POST(
      editRequest({ workflow, message: "do something mysterious" }),
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.edit.operations).toHaveLength(0);
    expect(body.workflow.version).toBe(workflow.version);
    expect(body.edit.assistantMessage.toLowerCase()).toContain("no changes were made");
  });

  it("rejects incoming graphs that contain cycles", async () => {
    vi.stubEnv("AI_MODE", "demo");
    const workflow = createMinimalValidWorkflow();
    const cyclic = {
      ...workflow,
      edges: [
        ...workflow.edges,
        {
          id: "e_cycle",
          source: "output",
          target: "brief_analyzer",
          animated: false,
        },
      ],
    };
    const res = await POST(
      editRequest({ workflow: cyclic, message: "add music" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("invalid_graph");
  });

  it("falls back to demo in auto mode when Ollama is unavailable", async () => {
    vi.stubEnv("AI_MODE", "auto");
    vi.stubEnv("OLLAMA_BASE_URL", "http://127.0.0.1:11434");
    vi.stubEnv("OLLAMA_MODEL", "qwen3:4b");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );

    const workflow = createMinimalValidWorkflow();
    const res = await POST(
      editRequest({ workflow, message: "add music" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.activeMode).toBe("demo");
    expect(body.workflow.nodes.some((n: { kind: string }) => n.kind === "music")).toBe(
      true,
    );
  });

  it("does not bump version on no-op edits", async () => {
    vi.stubEnv("AI_MODE", "demo");
    const workflow = createMinimalValidWorkflow();
    // Already 9:16 in sneaker brief
    const res = await POST(
      editRequest({ workflow, message: "make it 9:16" }),
    );
    const body = await res.json();
    expect(body.edit.operations).toHaveLength(0);
    expect(body.workflow.version).toBe(workflow.version);
    expect(body.workflow).toEqual(workflow);
  });

  it("enforces the in-memory request limiter", async () => {
    vi.stubEnv("AI_MODE", "demo");
    const workflow = createMinimalValidWorkflow();
    const headers = { "x-forwarded-for": "203.0.113.10" };

    let limited = false;
    for (let i = 0; i < 35; i += 1) {
      const res = await POST(
        editRequest({ workflow, message: "add music" }, headers),
      );
      if (res.status === 429) {
        limited = true;
        const body = await res.json();
        expect(body.error.code).toBe("rate_limited");
        expect(body.error.message).toMatch(/not distributed/i);
        break;
      }
    }
    expect(limited).toBe(true);
  });

  it("applies a valid Ollama edit without trusting a replacement graph", async () => {
    vi.stubEnv("AI_MODE", "ollama");
    vi.stubEnv("OLLAMA_BASE_URL", "http://127.0.0.1:11434");
    vi.stubEnv("OLLAMA_MODEL", "qwen3:4b");

    const workflow = createMinimalValidWorkflow({ mode: "ollama" });
    const edit = {
      assistantMessage: "I'll update the tone to cinematic.",
      intentSummary: "Set tone",
      operations: [
        {
          type: "update_workflow_metadata",
          reason: "Set tone to cinematic",
          patch: { brief: { tone: "cinematic" } },
        },
      ],
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/tags")) {
          return Response.json({ models: [{ name: "qwen3:4b" }] });
        }
        return Response.json({
          model: "qwen3:4b",
          message: { content: JSON.stringify(edit) },
        });
      }),
    );

    const res = await POST(
      editRequest({ workflow, message: "make it cinematic" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.activeMode).toBe("ollama");
    expect(body.model).toBe("qwen3:4b");
    expect(body.edit.operations).toHaveLength(1);
    expect(body.workflow.brief.tone).toBe("cinematic");
    expect(body.workflow.nodes.map((n: { id: string }) => n.id)).toEqual(
      workflow.nodes.map((n) => n.id),
    );
  });
});
