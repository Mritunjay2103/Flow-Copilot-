"use client";

import { useEffect } from "react";
import { useWorkflowStore } from "@/store/workflow-store";

/** Subtle completion toast + polite live region for screen readers. */
export function ExecutionToast() {
  const announcement = useWorkflowStore((s) => s.executionAnnouncement);
  const clear = useWorkflowStore((s) => s.clearExecutionAnnouncement);

  useEffect(() => {
    if (!announcement) return;
    const timer = window.setTimeout(() => clear(), 4500);
    return () => window.clearTimeout(timer);
  }, [announcement, clear]);

  if (!announcement) return null;

  return (
    <>
      <div
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-testid="execution-live-region"
      >
        {announcement}
      </div>
      <div
        className="pointer-events-none fixed bottom-14 left-1/2 z-50 w-[min(420px,calc(100%-2rem))] -translate-x-1/2 rounded-md border border-hf-border bg-hf-panel-elevated px-3 py-2 text-center text-xs text-hf-text shadow-lg"
        data-testid="execution-toast"
        role="status"
      >
        {announcement}
      </div>
    </>
  );
}
