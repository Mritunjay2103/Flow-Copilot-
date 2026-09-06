"use client";

import { useId } from "react";
import { Button } from "@/components/ui";
import { ModalDialog } from "@/components/ui/ModalDialog";

export function ShareDialog({
  open,
  onClose,
  onCopyLink,
  onOpenExport,
  status,
}: {
  open: boolean;
  onClose: () => void;
  onCopyLink: () => Promise<"copied" | "failed" | "too_large">;
  onOpenExport: () => void;
  status: "idle" | "copied" | "failed" | "too_large" | null;
}) {
  const noteId = useId();

  if (!open) return null;

  return (
    <ModalDialog
      title="Share workflow"
      description="Creates a client-side compressed URL hash. Nothing is uploaded to a server."
      onClose={onClose}
      testId="share-dialog"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
          {status === "too_large" ? (
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                onClose();
                onOpenExport();
              }}
              data-testid="share-fallback-export"
            >
              Export JSON instead
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={() => void onCopyLink()}
              data-testid="share-copy"
            >
              Copy share link
            </Button>
          )}
        </>
      }
    >
      <p id={noteId} className="text-xs leading-relaxed text-hf-muted">
        Default shared links include workflow structure and configuration, but not runtime
        outputs from previous runs.
      </p>
      {status === "copied" ? (
        <p className="mt-3 text-xs text-hf-success" role="status" data-testid="share-copied">
          Link copied to clipboard.
        </p>
      ) : null}
      {status === "failed" ? (
        <p className="mt-3 text-xs text-hf-destructive" role="alert">
          Could not copy automatically. Try again or use Export JSON.
        </p>
      ) : null}
      {status === "too_large" ? (
        <p className="mt-3 text-xs text-hf-warning" role="alert" data-testid="share-too-large">
          This workflow is too large for a share URL. Use JSON export instead.
        </p>
      ) : null}
    </ModalDialog>
  );
}
