import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createIdleRuntime,
  createMinimalValidWorkflow,
  createSneakerLaunchBrief,
  type Workflow,
  type WorkflowNode,
} from "@/lib/workflow";
import {
  PERSISTENCE_KEY,
  readPersistedState,
  writePersistedState,
} from "@/store/persistence";
import { createSharePayload } from "@/store/share";
import {
  __flushWorkflowPersistenceForTests,
  __resetWorkflowStoreForTests,
  useWorkflowStore,
} from "@/store/workflow-store";

beforeEach(() => {
  localStorage.clear();
  __resetWorkflowStoreForTests();
  vi.unstubAllGlobals();
});

afterEach(() => {
  __flushWorkflowPersistenceForTests();
  localStorage.clear();
  __resetWorkflowStoreForTests();
  vi.restoreAllMocks();
});

function buildLargeValidWorkflow(): Workflow {
  const base = createMinimalValidWorkflow();
  const chain: WorkflowNode[] = [{ ...base.nodes[0]! }];
  const chainEdges: Workflow["edges"] = [];
  let source = "brief_input";

  for (let i = 0; i < 55; i += 1) {
    const id = `step${i}`;
    const blob = Array.from({ length: 350 }, (_, j) =>
      String.fromCharCode(33 + ((i * 41 + j * 9) % 90)),
    ).join("");
    chain.push({
      id,
      kind: "script_writer",
      label: `Step ${i}`,
      description: blob.slice(0, 240),
      position: { x: (i % 3) * 10, y: Math.floor(i / 3) * 10 },
      config: {
        modelClass: "text",
        instruction: blob,
        enabled: true,
        settings: [{ key: "blob", value: blob.slice(0, 200) }],
      },
      runtime: createIdleRuntime(),
      locked: false,
    });
    chainEdges.push({
      id: `edge${i}`,
      source,
      target: id,
      animated: false,
    });
    source = id;
  }

  chain.push({ ...base.nodes[2]!, id: "output" });
  chainEdges.push({
    id: "edgeOut",
    source,
    target: "output",
    animated: false,
  });

  return { ...base, nodes: chain, edges: chainEdges };
}

describe("persistence", () => {
  it("hydrates validated workflow and messages from localStorage", () => {
    const wf = createMinimalValidWorkflow();
    writePersistedState({
      activeWorkflow: wf,
      copilotMessages: [
        {
          id: "m1",
          role: "assistant",
          content: "Hello",
          createdAt: "2026-09-06T12:00:00.000Z",
        },
      ],
    });

    useWorkflowStore.getState().hydrateFromStorage();
    const state = useWorkflowStore.getState();
    expect(state.activeWorkflow?.id).toBe(wf.id);
    expect(state.copilotMessages).toHaveLength(1);
    expect(state.copilotMessages[0]?.content).toBe("Hello");
  });

  it("ignores corrupted localStorage without crashing", () => {
    localStorage.setItem(PERSISTENCE_KEY, "{not-json");
    useWorkflowStore.getState().hydrateFromStorage();
    expect(useWorkflowStore.getState().activeWorkflow).toBeNull();

    localStorage.setItem(
      PERSISTENCE_KEY,
      JSON.stringify({
        activeWorkflow: { schemaVersion: 1, nodes: [] },
        copilotMessages: [],
      }),
    );
    useWorkflowStore.getState().hydrateFromStorage();
    expect(useWorkflowStore.getState().activeWorkflow).toBeNull();
    const recovered = readPersistedState();
    expect(recovered).not.toBeNull();
    expect(recovered?.activeWorkflow).toBeNull();
  });
});

describe("undo/redo history", () => {
  it("undoes and redoes manual edits and clears redo on new edit", () => {
    const wf = createMinimalValidWorkflow();
    useWorkflowStore.getState().loadWorkflow(wf);

    useWorkflowStore.getState().updateNodeConfig("brief_analyzer", {
      label: "Analysis v2",
    });
    expect(
      useWorkflowStore
        .getState()
        .activeWorkflow?.nodes.find((n) => n.id === "brief_analyzer")?.label,
    ).toBe("Analysis v2");

    useWorkflowStore.getState().undo();
    expect(
      useWorkflowStore
        .getState()
        .activeWorkflow?.nodes.find((n) => n.id === "brief_analyzer")?.label,
    ).toBe("Analyze brief");

    useWorkflowStore.getState().redo();
    expect(
      useWorkflowStore
        .getState()
        .activeWorkflow?.nodes.find((n) => n.id === "brief_analyzer")?.label,
    ).toBe("Analysis v2");

    useWorkflowStore.getState().updateNodeConfig("brief_analyzer", {
      label: "Analysis v3",
    });
    expect(useWorkflowStore.getState().redoStack).toHaveLength(0);
  });

  it("records one history step at drag end, not per move", () => {
    const wf = createMinimalValidWorkflow();
    useWorkflowStore.getState().loadWorkflow(wf);

    useWorkflowStore.getState().beginNodeDrag();
    useWorkflowStore.getState().updateNodePosition("brief_analyzer", { x: 1, y: 1 });
    useWorkflowStore.getState().updateNodePosition("brief_analyzer", { x: 2, y: 2 });
    useWorkflowStore.getState().updateNodePosition("brief_analyzer", { x: 3, y: 3 });
    expect(useWorkflowStore.getState().undoStack).toHaveLength(0);

    useWorkflowStore.getState().endNodeDrag();
    expect(useWorkflowStore.getState().undoStack).toHaveLength(1);
    expect(
      useWorkflowStore
        .getState()
        .activeWorkflow?.nodes.find((n) => n.id === "brief_analyzer")?.position,
    ).toEqual({ x: 3, y: 3 });
  });

  it("caps undo history at 30", () => {
    const wf = createMinimalValidWorkflow();
    useWorkflowStore.getState().loadWorkflow(wf);

    for (let i = 0; i < 35; i += 1) {
      useWorkflowStore.getState().updateNodeConfig("brief_analyzer", {
        label: `Label ${i}`.slice(0, 60),
      });
    }
    expect(useWorkflowStore.getState().undoStack.length).toBe(30);
  });
});

describe("API failure preservation", () => {
  it("keeps the current graph when planner fails", async () => {
    const wf = createMinimalValidWorkflow();
    useWorkflowStore.getState().loadWorkflow(wf);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { error: { code: "x", message: "planner down", retryable: true } },
          { status: 503 },
        ),
      ),
    );

    const ok = await useWorkflowStore
      .getState()
      .createWorkflowFromBrief(createSneakerLaunchBrief());
    expect(ok).toBe(false);
    expect(useWorkflowStore.getState().activeWorkflow?.id).toBe(wf.id);
    expect(useWorkflowStore.getState().lastError).toMatch(/planner down/i);
  });

  it("preserves the graph when edit fails", async () => {
    const wf = createMinimalValidWorkflow();
    useWorkflowStore.getState().loadWorkflow(wf);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { error: { code: "x", message: "edit failed", retryable: false } },
          { status: 400 },
        ),
      ),
    );

    const ok = await useWorkflowStore.getState().sendCopilotCommand("add music");
    expect(ok).toBe(false);
    expect(useWorkflowStore.getState().activeWorkflow).toEqual(wf);
    expect(useWorkflowStore.getState().lastError).toMatch(/edit failed/i);
  });
});

describe("share and import", () => {
  it("round-trips a share URL without runtime by default", () => {
    const wf = createMinimalValidWorkflow();
    wf.nodes[1]!.runtime = {
      status: "completed",
      output: {
        summary: "secret runtime",
        artifacts: [],
        decisions: [],
        warnings: [],
      },
    };
    useWorkflowStore.getState().loadWorkflow(wf);

    const share = useWorkflowStore.getState().createShareUrl();
    expect(share.ok).toBe(true);
    if (!share.ok) return;

    __resetWorkflowStoreForTests();
    const loaded = useWorkflowStore.getState().loadFromShareUrl(share.url);
    expect(loaded.ok).toBe(true);
    const runtime = useWorkflowStore
      .getState()
      .activeWorkflow?.nodes.find((n) => n.id === "brief_analyzer")?.runtime;
    expect(runtime?.status).toBe("idle");
    expect(runtime?.output).toBeUndefined();
  });

  it("rejects oversized shares with export guidance", () => {
    const huge = buildLargeValidWorkflow();
    const direct = createSharePayload(huge, { origin: "http://localhost:3000" });
    expect(direct.ok).toBe(false);
    if (!direct.ok) {
      expect(direct.error).toMatch(/too large|JSON export/i);
    }

    const loaded = useWorkflowStore.getState().loadWorkflow(huge);
    expect(loaded.ok).toBe(true);
    const share = useWorkflowStore.getState().createShareUrl();
    expect(share.ok).toBe(false);
    if (!share.ok) {
      expect(share.error).toMatch(/JSON export|too large/i);
    }
  });

  it("returns a human-readable error for invalid import", () => {
    const result = useWorkflowStore.getState().importWorkflow("{bad");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/not valid JSON/i);
    }

    const result2 = useWorkflowStore
      .getState()
      .importWorkflow(JSON.stringify({ schemaVersion: 1, title: "x" }));
    expect(result2.ok).toBe(false);
    if (!result2.ok) {
      expect(result2.error).toMatch(/Import failed/i);
    }
  });

  it("imports a valid exported workflow", () => {
    const wf = createMinimalValidWorkflow();
    useWorkflowStore.getState().loadWorkflow(wf);
    const json = useWorkflowStore.getState().exportWorkflow();
    expect(json).toBeTruthy();

    __resetWorkflowStoreForTests();
    const result = useWorkflowStore.getState().importWorkflow(json!);
    expect(result.ok).toBe(true);
    expect(useWorkflowStore.getState().activeWorkflow?.id).toBe(wf.id);
  });
});
