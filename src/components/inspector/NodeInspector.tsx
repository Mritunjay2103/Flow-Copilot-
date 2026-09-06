"use client";

import { useState, type ReactNode } from "react";
import { Badge, Button } from "@/components/ui";
import { STATUS_META } from "@/components/canvas/node-visuals";
import { InspectorOutput } from "@/components/inspector/InspectorOutput";
import {
  WorkflowNodeSchema,
  type SettingEntry,
  type Workflow,
  type WorkflowNode,
} from "@/lib/workflow";
import { useWorkflowStore } from "@/store/workflow-store";

export function NodeInspector({
  node,
  workflow,
  initialTab = "config",
}: {
  node: WorkflowNode | null;
  workflow: Workflow | null;
  initialTab?: "config" | "output";
}) {
  if (!workflow) {
    return (
      <p className="text-xs text-hf-muted" data-testid="inspector-panel">
        Load a workflow to inspect nodes.
      </p>
    );
  }

  if (!node) {
    return (
      <p className="text-xs text-hf-muted" data-testid="inspector-panel">
        Select a node on the canvas to inspect config and runtime.
      </p>
    );
  }

  return (
    <NodeInspectorForm
      key={`${node.id}-${initialTab}`}
      node={node}
      workflow={workflow}
      initialTab={initialTab}
    />
  );
}

function NodeInspectorForm({
  node,
  workflow,
  initialTab,
}: {
  node: WorkflowNode;
  workflow: Workflow;
  initialTab: "config" | "output";
}) {
  const updateNodeConfig = useWorkflowStore((s) => s.updateNodeConfig);
  const retryNode = useWorkflowStore((s) => s.retryNode);
  const isRunning = useWorkflowStore((s) => s.isRunning);

  const [tab, setTab] = useState<"config" | "output">(initialTab);
  const [label, setLabel] = useState(node.label);
  const [description, setDescription] = useState(node.description);
  const [instruction, setInstruction] = useState(node.config.instruction);
  const [enabled, setEnabled] = useState(node.config.enabled);
  const [settingsText, setSettingsText] = useState(
    node.config.settings.map((s) => `${s.key}=${s.value}`).join("\n"),
  );
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  const incoming = workflow.edges.filter((e) => e.target === node.id);
  const outgoing = workflow.edges.filter((e) => e.source === node.id);
  const status = STATUS_META[node.runtime.status];
  const locked = node.locked;
  const canRetry =
    node.runtime.status === "failed" ||
    node.runtime.status === "needs_provider";

  const parseSettings = (): SettingEntry[] | null => {
    const lines = settingsText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const settings: SettingEntry[] = [];
    for (const line of lines) {
      const eq = line.indexOf("=");
      if (eq <= 0) {
        setError("Settings must use key=value lines.");
        return null;
      }
      settings.push({
        key: line.slice(0, eq).trim(),
        value: line.slice(eq + 1).trim(),
      });
    }
    return settings;
  };

  const handleSave = () => {
    setError(null);
    if (locked) {
      setError("Locked nodes cannot be edited.");
      return;
    }
    const settings = parseSettings();
    if (!settings) return;

    const candidate = {
      ...node,
      label: label.trim(),
      description: description.trim(),
      config: {
        ...node.config,
        instruction: instruction.trim(),
        enabled,
        settings,
      },
    };
    const parsed = WorkflowNodeSchema.safeParse(candidate);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid node fields.");
      return;
    }

    const result = updateNodeConfig(node.id, {
      label: parsed.data.label,
      description: parsed.data.description,
      config: {
        instruction: parsed.data.config.instruction,
        enabled: parsed.data.config.enabled,
        settings: parsed.data.config.settings,
      },
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1200);
  };

  return (
    <div className="space-y-3 text-xs" data-testid="inspector-panel">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-hf-muted">Kind</div>
          <div className="font-mono text-hf-cyan" data-testid="inspector-kind">
            {node.kind}
          </div>
        </div>
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${status.className}`}
          data-testid="inspector-status"
        >
          {status.label}
        </span>
      </div>

      <div
        role="tablist"
        aria-label="Inspector sections"
        className="flex border-b border-hf-border"
      >
        {(
          [
            ["config", "Config"],
            ["output", "Output"],
          ] as const
        ).map(([id, labelText]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            data-testid={`inspector-tab-${id}`}
            className={
              tab === id
                ? "relative flex-1 px-2 py-1.5 text-xs font-medium text-hf-text"
                : "flex-1 px-2 py-1.5 text-xs font-medium text-hf-muted hover:text-hf-text"
            }
            onClick={() => setTab(id)}
          >
            {labelText}
            {tab === id ? (
              <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-hf-violet" />
            ) : null}
          </button>
        ))}
      </div>

      {tab === "output" ? (
        <InspectorOutput
          output={node.runtime.output}
          status={node.runtime.status}
          error={node.runtime.error}
        />
      ) : (
        <>
          {locked ? <Badge tone="neutral">Locked — view only</Badge> : null}

          <Field label="Label">
            <input
              data-testid="inspector-label"
              value={label}
              disabled={locked}
              maxLength={60}
              onChange={(e) => setLabel(e.target.value)}
              className="h-8 w-full rounded-md border border-hf-border bg-hf-bg px-2 text-xs text-hf-text disabled:opacity-60"
            />
          </Field>

          <Field label="Description">
            <textarea
              data-testid="inspector-description"
              value={description}
              disabled={locked}
              maxLength={240}
              rows={2}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-md border border-hf-border bg-hf-bg px-2 py-1.5 text-xs text-hf-text disabled:opacity-60"
            />
          </Field>

          <Field label="Instruction">
            <textarea
              data-testid="inspector-instruction"
              value={instruction}
              disabled={locked}
              maxLength={2000}
              rows={4}
              onChange={(e) => setInstruction(e.target.value)}
              className="w-full rounded-md border border-hf-border bg-hf-bg px-2 py-1.5 text-xs text-hf-text disabled:opacity-60"
            />
          </Field>

          <label className="flex items-center gap-2 text-xs text-hf-text">
            <input
              type="checkbox"
              data-testid="inspector-enabled"
              checked={enabled}
              disabled={locked}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            Enabled
          </label>

          <Field label="Settings (key=value per line)">
            <textarea
              data-testid="inspector-settings"
              value={settingsText}
              disabled={locked}
              rows={3}
              onChange={(e) => setSettingsText(e.target.value)}
              className="w-full rounded-md border border-hf-border bg-hf-bg px-2 py-1.5 font-mono text-[11px] text-hf-text disabled:opacity-60"
            />
          </Field>

          {!locked ? (
            <Button
              size="sm"
              variant="primary"
              data-testid="inspector-save"
              onClick={handleSave}
            >
              {savedFlash ? "Saved" : "Save changes"}
            </Button>
          ) : null}

          {error ? (
            <p className="text-hf-destructive" role="alert">
              {error}
            </p>
          ) : null}

          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wide text-hf-muted">
              Incoming
            </div>
            {incoming.length === 0 ? (
              <p className="text-hf-muted">None</p>
            ) : (
              <ul className="space-y-0.5" data-testid="inspector-incoming">
                {incoming.map((e) => (
                  <li key={e.id} className="font-mono text-[11px] text-hf-text">
                    {e.source} → {node.id}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wide text-hf-muted">
              Outgoing
            </div>
            {outgoing.length === 0 ? (
              <p className="text-hf-muted">None</p>
            ) : (
              <ul className="space-y-0.5" data-testid="inspector-outgoing">
                {outgoing.map((e) => (
                  <li key={e.id} className="font-mono text-[11px] text-hf-text">
                    {node.id} → {e.target}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {canRetry ? (
        <Button
          size="sm"
          variant="secondary"
          data-testid="inspector-retry"
          disabled={isRunning}
          onClick={() => void retryNode(node.id)}
        >
          Retry node
        </Button>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] uppercase tracking-wide text-hf-muted">{label}</div>
      {children}
    </div>
  );
}
