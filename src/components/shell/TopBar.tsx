"use client";

import {
  Download,
  Layers,
  Play,
  Redo2,
  Share2,
  Square,
  Undo2,
  Upload,
} from "lucide-react";
import { Button, IconButton } from "@/components/ui";
import { ModeBadge } from "./ModeBadge";
import type { ConnectionStatus } from "@/store/workflow-store";

export function TopBar({
  workflowTitle,
  connectionStatus,
  canUndo,
  canRedo,
  canRun,
  canExport,
  canShare,
  isRunning,
  onUndo,
  onRedo,
  onExport,
  onImport,
  onShare,
  onRun,
  onCancel,
  onRecheck,
  recheckDisabled,
}: {
  workflowTitle: string | null;
  connectionStatus: ConnectionStatus;
  canUndo: boolean;
  canRedo: boolean;
  canRun: boolean;
  canExport: boolean;
  canShare: boolean;
  isRunning: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onExport: () => void;
  onImport: () => void;
  onShare: () => void;
  onRun: () => void;
  onCancel: () => void;
  onRecheck: () => void;
  recheckDisabled?: boolean;
}) {
  return (
    <header
      className="flex h-[var(--hf-topbar-h)] shrink-0 items-center gap-3 border-b border-hf-border bg-hf-panel px-3"
      role="banner"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          className="relative flex h-8 w-8 items-center justify-center rounded-md border border-hf-border bg-hf-panel-elevated"
          aria-hidden
        >
          <Layers className="h-4 w-4 text-hf-violet" strokeWidth={2.25} />
          <span className="absolute inset-0 m-auto h-1.5 w-1.5 rounded-sm bg-hf-cyan" />
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold tracking-tight text-hf-text max-sm:sr-only">
            Flow Copilot
          </h1>
          <p className="truncate text-[11px] text-hf-muted max-sm:hidden">
            Creative workflow studio
          </p>
        </div>
      </div>

      <ModeBadge
        status={connectionStatus}
        onRecheck={onRecheck}
        recheckDisabled={recheckDisabled}
      />

      <div className="mx-2 hidden h-6 w-px bg-hf-border sm:block" aria-hidden />

      <div
        className="min-w-0 flex-1 truncate text-xs text-hf-muted max-sm:hidden"
        title={workflowTitle ?? undefined}
      >
        {workflowTitle ? (
          <span className="text-hf-text">{workflowTitle}</span>
        ) : (
          "No workflow loaded"
        )}
      </div>

      <div className="flex items-center gap-1">
        <IconButton
          label="Undo"
          tooltip={canUndo ? "Undo" : "Nothing to undo"}
          disabled={!canUndo}
          onClick={onUndo}
        >
          <Undo2 className="h-4 w-4" aria-hidden />
        </IconButton>
        <IconButton
          label="Redo"
          tooltip={canRedo ? "Redo" : "Nothing to redo"}
          disabled={!canRedo}
          onClick={onRedo}
        >
          <Redo2 className="h-4 w-4" aria-hidden />
        </IconButton>
        <IconButton
          label="Import workflow JSON"
          tooltip="Import JSON"
          onClick={onImport}
        >
          <Upload className="h-4 w-4" aria-hidden />
        </IconButton>
        <IconButton
          label="Export workflow JSON"
          tooltip={canExport ? "Export JSON" : "Load a workflow to export"}
          disabled={!canExport}
          onClick={onExport}
        >
          <Download className="h-4 w-4" aria-hidden />
        </IconButton>
        <IconButton
          label="Share workflow"
          tooltip={canShare ? "Copy share link" : "Load a workflow to share"}
          disabled={!canShare}
          onClick={onShare}
        >
          <Share2 className="h-4 w-4" aria-hidden />
        </IconButton>
        {isRunning ? (
          <Button variant="danger" size="sm" onClick={onCancel} className="ml-1">
            <Square className="h-3.5 w-3.5" aria-hidden />
            Cancel
          </Button>
        ) : (
          <Button
            variant="primary"
            size="sm"
            className="ml-1"
            disabled={!canRun}
            title={!canRun ? "Load a workflow to run" : undefined}
            onClick={onRun}
          >
            <Play className="h-3.5 w-3.5" aria-hidden />
            Run workflow
          </Button>
        )}
      </div>
    </header>
  );
}
