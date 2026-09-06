"use client";

import { KIND_LABELS } from "@/lib/demo/brief-parser";
import type { WorkflowNodeKind } from "@/lib/workflow";
import { Button } from "@/components/ui";

const LIBRARY: { group: string; kinds: WorkflowNodeKind[] }[] = [
  { group: "Input", kinds: ["brief_input"] },
  {
    group: "Intelligence",
    kinds: [
      "brief_analyzer",
      "script_writer",
      "scene_planner",
      "prompt_builder",
      "hook_variants",
    ],
  },
  {
    group: "Generation",
    kinds: ["image_generator", "video_generator", "voiceover", "music", "subtitle"],
  },
  { group: "Validation", kinds: ["brand_validator", "platform_adapter"] },
  { group: "Output", kinds: ["output"] },
];

export type SampleTemplate = {
  id: string;
  title: string;
  description: string;
};

export function LeftRail({
  templates,
  onNewWorkflow,
  onLoadTemplate,
  className,
}: {
  templates: SampleTemplate[];
  onNewWorkflow: () => void;
  onLoadTemplate: (id: string) => void;
  className?: string;
}) {
  return (
    <aside
      className={`flex h-full flex-col border-r border-hf-border bg-hf-panel ${className ?? ""}`}
      aria-label="Workflow library"
    >
      <div className="space-y-2 border-b border-hf-border p-3">
        <Button variant="primary" size="sm" className="w-full" onClick={onNewWorkflow}>
          New workflow
        </Button>
        <p className="text-[11px] leading-snug text-hf-muted">
          Clears the canvas and returns to the brief empty state.
        </p>
      </div>

      <div className="hf-scroll flex-1 overflow-y-auto p-3">
        <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-hf-muted">
          Sample templates
        </h2>
        <ul className="mb-4 space-y-1.5">
          {templates.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                className="w-full rounded-md border border-hf-border bg-hf-panel-elevated px-2.5 py-2 text-left transition-colors hover:border-hf-violet/50"
                onClick={() => onLoadTemplate(t.id)}
              >
                <div className="text-xs font-medium text-hf-text">{t.title}</div>
                <div className="mt-0.5 text-[11px] text-hf-muted">{t.description}</div>
              </button>
            </li>
          ))}
        </ul>

        <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-hf-muted">
          Node library
        </h2>
        <p className="mb-3 text-[11px] leading-snug text-hf-muted">
          Dragging new node types onto the canvas is a manual editing capability (wire via the
          canvas in a later step). Use Copilot to add nodes conversationally today.
        </p>
        <div className="space-y-3">
          {LIBRARY.map((section) => (
            <div key={section.group}>
              <div className="mb-1 text-[11px] font-medium text-hf-cyan">{section.group}</div>
              <ul className="space-y-1">
                {section.kinds.map((kind) => (
                  <li
                    key={kind}
                    className="rounded border border-dashed border-hf-border/80 bg-hf-bg/40 px-2 py-1.5 text-[11px] text-hf-muted"
                    title="Manual drag-and-drop arrives with the canvas wiring"
                  >
                    {KIND_LABELS[kind]}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
