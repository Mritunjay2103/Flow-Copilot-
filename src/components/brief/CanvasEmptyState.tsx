"use client";

import { Button, EmptyState } from "@/components/ui";
import type { SampleBriefDefinition } from "./sample-briefs";

export function CanvasEmptyState({
  samples,
  isPlanning,
  onCreateFromBrief,
  onSelectSample,
}: {
  samples: SampleBriefDefinition[];
  isPlanning: boolean;
  onCreateFromBrief: () => void;
  onSelectSample: (sample: SampleBriefDefinition) => void;
}) {
  return (
    <div
      className="flex h-full items-center justify-center"
      data-testid="canvas-empty-state"
    >
      <EmptyState
        title="Turn creative intent into executable workflows"
        description="Describe a campaign brief and the studio plans an editable DAG — then refine it with Copilot and run nodes with honest status for provider placeholders."
        action={
          <div className="flex w-full flex-col gap-3">
            <Button
              variant="primary"
              onClick={onCreateFromBrief}
              disabled={isPlanning}
              data-testid="create-from-brief"
            >
              Create from brief
            </Button>
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-hf-muted">
                Example briefs
              </div>
              <p className="text-[11px] text-hf-muted">
                Opens the composer with fields filled — does not submit automatically.
              </p>
              {samples.map((ex) => (
                <button
                  key={ex.id}
                  type="button"
                  disabled={isPlanning}
                  data-testid={`empty-sample-${ex.id}`}
                  className="w-full rounded-md border border-hf-border bg-hf-panel px-3 py-2 text-left transition-colors hover:border-hf-cyan/40 disabled:opacity-50"
                  onClick={() => onSelectSample(ex)}
                >
                  <div className="text-xs font-medium text-hf-text">{ex.title}</div>
                  <div className="mt-0.5 text-[11px] text-hf-muted">{ex.summary}</div>
                </button>
              ))}
            </div>
          </div>
        }
        footer={
          <p className="text-[11px] leading-relaxed text-hf-muted">
            Local recordings can use Ollama (`AI_MODE=ollama`). Public Vercel deploys use the
            deterministic Demo engine (`AI_MODE=demo`) because hosted apps cannot reach Ollama on
            your laptop.
          </p>
        }
      />
    </div>
  );
}
