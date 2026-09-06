import { describe, expect, it } from "vitest";
import {
  computeExecutionProgress,
  orchestrateWorkflowExecution,
  retryFailedNode,
  type RunNodeTransport,
} from "@/lib/workflow/execution-orchestrator";
import {
  createBranchedHookWorkflow,
  createIdleRuntime,
  createMinimalValidWorkflow,
  type NodeExecutionResult,
  type Workflow,
} from "@/lib/workflow";

function okResult(summary: string): NodeExecutionResult {
  return {
    summary,
    artifacts: [
      {
        id: "art",
        name: "Artifact",
        type: "text/plain",
        content: summary,
        simulated: false,
      },
    ],
    decisions: [],
    warnings: [],
  };
}

function mockTransport(handlers: {
  failIds?: Set<string>;
  delayMs?: number;
  mediaIds?: Set<string>;
}): RunNodeTransport {
  return async ({ node, signal }) => {
    if (signal?.aborted) {
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    }
    if (handlers.delayMs) {
      await new Promise((r) => setTimeout(r, handlers.delayMs));
    }
    if (signal?.aborted) {
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    }
    if (handlers.failIds?.has(node.id)) {
      throw new Error(`boom:${node.id}`);
    }
    if (handlers.mediaIds?.has(node.id)) {
      return {
        result: {
          summary: "simulated",
          artifacts: [
            {
              id: "sim",
              name: "Sim",
              type: "text/plain",
              content: "x",
              simulated: true,
            },
          ],
          decisions: [],
          warnings: ["provider not connected"],
        },
        status: "needs_provider",
        activeMode: "demo",
        model: null,
        durationMs: 5,
      };
    }
    return {
      result: okResult(`done:${node.id}`),
      status: "completed",
      activeMode: "demo",
      model: null,
      durationMs: 10,
    };
  };
}

describe("execution orchestrator", () => {
  it("runs a linear workflow without mutating the original", async () => {
    const original = createMinimalValidWorkflow();
    const snapshot = structuredClone(original);
    const updates: Workflow[] = [];

    const result = await orchestrateWorkflowExecution({
      workflow: original,
      transport: mockTransport({}),
      onUpdate: (wf) => updates.push(wf),
    });

    expect(original).toEqual(snapshot);
    expect(result).not.toBe(original);
    expect(result.nodes.every((n) => n.runtime.status === "completed")).toBe(true);
    expect(updates.length).toBeGreaterThan(0);
    const progress = computeExecutionProgress(result);
    expect(progress.ratio).toBe(1);
    expect(progress.completedTerminal).toBe(progress.enabledCount);
  });

  it("executes parallel branches in the same level", async () => {
    const workflow = createBranchedHookWorkflow();
    const started: string[] = [];
    const transport: RunNodeTransport = async ({ node }) => {
      started.push(node.id);
      await new Promise((r) => setTimeout(r, 20));
      return {
        result: okResult(node.id),
        status: "completed",
        activeMode: "demo",
        model: null,
        durationMs: 20,
      };
    };

    const result = await orchestrateWorkflowExecution({ workflow, transport });
    expect(result.nodes.every((n) => n.runtime.status === "completed")).toBe(true);

    // script_writer and hook_variants share a level — both should have been requested
    expect(started).toContain("script_writer");
    expect(started).toContain("hook_variants");
  });

  it("skips dependents after failure but continues unrelated branches", async () => {
    const workflow = createBranchedHookWorkflow();
    const result = await orchestrateWorkflowExecution({
      workflow,
      transport: mockTransport({ failIds: new Set(["script_writer"]) }),
    });

    const byId = Object.fromEntries(result.nodes.map((n) => [n.id, n.runtime.status]));
    expect(byId.script_writer).toBe("failed");
    // brand_validator depends on script_writer AND hook_variants — skipped due to failed upstream
    expect(byId.brand_validator).toBe("skipped");
    expect(byId.output).toBe("skipped");
    // unrelated branch through hooks should still complete
    expect(byId.hook_variants).toBe("completed");
    expect(byId.brief_analyzer).toBe("completed");
  });

  it("supports abort via AbortSignal", async () => {
    const workflow = createMinimalValidWorkflow();
    const controller = new AbortController();
    const transport = mockTransport({ delayMs: 50 });

    const promise = orchestrateWorkflowExecution({
      workflow,
      transport,
      signal: controller.signal,
    });
    controller.abort();

    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  });

  it("retries a failed node when upstream is ready", async () => {
    const workflow = createMinimalValidWorkflow();
    // Simulate prior failure on analyzer
    workflow.nodes = workflow.nodes.map((n) =>
      n.id === "brief_analyzer"
        ? {
            ...n,
            runtime: {
              status: "failed",
              error: "boom",
              startedAt: "2026-09-06T12:00:00.000Z",
              completedAt: "2026-09-06T12:00:01.000Z",
            },
          }
        : n.id === "brief_input"
          ? {
              ...n,
              runtime: {
                status: "completed",
                output: okResult("brief"),
                startedAt: "2026-09-06T12:00:00.000Z",
                completedAt: "2026-09-06T12:00:00.500Z",
                durationMs: 500,
              },
            }
          : n.id === "output"
            ? {
                ...n,
                runtime: {
                  status: "skipped",
                  error: "Skipped because upstream node brief_analyzer failed.",
                },
              }
            : { ...n, runtime: createIdleRuntime() },
    );

    const retried = await retryFailedNode({
      workflow,
      nodeId: "brief_analyzer",
      transport: mockTransport({}),
    });

    expect(retried.nodes.find((n) => n.id === "brief_analyzer")?.runtime.status).toBe(
      "completed",
    );
    expect(retried.nodes.find((n) => n.id === "output")?.runtime.status).toBe("queued");
  });

  it("records provider placeholders as needs_provider", async () => {
    const base = createMinimalValidWorkflow();
    const workflow: Workflow = {
      ...base,
      nodes: [
        base.nodes[0]!,
        base.nodes[1]!,
        {
          id: "image_generator",
          kind: "image_generator",
          label: "Image",
          description: "",
          position: { x: 400, y: 80 },
          config: {
            modelClass: "image",
            instruction: "gen",
            enabled: true,
            settings: [],
          },
          runtime: createIdleRuntime(),
          locked: false,
        },
        base.nodes[2]!,
      ],
      edges: [
        { id: "e1", source: "brief_input", target: "brief_analyzer", animated: false },
        {
          id: "e2",
          source: "brief_analyzer",
          target: "image_generator",
          animated: false,
        },
        { id: "e3", source: "image_generator", target: "output", animated: false },
      ],
    };

    const result = await orchestrateWorkflowExecution({
      workflow,
      transport: mockTransport({ mediaIds: new Set(["image_generator"]) }),
    });

    expect(
      result.nodes.find((n) => n.id === "image_generator")?.runtime.status,
    ).toBe("needs_provider");
    expect(
      result.nodes.find((n) => n.id === "image_generator")?.runtime.output
        ?.artifacts[0]?.simulated,
    ).toBe(true);
    expect(result.nodes.find((n) => n.id === "output")?.runtime.status).toBe(
      "completed",
    );
  });

  it("exposes progress as terminal/enabled ratio", async () => {
    const workflow = createMinimalValidWorkflow();
    const ratios: number[] = [];
    await orchestrateWorkflowExecution({
      workflow,
      transport: mockTransport({}),
      onUpdate: (_wf, progress) => ratios.push(progress.ratio),
    });
    expect(ratios[0]).toBe(0);
    expect(ratios[ratios.length - 1]).toBe(1);
  });
});
