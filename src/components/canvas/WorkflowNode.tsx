"use client";

import { memo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import {
  isInputNode,
  isOutputNode,
  nodeRequiresProvider,
  type WorkflowNode,
} from "@/lib/workflow";
import { cn } from "@/lib/cn";
import {
  AlertTriangle,
  formatDuration,
  KIND_ICONS,
  Lock,
  MODEL_CLASS_LABEL,
  STATUS_META,
} from "./node-visuals";

export type WorkflowNodeData = {
  workflowNode: WorkflowNode;
};

export type WorkflowFlowNode = Node<WorkflowNodeData, "workflow">;

function WorkflowNodeView({ data, selected }: NodeProps<WorkflowFlowNode>) {
  const node = data.workflowNode;
  const Icon = KIND_ICONS[node.kind];
  const status = STATUS_META[node.runtime.status];
  const duration = formatDuration(node.runtime.durationMs);
  const provider = nodeRequiresProvider(node);
  const showTarget = !isInputNode(node);
  const showSource = !isOutputNode(node);

  return (
    <div
      data-testid={`flow-node-${node.id}`}
      data-status={node.runtime.status}
      className={cn(
        "relative w-[220px] rounded-lg border bg-hf-panel px-3 py-2.5 shadow-md transition-colors",
        selected
          ? "border-hf-cyan ring-1 ring-hf-cyan/50"
          : "border-hf-border",
        status.ring,
        !node.config.enabled && "opacity-60",
      )}
    >
      {showTarget ? (
        <Handle
          type="target"
          position={Position.Left}
          className="!h-2.5 !w-2.5 !border-hf-border !bg-hf-cyan"
        />
      ) : null}
      {showSource ? (
        <Handle
          type="source"
          position={Position.Right}
          className="!h-2.5 !w-2.5 !border-hf-border !bg-hf-violet"
        />
      ) : null}

      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-hf-border bg-hf-panel-elevated text-hf-cyan">
          <Icon className="h-3.5 w-3.5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <div className="truncate text-xs font-semibold text-hf-text">
              {node.label}
            </div>
            {node.locked ? (
              <Lock
                className="h-3 w-3 shrink-0 text-hf-muted"
                aria-label="Locked"
                data-testid={`node-locked-${node.id}`}
              />
            ) : null}
            {provider ? (
              <AlertTriangle
                className="h-3 w-3 shrink-0 text-hf-warning"
                aria-label="Needs provider"
                data-testid={`node-provider-${node.id}`}
              />
            ) : null}
          </div>
          <p className="mt-0.5 line-clamp-1 text-[11px] text-hf-muted">
            {node.description || "No description"}
          </p>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="rounded border border-hf-border bg-hf-panel-elevated px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-hf-muted">
          {MODEL_CLASS_LABEL[node.config.modelClass]}
        </span>
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-[10px] font-medium",
            status.className,
          )}
          data-testid={`node-status-${node.id}`}
        >
          {status.label}
        </span>
        {duration ? (
          <span
            className="text-[10px] text-hf-muted"
            data-testid={`node-duration-${node.id}`}
          >
            {duration}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export const WorkflowNodeComponent = memo(WorkflowNodeView);
