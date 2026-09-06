"use client";

import { Tabs } from "@/components/ui";
import { CopilotPanel } from "@/components/copilot/CopilotPanel";
import { NodeInspector } from "@/components/inspector/NodeInspector";
import type { Workflow, WorkflowNode } from "@/lib/workflow";

export type RightTab = "copilot" | "inspector";

export function RightPanel({
  tab,
  onTabChange,
  selectedNode,
  workflow,
  inspectorTab = "config",
  className,
}: {
  tab: RightTab;
  onTabChange: (tab: RightTab) => void;
  selectedNode: WorkflowNode | null;
  workflow: Workflow | null;
  inspectorTab?: "config" | "output";
  className?: string;
}) {
  return (
    <aside
      className={`flex h-full flex-col border-l border-hf-border bg-hf-panel ${className ?? ""}`}
      aria-label="Copilot and inspector"
    >
      <Tabs
        aria-label="Right panel"
        items={[
          { id: "copilot" as const, label: "Copilot" },
          { id: "inspector" as const, label: "Inspector" },
        ]}
        value={tab}
        onChange={onTabChange}
      />
      <div className="flex min-h-0 flex-1 flex-col">
        {tab === "copilot" ? (
          <CopilotPanel />
        ) : (
          <div className="hf-scroll min-h-0 flex-1 overflow-y-auto p-3">
            <NodeInspector
              node={selectedNode}
              workflow={workflow}
              initialTab={inspectorTab}
            />
          </div>
        )}
      </div>
    </aside>
  );
}
