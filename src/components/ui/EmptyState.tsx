import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function EmptyState({
  title,
  description,
  action,
  footer,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto flex max-w-lg flex-col items-start gap-4 px-6 py-10",
        className,
      )}
    >
      <div className="space-y-2">
        <h2 className="text-lg font-semibold tracking-tight text-hf-text">{title}</h2>
        {description ? (
          <p className="text-sm leading-relaxed text-hf-muted">{description}</p>
        ) : null}
      </div>
      {action}
      {footer}
    </div>
  );
}
