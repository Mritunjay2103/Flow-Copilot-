import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { IconButton } from "./IconButton";

export type BannerTone = "danger" | "info" | "success";

const toneClass: Record<BannerTone, string> = {
  danger:
    "border-hf-destructive/40 bg-hf-destructive/10 text-hf-destructive",
  info: "border-hf-cyan/40 bg-hf-cyan/10 text-hf-cyan",
  success: "border-hf-success/40 bg-hf-success/10 text-hf-success",
};

export function StatusBanner({
  message,
  tone = "danger",
  onDismiss,
  className,
}: {
  message: string;
  tone?: BannerTone;
  onDismiss?: () => void;
  className?: string;
}) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      data-testid="status-banner"
      data-tone={tone}
      className={cn(
        "flex items-start gap-2 border px-3 py-2 text-xs",
        toneClass[tone],
        className,
      )}
    >
      <p className="min-w-0 flex-1 leading-relaxed text-hf-text">{message}</p>
      {onDismiss ? (
        <IconButton
          label={tone === "danger" ? "Dismiss error" : "Dismiss message"}
          tooltip="Dismiss"
          className="h-6 w-6"
          onClick={onDismiss}
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </IconButton>
      ) : null}
    </div>
  );
}

/** @deprecated Prefer StatusBanner with tone — kept for existing imports. */
export function ErrorBanner({
  message,
  onDismiss,
  className,
}: {
  message: string;
  onDismiss?: () => void;
  className?: string;
}) {
  return (
    <StatusBanner
      message={message}
      tone="danger"
      onDismiss={onDismiss}
      className={className}
    />
  );
}
