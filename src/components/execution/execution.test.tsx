import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExecutionDrawer } from "@/components/execution/ExecutionDrawer";
import { InspectorOutput } from "@/components/inspector/InspectorOutput";
import {
  createMinimalValidWorkflow,
  formatRunSummaryMessage,
  summarizeRun,
} from "@/lib/workflow";
import {
  __resetWorkflowStoreForTests,
  useWorkflowStore,
} from "@/store/workflow-store";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

beforeEach(() => {
  __resetWorkflowStoreForTests();
  localStorage.clear();
  vi.unstubAllGlobals();
});

function mockRunTransport(handlers?: {
  failId?: string;
  providerId?: string;
  delayMs?: number;
}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("/api/health")) {
        return Response.json({
          configuredMode: "demo",
          activeMode: "demo",
          reachable: false,
          model: null,
        });
      }
      if (String(input).includes("/api/nodes/run")) {
        if (init?.signal?.aborted) {
          throw new DOMException("Aborted", "AbortError");
        }
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          node: { id: string; label: string };
        };
        if (handlers?.delayMs) {
          await new Promise<void>((resolve, reject) => {
            const t = setTimeout(resolve, handlers.delayMs);
            init?.signal?.addEventListener("abort", () => {
              clearTimeout(t);
              reject(new DOMException("Aborted", "AbortError"));
            });
          });
        }
        if (handlers?.failId && body.node.id === handlers.failId) {
          return Response.json(
            { error: { message: `boom:${body.node.id}` } },
            { status: 500 },
          );
        }
        if (handlers?.providerId && body.node.id === handlers.providerId) {
          return Response.json({
            result: {
              summary: "Needs provider",
              artifacts: [
                {
                  id: "sim",
                  name: "Sim",
                  type: "text/plain",
                  content: "preview",
                  simulated: true,
                },
              ],
              decisions: [],
              warnings: [
                "Workflow logic completed; connect a generation provider to render this asset.",
              ],
            },
            status: "needs_provider",
            activeMode: "demo",
            model: null,
            durationMs: 12,
          });
        }
        return Response.json({
          result: {
            summary: `done:${body.node.id}`,
            artifacts: [
              {
                id: `art_${body.node.id}`,
                name: body.node.label,
                type: "text/plain",
                content: `output for ${body.node.id}`,
                simulated: false,
              },
            ],
            decisions: ["ok"],
            warnings: [],
          },
          status: "completed",
          activeMode: "demo",
          model: null,
          durationMs: 8,
        });
      }
      return Response.json({ error: { message: "unmocked" } }, { status: 500 });
    }),
  );
}

describe("summarizeRun", () => {
  it("counts terminal statuses truthfully", () => {
    const wf = createMinimalValidWorkflow();
    wf.nodes[0]!.runtime = { status: "completed", durationMs: 10 };
    wf.nodes[1]!.runtime = { status: "needs_provider", durationMs: 5 };
    wf.nodes[2]!.runtime = { status: "failed", durationMs: 3 };
    const summary = summarizeRun(wf, 1234, false);
    expect(summary.completed).toBe(1);
    expect(summary.needsProvider).toBe(1);
    expect(summary.failed).toBe(1);
    expect(formatRunSummaryMessage(summary)).toMatch(/Run finished/);
    expect(formatRunSummaryMessage(summary)).toMatch(/1\.2s/);
  });
});

describe("run start and progression", () => {
  it("runs a workflow and updates statuses to completed", async () => {
    mockRunTransport();
    const wf = createMinimalValidWorkflow();
    useWorkflowStore.getState().loadWorkflow(wf);

    const ok = await useWorkflowStore.getState().runWorkflow();
    expect(ok).toBe(true);

    const result = useWorkflowStore.getState().activeWorkflow!;
    expect(result.nodes.every((n) => n.runtime.status === "completed")).toBe(
      true,
    );
    expect(useWorkflowStore.getState().lastRunSummary?.completed).toBe(3);
    expect(useWorkflowStore.getState().executionAnnouncement).toMatch(
      /Run finished/i,
    );
  });

  it("requires confirmation before resetting prior outputs", async () => {
    mockRunTransport();
    useWorkflowStore.getState().loadWorkflow(createMinimalValidWorkflow());
    await useWorkflowStore.getState().runWorkflow();

    expect(useWorkflowStore.getState().runNeedsRuntimeReset()).toBe(true);
    const blocked = await useWorkflowStore.getState().runWorkflow();
    expect(blocked).toBe(false);

    const ok = await useWorkflowStore
      .getState()
      .runWorkflow({ resetRuntime: true });
    expect(ok).toBe(true);
  });

  it("cancels an in-flight run", async () => {
    mockRunTransport({ delayMs: 200 });
    useWorkflowStore.getState().loadWorkflow(createMinimalValidWorkflow());

    const pending = useWorkflowStore.getState().runWorkflow();
    await waitFor(() => {
      expect(useWorkflowStore.getState().isRunning).toBe(true);
    });
    useWorkflowStore.getState().cancelRun();
    await pending;

    expect(useWorkflowStore.getState().isRunning).toBe(false);
    expect(useWorkflowStore.getState().lastRunSummary?.cancelled).toBe(true);
  });

  it("skips dependents when an upstream node fails", async () => {
    mockRunTransport({ failId: "brief_analyzer" });
    useWorkflowStore.getState().loadWorkflow(createMinimalValidWorkflow());
    await useWorkflowStore.getState().runWorkflow();

    const nodes = useWorkflowStore.getState().activeWorkflow!.nodes;
    expect(nodes.find((n) => n.id === "brief_analyzer")?.runtime.status).toBe(
      "failed",
    );
    expect(nodes.find((n) => n.id === "output")?.runtime.status).toBe("skipped");
  });

  it("marks provider placeholders as needs_provider, not failed", async () => {
    mockRunTransport({ providerId: "brief_analyzer" });
    useWorkflowStore.getState().loadWorkflow(createMinimalValidWorkflow());
    await useWorkflowStore.getState().runWorkflow();

    const analyzer = useWorkflowStore
      .getState()
      .activeWorkflow!.nodes.find((n) => n.id === "brief_analyzer");
    expect(analyzer?.runtime.status).toBe("needs_provider");
    expect(useWorkflowStore.getState().lastRunSummary?.needsProvider).toBe(1);
    expect(useWorkflowStore.getState().lastRunSummary?.failed).toBe(0);
  });

  it("retries a failed node", async () => {
    let attempts = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (!String(input).includes("/api/nodes/run")) {
          return Response.json({ activeMode: "demo" });
        }
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          node: { id: string };
        };
        if (body.node.id === "brief_analyzer") {
          attempts += 1;
          if (attempts === 1) {
            return Response.json(
              { error: { message: "temp fail" } },
              { status: 500 },
            );
          }
        }
        return Response.json({
          result: {
            summary: "ok",
            artifacts: [],
            decisions: [],
            warnings: [],
          },
          status: "completed",
          activeMode: "demo",
          model: null,
          durationMs: 4,
        });
      }),
    );

    useWorkflowStore.getState().loadWorkflow(createMinimalValidWorkflow());
    await useWorkflowStore.getState().runWorkflow();
    expect(
      useWorkflowStore
        .getState()
        .activeWorkflow!.nodes.find((n) => n.id === "brief_analyzer")
        ?.runtime.status,
    ).toBe("failed");

    const ok = await useWorkflowStore.getState().retryNode("brief_analyzer");
    expect(ok).toBe(true);
    expect(
      useWorkflowStore
        .getState()
        .activeWorkflow!.nodes.find((n) => n.id === "brief_analyzer")
        ?.runtime.status,
    ).toBe("completed");
  });
});

describe("ExecutionDrawer UI", () => {
  it("filters rows and supports view output + clear", async () => {
    const user = userEvent.setup();
    const wf = createMinimalValidWorkflow();
    wf.nodes = wf.nodes.map((n) => {
      if (n.id === "brief_input") {
        return {
          ...n,
          runtime: {
            status: "completed",
            durationMs: 10,
            output: {
              summary: "Brief ready",
              artifacts: [],
              decisions: [],
              warnings: [],
            },
          },
        };
      }
      if (n.id === "brief_analyzer") {
        return { ...n, runtime: { status: "failed", error: "nope" } };
      }
      return { ...n, runtime: { status: "needs_provider" } };
    });

    const onView = vi.fn();
    useWorkflowStore.getState().loadWorkflow(wf);

    render(
      <ExecutionDrawer
        open
        onToggle={vi.fn()}
        progress={null}
        isRunning={false}
        workflow={useWorkflowStore.getState().activeWorkflow}
        lastRunSummary={summarizeRun(wf, 900, false)}
        onViewOutput={onView}
      />,
    );

    expect(screen.getByTestId("execution-final-summary")).toHaveTextContent(
      /Run finished/i,
    );

    await user.click(screen.getByTestId("execution-filter-failed"));
    expect(screen.getByTestId("execution-row-brief_analyzer")).toBeInTheDocument();
    expect(screen.queryByTestId("execution-row-brief_input")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("execution-filter-needs_provider"));
    expect(screen.getByTestId("execution-row-output")).toBeInTheDocument();

    await user.click(screen.getByTestId("execution-view-output"));
    expect(onView).toHaveBeenCalledWith("output");

    vi.spyOn(window, "confirm").mockReturnValue(true);
    await user.click(screen.getByTestId("execution-clear-run"));
    expect(
      useWorkflowStore
        .getState()
        .activeWorkflow!.nodes.every((n) => n.runtime.status === "idle"),
    ).toBe(true);
  });
});

describe("InspectorOutput artifacts", () => {
  it("shows simulated badge and copies artifact text", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: { writeText },
    });

    render(
      <InspectorOutput
        status="needs_provider"
        output={{
          summary: "Placeholder",
          artifacts: [
            {
              id: "sim1",
              name: "Clip",
              type: "text/plain",
              content: "simulated bytes",
              simulated: true,
            },
          ],
          decisions: ["keep placeholder"],
          warnings: [
            "Workflow logic completed; connect a generation provider to render this asset.",
          ],
        }}
      />,
    );

    expect(screen.getByTestId("inspector-provider-note")).toBeInTheDocument();
    expect(screen.getByTestId("artifact-simulated-sim1")).toHaveTextContent(
      /Simulated preview/i,
    );

    await user.click(screen.getByTestId("artifact-copy-sim1"));
    expect(writeText).toHaveBeenCalledWith("simulated bytes");
  });
});
