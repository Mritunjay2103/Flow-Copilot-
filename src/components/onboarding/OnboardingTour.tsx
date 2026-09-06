"use client";

import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui";

export const ONBOARDING_STORAGE_KEY = "hexflow-copilot:onboarding-dismissed";

const STEPS = [
  {
    title: "Start from a creative brief",
    body: "Describe the campaign, or pick a sample brief. The studio plans an executable workflow graph.",
  },
  {
    title: "Modify the graph through conversation",
    body: "Use the Copilot panel to add, remove, or rewire nodes — edits stay as a valid DAG.",
  },
  {
    title: "Run and inspect every step",
    body: "Run the workflow, watch the timeline, and open any node’s output in the Inspector.",
  },
] as const;

function readDismissed(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(ONBOARDING_STORAGE_KEY) === "1";
  } catch {
    return true;
  }
}

function writeDismissed() {
  try {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, "1");
  } catch {
    // ignore quota / private mode
  }
}

export function OnboardingTour() {
  const titleId = useId();
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    if (!readDismissed()) {
      queueMicrotask(() => setVisible(true));
    }
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduceMotion(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const dismiss = () => {
    writeDismissed();
    setVisible(false);
  };

  if (!visible) return null;

  const current = STEPS[step]!;
  const isLast = step === STEPS.length - 1;

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      data-testid="onboarding-tour"
      className={
        "pointer-events-auto fixed bottom-4 right-4 z-30 w-[min(340px,calc(100vw-2rem))] rounded-xl border border-hf-border bg-hf-panel-elevated p-4 shadow-xl " +
        (reduceMotion ? "" : "animate-[hf-fade-in_200ms_ease-out]")
      }
    >
      <p className="text-[11px] font-semibold uppercase tracking-wider text-hf-muted">
        Quick tour · {step + 1} of {STEPS.length}
      </p>
      <h2 id={titleId} className="mt-1 text-sm font-semibold text-hf-text">
        {current.title}
      </h2>
      <p className="mt-1.5 text-xs leading-relaxed text-hf-muted">{current.body}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={dismiss}
          data-testid="onboarding-skip"
        >
          Skip and never show again
        </Button>
        <div className="ml-auto flex gap-2">
          {step > 0 ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setStep((s) => s - 1)}
              data-testid="onboarding-back"
            >
              Back
            </Button>
          ) : null}
          {isLast ? (
            <Button
              variant="primary"
              size="sm"
              onClick={dismiss}
              data-testid="onboarding-done"
            >
              Done
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setStep((s) => s + 1)}
              data-testid="onboarding-next"
            >
              Next
            </Button>
          )}
        </div>
      </div>
    </aside>
  );
}
