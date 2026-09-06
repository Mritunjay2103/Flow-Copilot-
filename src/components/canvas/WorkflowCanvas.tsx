"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type OnNodesChange,
  type OnSelectionChangeParams,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  getDownstreamNodeIds,
  validateProposedConnection,
  type Workflow,
} from "@/lib/workflow";
import { Button } from "@/components/ui";
import { useWorkflowStore } from "@/store/workflow-store";
import { StatusLegend } from "./StatusLegend";
import {
  WorkflowNodeComponent,
  type WorkflowFlowNode,
  type WorkflowNodeData,
} from "./WorkflowNode";

const nodeTypes = { workflow: WorkflowNodeComponent };
const SNAP_GRID: [number, number] = [16, 16];

function toFlowNodes(
  workflow: Workflow,
  selectedNodeId: string | null,
  highlightNodeIds: Set<string>,
): WorkflowFlowNode[] {
  return workflow.nodes.map((workflowNode) => ({
    id: workflowNode.id,
    type: "workflow" as const,
    position: workflowNode.position,
    selected: workflowNode.id === selectedNodeId,
    data: { workflowNode } satisfies WorkflowNodeData,
    deletable: !workflowNode.locked,
    className: highlightNodeIds.has(workflowNode.id) ? "hf-edit-flash" : undefined,
  }));
}

function toFlowEdges(
  workflow: Workflow,
  selectedEdgeIds: Set<string>,
  highlightEdgeIds: Set<string>,
): Edge[] {
  return workflow.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    animated: edge.animated || highlightEdgeIds.has(edge.id),
    selected: selectedEdgeIds.has(edge.id),
    className: highlightEdgeIds.has(edge.id) ? "hf-edit-flash-edge" : undefined,
  }));
}

function WorkflowCanvasInner({
  workflow,
  onOpenInspector,
}: {
  workflow: Workflow;
  onOpenInspector: () => void;
}) {
  const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId);
  const editHighlight = useWorkflowStore((s) => s.editHighlight);
  const selectNode = useWorkflowStore((s) => s.selectNode);
  const updateNodePosition = useWorkflowStore((s) => s.updateNodePosition);
  const beginNodeDrag = useWorkflowStore((s) => s.beginNodeDrag);
  const endNodeDrag = useWorkflowStore((s) => s.endNodeDrag);
  const addEdge = useWorkflowStore((s) => s.addEdge);
  const removeEdge = useWorkflowStore((s) => s.removeEdge);
  const removeNode = useWorkflowStore((s) => s.removeNode);
  const resetLayout = useWorkflowStore((s) => s.resetLayout);

  const { fitView, zoomIn, zoomOut } = useReactFlow();
  const fittedForKey = useRef<string | null>(null);
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<Set<string>>(
    () => new Set(),
  );

  const highlightNodeIds = useMemo(
    () => new Set(editHighlight?.nodeIds ?? []),
    [editHighlight],
  );
  const highlightEdgeIds = useMemo(
    () => new Set(editHighlight?.edgeIds ?? []),
    [editHighlight],
  );

  const nodes = useMemo(
    () => toFlowNodes(workflow, selectedNodeId, highlightNodeIds),
    [workflow, selectedNodeId, highlightNodeIds],
  );

  const edges = useMemo(
    () => toFlowEdges(workflow, selectedEdgeIds, highlightEdgeIds),
    [workflow, selectedEdgeIds, highlightEdgeIds],
  );

  useEffect(() => {
    const key = `${workflow.id}:${workflow.version}:${workflow.nodes.length}`;
    if (fittedForKey.current === key) return;
    fittedForKey.current = key;
    const run = () => {
      void fitView({ padding: 0.18, duration: 200, maxZoom: 1.05 });
    };
    const frame = window.requestAnimationFrame(run);
    // Second pass after React Flow measures node dimensions.
    const timer = window.setTimeout(run, 100);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [workflow.id, workflow.version, workflow.nodes.length, fitView]);

  const onNodesChange: OnNodesChange<WorkflowFlowNode> = useCallback(
    (changes) => {
      for (const change of changes) {
        if (change.type === "position" && change.position) {
          if (change.dragging) {
            beginNodeDrag();
          }
          updateNodePosition(change.id, change.position);
          if (change.dragging === false) {
            endNodeDrag();
          }
        }
      }
    },
    [beginNodeDrag, endNodeDrag, updateNodePosition],
  );

  const onSelectionChange = useCallback(
    ({ nodes: selectedNodes, edges: selectedEdges }: OnSelectionChangeParams) => {
      const nextIds = selectedEdges.map((e) => e.id);
      setSelectedEdgeIds((prev) => {
        if (
          prev.size === nextIds.length &&
          nextIds.every((id) => prev.has(id))
        ) {
          return prev;
        }
        return new Set(nextIds);
      });

      const first = selectedNodes[0];
      if (first && selectedNodeId !== first.id) {
        selectNode(first.id);
      }
    },
    [selectNode, selectedNodeId],
  );

  const onNodeClick = useCallback(
    (_: ReactMouseEvent, node: Node) => {
      selectNode(node.id);
      onOpenInspector();
    },
    [onOpenInspector, selectNode],
  );

  const onPaneClick = useCallback(() => {
    selectNode(null);
    setSelectedEdgeIds(new Set());
  }, [selectNode]);

  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      if (!connection.source || !connection.target) return false;
      return validateProposedConnection(
        workflow,
        connection.source,
        connection.target,
      ).ok;
    },
    [workflow],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      const check = validateProposedConnection(
        workflow,
        connection.source,
        connection.target,
      );
      if (!check.ok) return;
      const id = `e_${connection.source}_${connection.target}`.replace(
        /[^a-zA-Z0-9_-]/g,
        "_",
      );
      addEdge({
        id: id.slice(0, 64),
        source: connection.source,
        target: connection.target,
        animated: false,
      });
    },
    [addEdge, workflow],
  );

  const tryDeleteSelection = useCallback(() => {
    const edgeIds = [...selectedEdgeIds];
    for (const edgeId of edgeIds) {
      removeEdge(edgeId);
    }
    setSelectedEdgeIds(new Set());

    if (!selectedNodeId) return;
    const node = workflow.nodes.find((n) => n.id === selectedNodeId);
    if (!node) return;
    if (node.locked) return;

    const downstream = getDownstreamNodeIds(workflow, node.id);
    if (downstream.length > 0) {
      const ok = window.confirm(
        `Delete “${node.label}”? It has ${downstream.length} downstream node(s). Connected edges will be removed.`,
      );
      if (!ok) return;
    }
    removeNode(node.id);
  }, [removeEdge, removeNode, selectedEdgeIds, selectedNodeId, workflow]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      const target = event.target as HTMLElement | null;
      if (
        target?.closest(
          "input, textarea, select, [contenteditable='true'], [role='textbox']",
        )
      ) {
        return;
      }
      event.preventDefault();
      tryDeleteSelection();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [tryDeleteSelection]);

  const handleResetLayout = useCallback(() => {
    resetLayout();
    window.requestAnimationFrame(() => {
      void fitView({ padding: 0.2, duration: 200 });
    });
  }, [fitView, resetLayout]);

  return (
    <div className="relative h-full w-full" data-testid="workflow-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onSelectionChange={onSelectionChange}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        snapToGrid
        snapGrid={SNAP_GRID}
        fitView={false}
        deleteKeyCode={null}
        multiSelectionKeyCode="Shift"
        proOptions={{ hideAttribution: true }}
        minZoom={0.25}
        maxZoom={1.75}
        defaultEdgeOptions={{
          style: { stroke: "var(--hf-border)", strokeWidth: 1.5 },
        }}
      >
        <Background
          id="hf-dots"
          variant={BackgroundVariant.Dots}
          gap={16}
          size={1}
          color="rgba(41,45,58,0.9)"
        />
        <Controls
          showInteractive={false}
          className="!overflow-hidden !rounded-md !border !border-hf-border !bg-hf-panel !shadow-none [&>button]:!border-hf-border [&>button]:!bg-hf-panel [&>button]:!fill-hf-text"
        />
        <MiniMap
          pannable
          zoomable
          className="!overflow-hidden !rounded-md !border !border-hf-border !bg-hf-panel"
          maskColor="rgba(9,10,15,0.7)"
          nodeColor={() => "#8b5cf6"}
        />
        <Panel position="top-left" className="m-2">
          <StatusLegend />
        </Panel>
        <Panel position="top-right" className="m-2 flex gap-1">
          <Button
            size="sm"
            variant="secondary"
            data-testid="canvas-fit-view"
            onClick={() => void fitView({ padding: 0.2, duration: 200 })}
          >
            Fit
          </Button>
          <Button
            size="sm"
            variant="secondary"
            data-testid="canvas-zoom-in"
            onClick={() => zoomIn({ duration: 120 })}
          >
            Zoom +
          </Button>
          <Button
            size="sm"
            variant="secondary"
            data-testid="canvas-zoom-out"
            onClick={() => zoomOut({ duration: 120 })}
          >
            Zoom −
          </Button>
          <Button
            size="sm"
            variant="secondary"
            data-testid="canvas-reset-layout"
            onClick={handleResetLayout}
          >
            Reset layout
          </Button>
        </Panel>
      </ReactFlow>
    </div>
  );
}

export function WorkflowCanvas({
  workflow,
  onOpenInspector,
}: {
  workflow: Workflow;
  onOpenInspector: () => void;
}) {
  return (
    <ReactFlowProvider>
      <WorkflowCanvasInner
        workflow={workflow}
        onOpenInspector={onOpenInspector}
      />
    </ReactFlowProvider>
  );
}
