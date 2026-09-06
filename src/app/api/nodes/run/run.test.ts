import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/nodes/run/route";
import { resetRateLimitBuckets } from "@/lib/agent/rate-limit";
import {
  createIdleRuntime,
  createMinimalValidWorkflow,
  createSneakerLaunchBrief,
} from "@/lib/workflow";

beforeEach(() => {
  resetRateLimitBuckets();
});

afterEach(() => {
  resetRateLimitBuckets();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function runRequest(body: unknown) {
  return new Request("http://localhost/api/nodes/run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/nodes/run", () => {
  it("executes a text node in demo mode", async () => {
    vi.stubEnv("AI_MODE", "demo");
    const wf = createMinimalValidWorkflow();
    const node = wf.nodes.find((n) => n.kind === "brief_analyzer")!;
    const res = await POST(
      runRequest({
        workflowContext: {
          workflowId: wf.id,
          title: wf.title,
          brief: wf.brief,
          mode: "demo",
        },
        node,
        upstreamOutputs: [],
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = await res.json();
    expect(body.activeMode).toBe("demo");
    expect(body.status).toBe("completed");
    expect(body.model).toBeNull();
    expect(body.result.summary).toMatch(/HexPulse|analysis/i);
  });

  it("returns brief_input without LLM and ignores provider URLs", async () => {
    vi.stubEnv("AI_MODE", "demo");
    const wf = createMinimalValidWorkflow();
    const node = {
      ...wf.nodes[0]!,
      config: {
        ...wf.nodes[0]!.config,
        settings: [
          { key: "provider_url", value: "http://evil.example/ollama" },
          { key: "note", value: "ok" },
        ],
      },
    };
    const res = await POST(
      runRequest({
        workflowContext: {
          workflowId: wf.id,
          title: wf.title,
          brief: createSneakerLaunchBrief(),
          mode: "demo",
        },
        node,
        upstreamOutputs: [],
      }),
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.result.artifacts[0]?.content).toContain("HexPulse");
    expect(JSON.stringify(body)).not.toContain("evil.example");
  });

  it("returns needs_provider placeholders for media nodes", async () => {
    vi.stubEnv("AI_MODE", "demo");
    const brief = createSneakerLaunchBrief();
    const node = {
      id: "image_generator",
      kind: "image_generator" as const,
      label: "Image generation",
      description: "placeholder",
      position: { x: 0, y: 0 },
      config: {
        modelClass: "image" as const,
        instruction: "generate",
        enabled: true,
        settings: [],
      },
      runtime: createIdleRuntime(),
      locked: false,
    };
    const res = await POST(
      runRequest({
        workflowContext: {
          workflowId: "wf_x",
          title: "T",
          brief,
          mode: "demo",
        },
        node,
        upstreamOutputs: [],
      }),
    );
    const body = await res.json();
    expect(body.status).toBe("needs_provider");
    expect(body.result.artifacts.every((a: { simulated: boolean }) => a.simulated)).toBe(
      true,
    );
    expect(body.result.warnings.join(" ")).toMatch(/provider is not connected/i);
  });

  it("rejects disabled nodes", async () => {
    vi.stubEnv("AI_MODE", "demo");
    const wf = createMinimalValidWorkflow();
    const node = {
      ...wf.nodes[1]!,
      config: { ...wf.nodes[1]!.config, enabled: false },
    };
    const res = await POST(
      runRequest({
        workflowContext: {
          workflowId: wf.id,
          title: wf.title,
          brief: wf.brief,
          mode: "demo",
        },
        node,
        upstreamOutputs: [],
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("node_disabled");
  });

  it("rejects oversized bodies", async () => {
    vi.stubEnv("AI_MODE", "demo");
    const huge = "x".repeat(41 * 1024);
    const res = await POST(runRequest({ pad: huge }));
    expect(res.status).toBe(413);
  });
});
