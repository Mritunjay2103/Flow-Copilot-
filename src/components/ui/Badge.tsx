import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type BadgeTone = "neutral" | "violet" | "cyan" | "success" | "warning" | "danger";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-hf-panel-elevated text-hf-muted border-hf-border",
  violet: "bg-hf-violet/15 text-hf-violet border-hf-violet/30",
  cyan: "bg-hf-cyan/15 text-hf-cyan border-hf-cyan/30",
  success: "bg-hf-success/15 text-hf-success border-hf-success/30",
  warning: "bg-hf-warning/15 text-hf-warning border-hf-warning/30",
  danger: "bg-hf-destructive/15 text-hf-destructive border-hf-destructive/30",
};

export function Badge({
  className,
  tone = "neutral",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium tracking-wide",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
