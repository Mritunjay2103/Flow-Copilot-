import type { Workflow } from "./schema";
import { topologicalLevels } from "./graph";

export type RunSummary = {
  completed: number;
  needsProvider: number;
  failed: number;
  skipped: number;
  enabled: number;
  elapsedMs: number;
  cancelled: boolean;
};

export function workflowHasRuntimeOutputs(workflow: Workflow): boolean {
  return workflow.nodes.some(
    (n) =>
      n.runtime.output != null ||
      n.runtime.status === "completed" ||
      n.runtime.status === "failed" ||
      n.runtime.status === "needs_provider" ||
      n.runtime.status === "skipped" ||
      n.runtime.status === "running" ||
      n.runtime.status === "queued",
  );
}

export function summarizeRun(
  workflow: Workflow,
  elapsedMs: number,
  cancelled = false,
): RunSummary {
  const enabled = workflow.nodes.filter((n) => n.config.enabled);
  let completed = 0;
  let needsProvider = 0;
  let failed = 0;
  let skipped = 0;

  for (const node of enabled) {
    switch (node.runtime.status) {
      case "completed":
        completed += 1;
        break;
      case "needs_provider":
        needsProvider += 1;
        break;
      case "failed":
        failed += 1;
        break;
      case "skipped":
        skipped += 1;
        break;
      default:
        break;
    }
  }

  return {
    completed,
    needsProvider,
    failed,
    skipped,
    enabled: enabled.length,
    elapsedMs: Math.max(0, Math.round(elapsedMs)),
    cancelled,
  };
}

export function formatRunSummaryMessage(summary: RunSummary): string {
  const parts = [
    `${summary.completed} completed`,
    `${summary.needsProvider} need provider`,
    `${summary.failed} failed`,
    `${summary.skipped} skipped`,
  ];
  const time =
    summary.elapsedMs < 1000
      ? `${summary.elapsedMs}ms`
      : `${(summary.elapsedMs / 1000).toFixed(1)}s`;
  const prefix = summary.cancelled ? "Run cancelled" : "Run finished";
  return `${prefix}: ${parts.join(", ")}. Elapsed ${time}.`;
}

/** Enabled nodes in topological execution order. */
export function executionOrderedNodeIds(workflow: Workflow): string[] {
  try {
    const levels = topologicalLevels(workflow);
    const ordered: string[] = [];
    for (const level of levels) {
      for (const id of level) {
        const node = workflow.nodes.find((n) => n.id === id);
        if (node?.config.enabled) ordered.push(id);
      }
    }
    return ordered;
  } catch {
    return workflow.nodes.filter((n) => n.config.enabled).map((n) => n.id);
  }
}
