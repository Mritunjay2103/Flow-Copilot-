"use client";

import { useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

export function ChipInput({
  id,
  label,
  hint,
  values,
  onChange,
  placeholder,
  error,
  disabled,
}: {
  id: string;
  label: string;
  hint?: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState("");

  const commit = () => {
    const next = draft.trim();
    if (!next) return;
    if (values.includes(next)) {
      setDraft("");
      return;
    }
    onChange([...values, next.slice(0, 120)]);
    setDraft("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      commit();
    }
    if (event.key === "Backspace" && !draft && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  };

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-medium text-hf-text">
        {label}
      </label>
      {hint ? <p className="text-[11px] text-hf-muted">{hint}</p> : null}
      <div
        className={cn(
          "flex min-h-10 flex-wrap items-center gap-1.5 rounded-md border bg-hf-bg px-2 py-1.5",
          error ? "border-hf-destructive" : "border-hf-border",
        )}
      >
        {values.map((value) => (
          <span
            key={value}
            className="inline-flex items-center gap-1 rounded border border-hf-violet/30 bg-hf-violet/15 px-1.5 py-0.5 text-[11px] text-hf-text"
          >
            {value}
            <button
              type="button"
              className="rounded p-0.5 text-hf-muted hover:text-hf-text"
              aria-label={`Remove ${value}`}
              disabled={disabled}
              onClick={() => onChange(values.filter((v) => v !== value))}
            >
              <X className="h-3 w-3" aria-hidden />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={commit}
          className="min-w-[120px] flex-1 bg-transparent text-xs text-hf-text outline-none placeholder:text-hf-muted"
        />
      </div>
      {error ? (
        <p className="text-[11px] text-hf-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
