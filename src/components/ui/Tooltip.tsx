"use client";

import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Tooltip({
  content,
  children,
  disabled,
  className,
}: {
  content: ReactNode;
  children: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  if (disabled) return <>{children}</>;

  return (
    <span
      className={cn("relative inline-flex", className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocusCapture={() => setOpen(true)}
      onBlurCapture={() => setOpen(false)}
    >
      {children}
      {open ? (
        <span
          id={id}
          role="tooltip"
          className="pointer-events-none absolute left-1/2 top-full z-50 mt-1.5 w-max max-w-[220px] -translate-x-1/2 rounded-md border border-hf-border bg-hf-panel-elevated px-2 py-1 text-[11px] leading-snug text-hf-text shadow-lg"
        >
          {content}
        </span>
      ) : null}
    </span>
  );
}
