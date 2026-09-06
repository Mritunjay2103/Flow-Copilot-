"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Button, Spinner } from "@/components/ui";
import { modeBadgeCopy } from "@/components/shell/ModeBadge";
import { useWorkflowStore } from "@/store/workflow-store";

export const COPILOT_INTRO =
  "Describe a change and I’ll update the workflow without rebuilding your work.";

export const COPILOT_SUGGESTIONS = [
  "Add three hook variants",
  "Insert a brand consistency check",
  "Replace voice-over with subtitles",
  "Adapt this for Reels and Shorts",
  "Make the pacing more cinematic",
] as const;

const LONG_WAIT_MS = 8000;

export function CopilotPanel() {
  const workflow = useWorkflowStore((s) => s.activeWorkflow);
  const messages = useWorkflowStore((s) => s.copilotMessages);
  const isEditing = useWorkflowStore((s) => s.isEditing);
  const lastError = useWorkflowStore((s) => s.lastError);
  const failedCommand = useWorkflowStore((s) => s.failedCopilotCommand);
  const connectionStatus = useWorkflowStore((s) => s.connectionStatus);
  const activeMode = useWorkflowStore((s) => s.activeMode);
  const connectedModel = useWorkflowStore((s) => s.connectedModel);
  const lastEditOperations = useWorkflowStore((s) => s.lastEditOperations);
  const sendCopilotCommand = useWorkflowStore((s) => s.sendCopilotCommand);
  const cancelCopilotEdit = useWorkflowStore((s) => s.cancelCopilotEdit);
  const clearError = useWorkflowStore((s) => s.clearError);

  const [draft, setDraft] = useState("");
  const [opsOpen, setOpsOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  useEffect(() => {
    const el = listRef.current;
    if (!el || !stickToBottom.current) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, isEditing]);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottom.current = distance < 48;
  };

  const canSend =
    Boolean(workflow) && !isEditing && draft.trim().length > 0;

  const handleSend = async (text = draft) => {
    const trimmed = text.trim();
    if (!workflow || isEditing || !trimmed) return;
    stickToBottom.current = true;
    const ok = await sendCopilotCommand(trimmed);
    if (ok) {
      setDraft("");
    } else {
      setDraft(trimmed);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };

  const modeLabel = modeBadgeCopy(connectionStatus).label;
  const engine =
    activeMode === "ollama"
      ? "Ollama"
      : activeMode === "demo"
        ? "Demo engine"
        : modeLabel;
  const modelCaption = connectedModel
    ? `${engine} · ${connectedModel}`
    : engine;

  const isDev = process.env.NODE_ENV === "development";

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="copilot-panel">
      <div className="shrink-0 border-b border-hf-border px-3 py-2">
        <p
          className="text-[11px] text-hf-muted"
          data-testid="copilot-mode-caption"
        >
          {modelCaption}
        </p>
      </div>

      <div
        ref={listRef}
        onScroll={onScroll}
        className="hf-scroll min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3"
        data-testid="copilot-history"
      >
        <div
          className="rounded-md border border-hf-border bg-hf-panel-elevated px-2.5 py-2"
          data-testid="copilot-intro"
        >
          <div className="text-[10px] uppercase tracking-wide text-hf-muted">
            assistant
          </div>
          <p className="mt-1 text-xs text-hf-text">{COPILOT_INTRO}</p>
        </div>

        {messages.map((m) => (
          <div
            key={m.id}
            className="rounded-md border border-hf-border bg-hf-panel-elevated px-2.5 py-2"
            data-testid={`copilot-message-${m.role}`}
          >
            <div className="text-[10px] uppercase tracking-wide text-hf-muted">
              {m.role}
            </div>
            <p className="mt-1 whitespace-pre-wrap text-xs text-hf-text">
              {m.content}
            </p>
            {m.operationChips && m.operationChips.length > 0 ? (
              <div
                className="mt-2 flex flex-wrap gap-1"
                data-testid="copilot-operation-chips"
              >
                {m.operationChips.map((chip) => (
                  <span
                    key={chip}
                    className="rounded border border-hf-violet/30 bg-hf-violet/15 px-1.5 py-0.5 text-[10px] text-hf-text"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            ) : null}
            {m.isClarification ? (
              <p
                className="mt-1 text-[11px] text-hf-muted"
                data-testid="copilot-clarification"
              >
                No graph changes applied.
              </p>
            ) : null}
          </div>
        ))}

        {isEditing ? (
          <EditingStatus onCancel={() => cancelCopilotEdit()} />
        ) : null}
      </div>

      {!workflow ? (
        <p
          className="shrink-0 px-3 py-2 text-[11px] text-hf-muted"
          data-testid="copilot-no-workflow"
        >
          Create or load a workflow to send Copilot commands.
        </p>
      ) : (
        <div
          className="shrink-0 space-y-2 border-t border-hf-border px-3 py-2"
          data-testid="copilot-suggestions"
        >
          <div className="flex flex-wrap gap-1">
            {COPILOT_SUGGESTIONS.map((suggestion, index) => (
              <button
                key={suggestion}
                type="button"
                disabled={isEditing}
                data-testid={`copilot-suggestion-${index}`}
                className="rounded border border-hf-border bg-hf-bg px-1.5 py-1 text-left text-[10px] text-hf-muted transition-colors hover:border-hf-cyan/40 hover:text-hf-text disabled:opacity-50"
                onClick={() => setDraft(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}

      {lastError ? (
        <div
          className="shrink-0 border-t border-hf-destructive/30 bg-hf-destructive/10 px-3 py-2"
          data-testid="copilot-error"
        >
          <p className="text-xs text-hf-destructive">{lastError}</p>
          <div className="mt-1.5 flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              data-testid="copilot-retry"
              disabled={!failedCommand || isEditing || !workflow}
              onClick={() => {
                clearError();
                const text = failedCommand ?? draft;
                setDraft(text);
                void handleSend(text);
              }}
            >
              Retry
            </Button>
            <Button size="sm" variant="ghost" onClick={() => clearError()}>
              Dismiss
            </Button>
          </div>
        </div>
      ) : null}

      {isDev && lastEditOperations && lastEditOperations.length > 0 ? (
        <div className="shrink-0 border-t border-hf-border px-3 py-2">
          <button
            type="button"
            className="text-[11px] font-medium text-hf-muted hover:text-hf-text"
            data-testid="copilot-ops-toggle"
            onClick={() => setOpsOpen((v) => !v)}
          >
            {opsOpen ? "Hide" : "Show"} Operation details
          </button>
          {opsOpen ? (
            <pre
              className="mt-1 max-h-32 overflow-auto rounded border border-hf-border bg-hf-bg p-2 font-mono text-[10px] text-hf-muted"
              data-testid="copilot-ops-details"
            >
              {JSON.stringify(
                lastEditOperations.map((op) => ({
                  type: op.type,
                  reason: op.reason,
                  ...(op.type === "add_node"
                    ? { nodeId: op.node.id, kind: op.node.kind }
                    : {}),
                  ...(op.type === "update_node" || op.type === "remove_node"
                    ? { nodeId: op.nodeId }
                    : {}),
                  ...(op.type === "add_edge"
                    ? {
                        edgeId: op.edge.id,
                        source: op.edge.source,
                        target: op.edge.target,
                      }
                    : {}),
                  ...(op.type === "remove_edge" ? { edgeId: op.edgeId } : {}),
                  ...(op.type === "replace_edge"
                    ? {
                        edgeId: op.edgeId,
                        source: op.edge.source,
                        target: op.edge.target,
                      }
                    : {}),
                  ...(op.type === "update_workflow_metadata"
                    ? { patchKeys: Object.keys(op.patch) }
                    : {}),
                })),
                null,
                2,
              )}
            </pre>
          ) : null}
        </div>
      ) : null}

      <div className="shrink-0 border-t border-hf-border p-3">
        <label htmlFor="copilot-composer" className="sr-only">
          Copilot command
        </label>
        <textarea
          id="copilot-composer"
          data-testid="copilot-composer"
          rows={3}
          value={draft}
          disabled={isEditing || !workflow}
          placeholder={
            workflow
              ? "Ask for a graph change… (Enter to send, Shift+Enter for newline)"
              : "Load a workflow to chat"
          }
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          className="w-full resize-none rounded-md border border-hf-border bg-hf-bg px-2.5 py-2 text-xs text-hf-text outline-none placeholder:text-hf-muted focus-visible:border-hf-cyan disabled:opacity-50"
        />
        <div className="mt-2 flex justify-end">
          <Button
            size="sm"
            variant="primary"
            data-testid="copilot-send"
            disabled={!canSend}
            onClick={() => void handleSend()}
          >
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}

function EditingStatus({ onCancel }: { onCancel: () => void }) {
  const [longWait, setLongWait] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setLongWait(true), LONG_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div
      className="rounded-md border border-hf-cyan/30 bg-hf-cyan/10 px-2.5 py-2"
      data-testid="copilot-loading"
      aria-live="polite"
    >
      <div className="flex items-center gap-2 text-xs text-hf-text">
        <Spinner label="Planning graph changes" />
        Planning graph changes…
      </div>
      <p
        className="mt-1 text-[11px] text-hf-muted"
        data-testid="copilot-wait-helper"
      >
        {longWait
          ? "Local models can take a little longer; your graph is unchanged until validation completes"
          : "Validating on the server before updating the canvas."}
      </p>
      <Button
        size="sm"
        variant="ghost"
        className="mt-2"
        data-testid="copilot-cancel"
        onClick={onCancel}
      >
        Cancel
      </Button>
    </div>
  );
}
