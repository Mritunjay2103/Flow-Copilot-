"use client";

import { cn } from "@/lib/cn";

export type TabItem<T extends string> = {
  id: T;
  label: string;
};

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  className,
  "aria-label": ariaLabel,
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn("flex border-b border-hf-border", className)}
    >
      {items.map((item) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            className={cn(
              "relative flex-1 px-3 py-2 text-xs font-medium transition-colors",
              selected ? "text-hf-text" : "text-hf-muted hover:text-hf-text",
            )}
            onClick={() => onChange(item.id)}
          >
            {item.label}
            {selected ? (
              <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-hf-cyan" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
