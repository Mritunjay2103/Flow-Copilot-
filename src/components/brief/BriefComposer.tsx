"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button, IconButton, Spinner } from "@/components/ui";
import {
  CreativeBriefSchema,
  type AspectRatio,
  type CreativeBrief,
  type Platform,
} from "@/lib/workflow";
import { ChipInput } from "./ChipInput";
import {
  SAMPLE_BRIEFS,
  createDefaultBriefDraft,
  type SampleBriefDefinition,
} from "./sample-briefs";

const PLATFORMS: { value: Platform; label: string }[] = [
  { value: "instagram_reels", label: "Instagram Reels" },
  { value: "youtube_shorts", label: "YouTube Shorts" },
  { value: "tiktok", label: "TikTok" },
  { value: "youtube", label: "YouTube" },
  { value: "web", label: "Web" },
  { value: "multi_platform", label: "Multi-platform" },
];

const ASPECTS: AspectRatio[] = ["9:16", "16:9", "1:1", "4:5"];

const PLAN_STAGES = [
  "Understanding brief",
  "Designing workflow",
  "Validating graph",
] as const;

type FieldKey = keyof CreativeBrief;
type FieldErrors = Partial<Record<FieldKey, string>>;

function fieldError(
  brief: CreativeBrief,
  key: FieldKey,
): string | undefined {
  const result = CreativeBriefSchema.safeParse(brief);
  if (result.success) return undefined;
  const issue = result.error.issues.find((i) => i.path[0] === key);
  if (!issue) return undefined;
  if (issue.code === "too_small") return "Required";
  return issue.message;
}

export function BriefComposer({
  open,
  initialBrief,
  isPlanning,
  onClose,
  onSubmit,
  samples = SAMPLE_BRIEFS,
}: {
  open: boolean;
  initialBrief?: CreativeBrief | null;
  isPlanning: boolean;
  onClose: () => void;
  onSubmit: (brief: CreativeBrief) => Promise<boolean>;
  samples?: SampleBriefDefinition[];
}) {
  // Remount dialog when opened so initialBrief / defaults apply without syncing in an effect.
  if (!open) return null;
  return (
    <BriefComposerDialog
      initialBrief={initialBrief}
      isPlanning={isPlanning}
      onClose={onClose}
      onSubmit={onSubmit}
      samples={samples}
    />
  );
}

function BriefComposerDialog({
  initialBrief,
  isPlanning,
  onClose,
  onSubmit,
  samples,
}: {
  initialBrief?: CreativeBrief | null;
  isPlanning: boolean;
  onClose: () => void;
  onSubmit: (brief: CreativeBrief) => Promise<boolean>;
  samples: SampleBriefDefinition[];
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [brief, setBrief] = useState<CreativeBrief>(() =>
    initialBrief ? structuredClone(initialBrief) : createDefaultBriefDraft(),
  );
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [section, setSection] = useState<"basic" | "creative">("basic");
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isPlanning) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isPlanning, onClose]);

  const errors: FieldErrors = useMemo(() => {
    if (!submitted && Object.keys(touched).length === 0) return {};
    const next: FieldErrors = {};
    (Object.keys(brief) as FieldKey[]).forEach((key) => {
      if (submitted || touched[key]) {
        const message = fieldError(brief, key);
        if (message) next[key] = message;
      }
    });
    return next;
  }, [brief, submitted, touched]);

  const markTouched = (key: FieldKey) => {
    setTouched((t) => ({ ...t, [key]: true }));
  };

  const update = <K extends FieldKey>(key: K, value: CreativeBrief[K]) => {
    setBrief((b) => ({ ...b, [key]: value }));
  };

  const applySample = (sample: SampleBriefDefinition) => {
    setBrief(structuredClone(sample.brief));
    setTouched({});
    setSubmitted(false);
    setLocalError(null);
    setSection("basic");
  };

  const handleSubmit = async () => {
    if (isPlanning) return;
    setSubmitted(true);
    setLocalError(null);
    const parsed = CreativeBriefSchema.safeParse({
      ...brief,
      callToAction: brief.callToAction?.trim()
        ? brief.callToAction.trim()
        : undefined,
    });
    if (!parsed.success) {
      setLocalError("Fix the highlighted fields before planning.");
      return;
    }
    const ok = await onSubmit(parsed.data);
    if (!ok) {
      // Preserve entered values — brief state stays as-is
      setLocalError("Planning failed. Your brief is still here — edit and try again.");
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 p-0 sm:items-center sm:p-4"
      role="presentation"
      data-testid="brief-composer-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !isPlanning) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="brief-composer"
        className="flex max-h-[min(920px,100dvh)] w-full max-w-2xl flex-col overflow-hidden rounded-t-xl border border-hf-border bg-hf-panel shadow-2xl sm:rounded-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-hf-border px-4 py-3">
          <div>
            <h2 id={titleId} className="text-sm font-semibold text-hf-text">
              Compose creative brief
            </h2>
            <p className="mt-0.5 text-[11px] text-hf-muted">
              Defaults: Instagram Reels · 20s · 9:16. Samples fill the form — they do not submit.
            </p>
          </div>
          <IconButton
            label="Close brief composer"
            tooltip="Close"
            disabled={isPlanning}
            onClick={onClose}
          >
            <X className="h-4 w-4" aria-hidden />
          </IconButton>
        </div>

        <div className="hf-scroll min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <div className="mb-4 space-y-1.5" data-testid="sample-briefs">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-hf-muted">
              Sample briefs
            </div>
            <div className="grid gap-1.5 sm:grid-cols-3">
              {samples.map((sample) => (
                <button
                  key={sample.id}
                  type="button"
                  disabled={isPlanning}
                  data-testid={`sample-${sample.id}`}
                  className="rounded-md border border-hf-border bg-hf-panel-elevated px-2.5 py-2 text-left transition-colors hover:border-hf-cyan/40 disabled:opacity-50"
                  onClick={() => applySample(sample)}
                >
                  <div className="text-xs font-medium text-hf-text">{sample.title}</div>
                  <div className="mt-0.5 text-[11px] text-hf-muted">{sample.summary}</div>
                </button>
              ))}
            </div>
          </div>

          <div
            role="tablist"
            aria-label="Brief sections"
            className="mb-3 flex border-b border-hf-border"
          >
            {(
              [
                ["basic", "Basic brief"],
                ["creative", "Creative controls"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={section === id}
                className={
                  section === id
                    ? "relative flex-1 px-3 py-2 text-xs font-medium text-hf-text"
                    : "flex-1 px-3 py-2 text-xs font-medium text-hf-muted hover:text-hf-text"
                }
                onClick={() => setSection(id)}
              >
                {label}
                {section === id ? (
                  <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-hf-violet" />
                ) : null}
              </button>
            ))}
          </div>

          {section === "basic" ? (
            <div className="space-y-3" data-testid="basic-section">
              <Field
                id="product"
                label="Product or subject"
                hint="Example: Pulse X1 running shoe"
                value={brief.product}
                error={errors.product}
                disabled={isPlanning}
                onBlur={() => markTouched("product")}
                onChange={(v) => update("product", v)}
              />
              <Field
                id="objective"
                label="Campaign objective"
                hint="Example: Launch with a scroll-stopping opening"
                value={brief.objective}
                error={errors.objective}
                disabled={isPlanning}
                multiline
                onBlur={() => markTouched("objective")}
                onChange={(v) => update("objective", v)}
              />
              <Field
                id="audience"
                label="Target audience"
                hint="Example: Urban runners aged 18–30"
                value={brief.audience}
                error={errors.audience}
                disabled={isPlanning}
                onBlur={() => markTouched("audience")}
                onChange={(v) => update("audience", v)}
              />
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <label htmlFor="platform" className="block text-xs font-medium text-hf-text">
                    Platform
                  </label>
                  <select
                    id="platform"
                    value={brief.platform}
                    disabled={isPlanning}
                    onBlur={() => markTouched("platform")}
                    onChange={(e) => update("platform", e.target.value as Platform)}
                    className="h-9 w-full rounded-md border border-hf-border bg-hf-bg px-2 text-xs text-hf-text"
                  >
                    {PLATFORMS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="duration" className="block text-xs font-medium text-hf-text">
                    Duration (seconds)
                  </label>
                  <input
                    id="duration"
                    type="number"
                    min={5}
                    max={300}
                    value={brief.durationSec}
                    disabled={isPlanning}
                    onBlur={() => markTouched("durationSec")}
                    onChange={(e) =>
                      update("durationSec", Number(e.target.value) || 0)
                    }
                    className="h-9 w-full rounded-md border border-hf-border bg-hf-bg px-2 text-xs text-hf-text"
                  />
                  {errors.durationSec ? (
                    <p className="text-[11px] text-hf-destructive" role="alert">
                      {errors.durationSec}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="aspect" className="block text-xs font-medium text-hf-text">
                    Aspect ratio
                  </label>
                  <select
                    id="aspect"
                    value={brief.aspectRatio}
                    disabled={isPlanning}
                    onBlur={() => markTouched("aspectRatio")}
                    onChange={(e) =>
                      update("aspectRatio", e.target.value as AspectRatio)
                    }
                    className="h-9 w-full rounded-md border border-hf-border bg-hf-bg px-2 text-xs text-hf-text"
                  >
                    {ASPECTS.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3" data-testid="creative-section">
              <Field
                id="tone"
                label="Tone"
                hint="Example: Energetic, premium, kinetic"
                value={brief.tone}
                error={errors.tone}
                disabled={isPlanning}
                onBlur={() => markTouched("tone")}
                onChange={(v) => update("tone", v)}
              />
              <Field
                id="visualDirection"
                label="Visual direction"
                hint="Example: Night city, red and black palette, sharp macro details"
                value={brief.visualDirection}
                error={errors.visualDirection}
                disabled={isPlanning}
                multiline
                onBlur={() => markTouched("visualDirection")}
                onChange={(v) => update("visualDirection", v)}
              />
              <ChipInput
                id="requiredElements"
                label="Required elements"
                hint="Press Enter to add a chip"
                values={brief.requiredElements}
                onChange={(v) => {
                  update("requiredElements", v);
                  markTouched("requiredElements");
                }}
                placeholder="e.g. subtitles"
                disabled={isPlanning}
                error={errors.requiredElements}
              />
              <ChipInput
                id="avoidElements"
                label="Avoid elements"
                hint="Press Enter to add a chip"
                values={brief.avoidElements}
                onChange={(v) => {
                  update("avoidElements", v);
                  markTouched("avoidElements");
                }}
                placeholder="e.g. generic gym imagery"
                disabled={isPlanning}
                error={errors.avoidElements}
              />
              <Field
                id="callToAction"
                label="Call to action (optional)"
                hint="Example: Own the night"
                value={brief.callToAction ?? ""}
                disabled={isPlanning}
                onBlur={() => markTouched("callToAction")}
                onChange={(v) => update("callToAction", v)}
              />
            </div>
          )}

          {isPlanning ? <PlanningProgress /> : null}

          {localError ? (
            <p className="mt-3 text-xs text-hf-destructive" role="alert">
              {localError}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-hf-border px-4 py-3">
          <Button variant="ghost" size="sm" disabled={isPlanning} onClick={onClose}>
            Cancel
          </Button>
          <div className="flex gap-2">
            {section === "basic" ? (
              <Button
                variant="secondary"
                size="sm"
                disabled={isPlanning}
                onClick={() => setSection("creative")}
              >
                Next: Creative
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                disabled={isPlanning}
                onClick={() => setSection("basic")}
              >
                Back
              </Button>
            )}
            <Button
              variant="primary"
              size="sm"
              disabled={isPlanning}
              data-testid="plan-workflow"
              onClick={() => void handleSubmit()}
            >
              {isPlanning ? "Planning…" : "Plan workflow"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlanningProgress() {
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setStageIndex((i) => (i + 1) % PLAN_STAGES.length);
    }, 900);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div
      className="mt-4 rounded-md border border-hf-cyan/30 bg-hf-cyan/10 px-3 py-3"
      data-testid="planning-progress"
      aria-live="polite"
    >
      <div className="mb-2 flex items-center gap-2 text-xs text-hf-text">
        <Spinner label="Planning workflow" />
        Planning workflow…
      </div>
      <ol className="space-y-1">
        {PLAN_STAGES.map((stage, index) => (
          <li
            key={stage}
            className={
              index === stageIndex
                ? "text-xs font-medium text-hf-cyan"
                : "text-xs text-hf-muted"
            }
          >
            {index === stageIndex ? "→ " : ""}
            {stage}
          </li>
        ))}
      </ol>
      <p className="mt-2 text-[11px] text-hf-muted">
        Stages are a progress presentation — not exact backend milestones.
      </p>
    </div>
  );
}

function Field({
  id,
  label,
  hint,
  value,
  onChange,
  onBlur,
  error,
  disabled,
  multiline,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  error?: string;
  disabled?: boolean;
  multiline?: boolean;
}) {
  const className =
    "w-full rounded-md border bg-hf-bg px-2.5 py-2 text-xs text-hf-text outline-none placeholder:text-hf-muted focus-visible:border-hf-cyan " +
    (error ? "border-hf-destructive" : "border-hf-border");

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-medium text-hf-text">
        {label}
      </label>
      {hint ? <p className="text-[11px] text-hf-muted">{hint}</p> : null}
      {multiline ? (
        <textarea
          id={id}
          rows={3}
          value={value}
          disabled={disabled}
          onBlur={onBlur}
          onChange={(e) => onChange(e.target.value)}
          className={className}
        />
      ) : (
        <input
          id={id}
          value={value}
          disabled={disabled}
          onBlur={onBlur}
          onChange={(e) => onChange(e.target.value)}
          className={className + " h-9"}
        />
      )}
      {error ? (
        <p className="text-[11px] text-hf-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
