"use client";

import { STATUS_META } from "./node-visuals";
import type { NodeRunStatus } from "@/lib/workflow";

const ORDER: NodeRunStatus[] = [
  "idle",
  "queued",
  "running",
  "completed",
  "failed",
  "needs_provider",
  "skipped",
];

export function StatusLegend() {
  return (
    <div
      className="rounded-md border border-hf-border bg-hf-panel/95 px-2.5 py-2 shadow-sm backdrop-blur-sm"
      data-testid="status-legend"
    >
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-hf-muted">
        Status
      </div>
      <ul className="space-y-1">
        {ORDER.map((status) => {
          const meta = STATUS_META[status];
          return (
            <li key={status} className="flex items-center gap-2 text-[10px] text-hf-text">
              <span className={`h-2 w-2 shrink-0 rounded-full ${meta.className}`} />
              {meta.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
