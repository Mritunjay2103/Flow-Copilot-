"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui";
import { ModalDialog } from "@/components/ui/ModalDialog";
import { sanitizeWorkflowFilename } from "@/lib/workflow";

export function ExportDialog({
  open,
  workflowTitle,
  onClose,
  onExport,
}: {
  open: boolean;
  workflowTitle: string;
  onClose: () => void;
  onExport: (options: { includeRuntime: boolean }) => boolean;
}) {
  const [excludeRuntime, setExcludeRuntime] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const checkboxId = useId();

  if (!open) return null;

  const filename = `${sanitizeWorkflowFilename(workflowTitle)}.json`;

  const handleDownload = () => {
    setError(null);
    const ok = onExport({ includeRuntime: !excludeRuntime });
    if (!ok) {
      setError("Export failed validation. Fix the workflow, then try again.");
      return;
    }
    onClose();
  };

  return (
    <ModalDialog
      title="Export workflow"
      description={`Downloads ${filename}. Validated before download.`}
      onClose={onClose}
      testId="export-dialog"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={handleDownload} data-testid="export-download">
            Download JSON
          </Button>
        </>
      }
    >
      <label
        htmlFor={checkboxId}
        className="flex cursor-pointer items-start gap-2.5 text-xs text-hf-text"
      >
        <input
          id={checkboxId}
          type="checkbox"
          checked={excludeRuntime}
          onChange={(e) => setExcludeRuntime(e.target.checked)}
          className="mt-0.5"
          data-testid="export-exclude-runtime"
        />
        <span>
          Exclude runtime outputs
          <span className="mt-0.5 block text-[11px] text-hf-muted">
            By default the file includes configuration and any run outputs. Check this to export
            structure and config only.
          </span>
        </span>
      </label>
      {error ? (
        <p className="mt-3 text-xs text-hf-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </ModalDialog>
  );
}
