"use client";

import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { ModalDialog } from "@/components/ui/ModalDialog";
import { validateImportFile } from "@/lib/workflow";

export function ImportDialog({
  open,
  onClose,
  onImport,
}: {
  open: boolean;
  onClose: () => void;
  onImport: (json: string) => { ok: true } | { ok: false; error: string };
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const handleFile = async (file: File | undefined) => {
    setError(null);
    if (!file) return;
    const check = validateImportFile(file);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setBusy(true);
    try {
      const text = await file.text();
      const result = onImport(text);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onClose();
    } catch {
      setError("Could not read the selected file.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalDialog
      title="Import workflow"
      description={`Accepts .json only, up to 1 MB. The current workflow is replaced only after validation succeeds — Undo restores the previous graph.`}
      onClose={onClose}
      testId="import-dialog"
      footer={
        <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
      }
    >
      <label htmlFor={inputId} className="block text-xs font-medium text-hf-text">
        Workflow JSON file
      </label>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept=".json,application/json"
        disabled={busy}
        data-testid="import-file-input"
        className="mt-2 block w-full text-xs text-hf-muted file:mr-3 file:rounded-md file:border file:border-hf-border file:bg-hf-panel-elevated file:px-2.5 file:py-1.5 file:text-xs file:text-hf-text"
        onChange={(e) => {
          void handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {error ? (
        <p className="mt-3 text-xs text-hf-destructive" role="alert" data-testid="import-error">
          {error}
        </p>
      ) : null}
    </ModalDialog>
  );
}
