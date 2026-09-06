import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkflowCanvas } from "@/components/canvas/WorkflowCanvas";
import { WorkflowNodeComponent } from "@/components/canvas/WorkflowNode";
import { NodeInspector } from "@/components/inspector/NodeInspector";
import { ReactFlow, ReactFlowProvider } from "@xyflow/react";
import {
  createIdleRuntime,
  createMinimalValidWorkflow,
  layoutWorkflow,
  validateProposedConnection,
  type Workflow,
  type WorkflowNode,
} from "@/lib/workflow";
import {
  __resetWorkflowStoreForTests,
  useWorkflowStore,
} from "@/store/workflow-store";

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  __resetWorkflowStoreForTests();
  localStorage.clear();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

function withRuntime(
  workflow: Workflow,
  nodeId: string,
  runtime: WorkflowNode["runtime"],
): Workflow {
  return {
    ...workflow,
    nodes: workflow.nodes.map((n) =>
      n.id === nodeId ? { ...n, runtime } : n,
    ),
  };
}

describe("layout + connection validation", () => {
  it("lays out nodes left-to-right by topological level", () => {
    const laid = layoutWorkflow(createMinimalValidWorkflow());
    const xs = Object.fromEntries(laid.nodes.map((n) => [n.id, n.position.x]));
    expect(xs.brief_input).toBeLessThan(xs.brief_analyzer!);
    expect(xs.brief_analyzer).toBeLessThan(xs.output!);
  });

  it("prevents cycles, self-loops, duplicates, and output outgoing", () => {
    const wf = createMinimalValidWorkflow();
    expect(validateProposedConnection(wf, "brief_input", "brief_input").ok).toBe(
      false,
    );
    expect(validateProposedConnection(wf, "brief_input", "brief_analyzer").ok).toBe(
      false,
    );
    expect(validateProposedConnection(wf, "output", "brief_analyzer").ok).toBe(
      false,
    );
    expect(validateProposedConnection(wf, "brief_analyzer", "brief_input").ok).toBe(
      false,
    );

    // Adding analyzer → output already exists in minimal? Check edges
    const hasAnalyzerToOutput = wf.edges.some(
      (e) => e.source === "brief_analyzer" && e.target === "output",
    );
    expect(hasAnalyzerToOutput).toBe(true);
    expect(validateProposedConnection(wf, "brief_analyzer", "output").ok).toBe(
      false,
    );

    const reverse = validateProposedConnection(wf, "output", "brief_input");
    expect(reverse.ok).toBe(false);
    if (!reverse.ok) {
      expect(reverse.reason).toBe("incompatible_model_class");
    }
  });
});

describe("WorkflowNode status display", () => {
  it("renders status, duration, provider warning, and locked marker", () => {
    const base = createMinimalValidWorkflow().nodes[1]!;
    const node: WorkflowNode = {
      ...base,
      locked: true,
      kind: "image_generator",
      config: {
        ...base.config,
        modelClass: "image",
        settings: [{ key: "requires_provider", value: "true" }],
      },
      runtime: {
        status: "completed",
        durationMs: 1250,
      },
    };

    render(
      <ReactFlowProvider>
        <ReactFlow
          nodes={[
            {
              id: node.id,
              type: "workflow",
              position: { x: 0, y: 0 },
              data: { workflowNode: node },
            },
          ]}
          nodeTypes={{ workflow: WorkflowNodeComponent }}
        />
      </ReactFlowProvider>,
    );

    expect(screen.getByTestId(`flow-node-${node.id}`)).toBeInTheDocument();
    expect(screen.getByTestId(`node-status-${node.id}`)).toHaveTextContent(
      "Completed",
    );
    expect(screen.getByTestId(`node-duration-${node.id}`)).toHaveTextContent(
      "1.3s",
    );
    expect(screen.getByTestId(`node-locked-${node.id}`)).toBeInTheDocument();
    expect(screen.getByTestId(`node-provider-${node.id}`)).toBeInTheDocument();
  });
});

describe("canvas selection and position persistence", () => {
  it("renders graph nodes and persists drag positions into the store", () => {
    const workflow = layoutWorkflow(createMinimalValidWorkflow());
    useWorkflowStore.getState().loadWorkflow(workflow);
    const onOpenInspector = vi.fn();

    render(
      <WorkflowCanvas
        workflow={useWorkflowStore.getState().activeWorkflow!}
        onOpenInspector={onOpenInspector}
      />,
    );

    expect(screen.getByTestId("workflow-canvas")).toBeInTheDocument();
    expect(screen.getByTestId("status-legend")).toBeInTheDocument();
    expect(screen.getByTestId("flow-node-brief_analyzer")).toBeInTheDocument();

    useWorkflowStore.getState().selectNode("brief_analyzer");
    expect(useWorkflowStore.getState().selectedNodeId).toBe("brief_analyzer");

    useWorkflowStore.getState().beginNodeDrag();
    useWorkflowStore.getState().updateNodePosition("brief_analyzer", {
      x: 333,
      y: 222,
    });
    useWorkflowStore.getState().endNodeDrag();

    const moved = useWorkflowStore
      .getState()
      .activeWorkflow?.nodes.find((n) => n.id === "brief_analyzer");
    expect(moved?.position).toEqual({ x: 333, y: 222 });
    expect(useWorkflowStore.getState().undoStack.length).toBeGreaterThan(0);
  });

  it("refuses to delete locked nodes", () => {
    const workflow = createMinimalValidWorkflow();
    useWorkflowStore.getState().loadWorkflow(workflow);
    useWorkflowStore.getState().selectNode("brief_input");
    const result = useWorkflowStore.getState().removeNode("brief_input");
    expect(result.ok).toBe(false);
    expect(
      useWorkflowStore.getState().activeWorkflow?.nodes.some((n) => n.id === "brief_input"),
    ).toBe(true);
  });
});

describe("inspector edits", () => {
  it("validates and saves unlocked node fields", async () => {
    const user = userEvent.setup();
    const workflow = createMinimalValidWorkflow();
    // Unlock analyzer for editing
    const editable: Workflow = {
      ...workflow,
      nodes: workflow.nodes.map((n) =>
        n.id === "brief_analyzer" ? { ...n, locked: false } : n,
      ),
    };
    useWorkflowStore.getState().loadWorkflow(editable);
    const node = useWorkflowStore
      .getState()
      .activeWorkflow!.nodes.find((n) => n.id === "brief_analyzer")!;

    render(
      <NodeInspector
        node={node}
        workflow={useWorkflowStore.getState().activeWorkflow}
      />,
    );

    const label = screen.getByTestId("inspector-label");
    await user.clear(label);
    await user.type(label, "Deep brief analysis");
    await user.click(screen.getByTestId("inspector-save"));

    await waitFor(() => {
      expect(
        useWorkflowStore
          .getState()
          .activeWorkflow?.nodes.find((n) => n.id === "brief_analyzer")?.label,
      ).toBe("Deep brief analysis");
    });
  });

  it("blocks empty label on save", async () => {
    const user = userEvent.setup();
    const workflow = createMinimalValidWorkflow();
    const editable: Workflow = {
      ...workflow,
      nodes: workflow.nodes.map((n) =>
        n.id === "brief_analyzer" ? { ...n, locked: false } : n,
      ),
    };
    useWorkflowStore.getState().loadWorkflow(editable);
    const node = useWorkflowStore
      .getState()
      .activeWorkflow!.nodes.find((n) => n.id === "brief_analyzer")!;

    render(
      <NodeInspector
        node={node}
        workflow={useWorkflowStore.getState().activeWorkflow}
      />,
    );

    await user.clear(screen.getByTestId("inspector-label"));
    await user.click(screen.getByTestId("inspector-save"));
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});

describe("running status visual", () => {
  it("applies running status data attribute", () => {
    const workflow = withRuntime(createMinimalValidWorkflow(), "brief_analyzer", {
      ...createIdleRuntime(),
      status: "running",
    });
    const node = workflow.nodes.find((n) => n.id === "brief_analyzer")!;

    render(
      <ReactFlowProvider>
        <ReactFlow
          nodes={[
            {
              id: node.id,
              type: "workflow",
              position: { x: 0, y: 0 },
              data: { workflowNode: node },
            },
          ]}
          nodeTypes={{ workflow: WorkflowNodeComponent }}
        />
      </ReactFlowProvider>,
    );

    expect(screen.getByTestId("flow-node-brief_analyzer")).toHaveAttribute(
      "data-status",
      "running",
    );
    expect(screen.getByTestId("node-status-brief_analyzer")).toHaveTextContent(
      "Running",
    );
  });
});
