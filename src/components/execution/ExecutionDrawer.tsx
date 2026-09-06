"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button, IconButton } from "@/components/ui";
import { formatDuration, STATUS_META } from "@/components/canvas/node-visuals";
import {
  executionOrderedNodeIds,
  formatRunSummaryMessage,
  type NodeRunStatus,
  type OrchestratorProgress,
  type RunSummary,
  type Workflow,
  type WorkflowNode,
} from "@/lib/workflow";
import { useWorkflowStore } from "@/store/workflow-store";

export type ExecutionFilter =
  | "all"
  | "running"
  | "completed"
  | "needs_provider"
  | "failed";

const FILTERS: { id: ExecutionFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "running", label: "Running" },
  { id: "completed", label: "Completed" },
  { id: "needs_provider", label: "Needs provider" },
  { id: "failed", label: "Failed" },
];

function matchesFilter(status: NodeRunStatus, filter: ExecutionFilter): boolean {
  if (filter === "all") return true;
  if (filter === "running") {
    return status === "running" || status === "queued";
  }
  return status === filter;
}

export function ExecutionDrawer({
  open,
  onToggle,
  progress,
  isRunning,
  workflow,
  lastRunSummary,
  onViewOutput,
}: {
  open: boolean;
  onToggle: () => void;
  progress: OrchestratorProgress | null;
  isRunning: boolean;
  workflow: Workflow | null;
  lastRunSummary: RunSummary | null;
  onViewOutput: (nodeId: string) => void;
}) {
  const retryNode = useWorkflowStore((s) => s.retryNode);
  const resetRun = useWorkflowStore((s) => s.resetRun);
  const cancelRun = useWorkflowStore((s) => s.cancelRun);
  const [filter, setFilter] = useState<ExecutionFilter>("all");

  const ordered = useMemo(() => {
    if (!workflow) return [] as WorkflowNode[];
    const ids = executionOrderedNodeIds(workflow);
    return ids
      .map((id) => workflow.nodes.find((n) => n.id === id))
      .filter((n): n is WorkflowNode => Boolean(n));
  }, [workflow]);

  const filtered = ordered.filter((n) => matchesFilter(n.runtime.status, filter));

  const ratio = progress?.ratio ?? (lastRunSummary ? 1 : 0);
  const pct = Math.round(ratio * 100);

  const stripLabel = (() => {
    if (isRunning) return `Running — ${pct}%`;
    if (lastRunSummary) return formatRunSummaryMessage(lastRunSummary);
    if (progress) return `Last progress ${pct}%`;
    return "Idle — run a workflow to monitor execution";
  })();

  return (
    <section
      className="border-t border-hf-border bg-hf-panel"
      aria-label="Execution monitor"
      data-testid="execution-drawer"
    >
      <div className="flex h-9 items-center gap-2 px-3">
        <IconButton
          label={open ? "Collapse execution drawer" : "Expand execution drawer"}
          tooltip={open ? "Collapse" : "Expand"}
          onClick={onToggle}
          data-testid="execution-drawer-toggle"
        >
          {open ? (
            <ChevronDown className="h-4 w-4" aria-hidden />
          ) : (
            <ChevronUp className="h-4 w-4" aria-hidden />
          )}
        </IconButton>
        <div className="text-xs font-medium text-hf-text">Execution</div>
        <div
          className="min-w-0 flex-1 truncate text-[11px] text-hf-muted"
          data-testid="execution-strip-summary"
        >
          {stripLabel}
        </div>
        {isRunning ? (
          <Button
            size="sm"
            variant="ghost"
            data-testid="execution-cancel"
            onClick={() => cancelRun()}
          >
            Cancel
          </Button>
        ) : null}
        <div className="h-1.5 w-28 shrink-0 overflow-hidden rounded-full bg-hf-border">
          <div
            className="h-full bg-hf-cyan transition-[width] duration-200"
            style={{ width: `${pct}%` }}
            data-testid="execution-progress-bar"
            aria-hidden
          />
        </div>
      </div>

      {open ? (
        <div
          className="hf-scroll max-h-[min(280px,var(--hf-drawer-h))] overflow-y-auto border-t border-hf-border"
          data-testid="execution-timeline"
        >
          <div className="flex flex-wrap items-center gap-1 border-b border-hf-border px-3 py-2">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                data-testid={`execution-filter-${f.id}`}
                className={
                  filter === f.id
                    ? "rounded border border-hf-cyan/40 bg-hf-cyan/15 px-2 py-1 text-[10px] text-hf-text"
                    : "rounded border border-hf-border px-2 py-1 text-[10px] text-hf-muted hover:text-hf-text"
                }
                onClick={() => setFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto"
              data-testid="execution-clear-run"
              disabled={isRunning || !workflow}
              onClick={() => {
                if (
                  workflow &&
                  window.confirm("Clear all node run statuses and outputs?")
                ) {
                  resetRun();
                }
              }}
            >
              Clear run
            </Button>
          </div>

          {lastRunSummary && !isRunning ? (
            <p
              className="border-b border-hf-border px-3 py-2 text-[11px] text-hf-text"
              data-testid="execution-final-summary"
            >
              {formatRunSummaryMessage(lastRunSummary)}
            </p>
          ) : null}

          {filtered.length === 0 ? (
            <p className="px-3 py-3 text-xs text-hf-muted">
              {workflow
                ? "No nodes match this filter."
                : "Load a workflow and press Run to see the timeline."}
            </p>
          ) : (
            <ul className="divide-y divide-hf-border">
              {filtered.map((node) => {
                const status = STATUS_META[node.runtime.status];
                const duration = formatDuration(node.runtime.durationMs);
                const canRetry =
                  !isRunning &&
                  (node.runtime.status === "failed" ||
                    node.runtime.status === "needs_provider");
                const warning =
                  node.runtime.output?.warnings[0] ??
                  node.runtime.error ??
                  (node.runtime.status === "needs_provider"
                    ? "Workflow logic completed; connect a generation provider to render this asset"
                    : null);

                return (
                  <li
                    key={node.id}
                    className="px-3 py-2"
                    data-testid={`execution-row-${node.id}`}
                    data-status={node.runtime.status}
                  >
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs font-medium text-hf-text">
                            {node.label}
                          </span>
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${status.className}`}
                          >
                            {status.label}
                          </span>
                          {duration ? (
                            <span className="text-[10px] text-hf-muted">
                              {duration}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-[11px] text-hf-muted">
                          {node.runtime.output?.summary ??
                            (node.runtime.status === "idle"
                              ? "Not run yet"
                              : node.runtime.status)}
                        </p>
                        {warning ? (
                          <p className="mt-0.5 text-[11px] text-hf-warning">
                            {warning}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-col gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          data-testid={`execution-view-${node.id}`}
                          onClick={() => onViewOutput(node.id)}
                        >
                          View output
                        </Button>
                        {canRetry ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            data-testid={`execution-retry-${node.id}`}
                            onClick={() => void retryNode(node.id)}
                          >
                            Retry
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}
