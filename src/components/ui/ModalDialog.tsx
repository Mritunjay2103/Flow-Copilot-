"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { IconButton } from "@/components/ui";
import { cn } from "@/lib/cn";

export function ModalDialog({
  title,
  description,
  onClose,
  children,
  footer,
  testId,
  className,
  initialFocusRef,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  testId?: string;
  className?: string;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
}) {
  const titleId = useId();
  const descId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const focusTarget =
      initialFocusRef?.current ??
      dialogRef.current?.querySelector<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
    focusTarget?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previouslyFocused.current?.focus?.();
    };
  }, [onClose, initialFocusRef]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 p-0 sm:items-center sm:p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        data-testid={testId}
        className={cn(
          "flex w-full max-w-md flex-col overflow-hidden rounded-t-xl border border-hf-border bg-hf-panel shadow-2xl sm:rounded-xl",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-hf-border px-4 py-3">
          <div>
            <h2 id={titleId} className="text-sm font-semibold text-hf-text">
              {title}
            </h2>
            {description ? (
              <p id={descId} className="mt-0.5 text-[11px] text-hf-muted">
                {description}
              </p>
            ) : null}
          </div>
          <IconButton label={`Close ${title}`} tooltip="Close" onClick={onClose}>
            <X className="h-4 w-4" aria-hidden />
          </IconButton>
        </div>
        <div className="px-4 py-3">{children}</div>
        {footer ? (
          <div className="flex items-center justify-end gap-2 border-t border-hf-border px-4 py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
