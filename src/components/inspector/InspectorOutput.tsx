"use client";

import { useState } from "react";
import { Badge, Button } from "@/components/ui";
import type { ExecutionArtifact, NodeExecutionResult } from "@/lib/workflow";

export function InspectorOutput({
  output,
  status,
  error,
}: {
  output: NodeExecutionResult | undefined;
  status: string;
  error?: string;
}) {
  if (!output && !error) {
    return (
      <p className="text-xs text-hf-muted" data-testid="inspector-output-empty">
        No output yet. Run the workflow or this node to inspect results.
      </p>
    );
  }

  return (
    <div className="space-y-3" data-testid="inspector-output-panel">
      {status === "needs_provider" ? (
        <p
          className="rounded-md border border-hf-warning/30 bg-hf-warning/10 px-2 py-1.5 text-[11px] text-hf-warning"
          data-testid="inspector-provider-note"
        >
          Workflow logic completed; connect a generation provider to render this
          asset.
        </p>
      ) : null}

      {error ? (
        <div className="rounded-md border border-hf-destructive/40 bg-hf-destructive/10 px-2 py-1.5 text-xs text-hf-destructive">
          {error}
        </div>
      ) : null}

      {output ? (
        <>
          <section>
            <div className="mb-1 text-[10px] uppercase tracking-wide text-hf-muted">
              Summary
            </div>
            <p className="text-xs text-hf-text" data-testid="inspector-output-summary">
              {output.summary}
            </p>
          </section>

          {output.decisions.length > 0 ? (
            <section>
              <div className="mb-1 text-[10px] uppercase tracking-wide text-hf-muted">
                Decisions
              </div>
              <ul className="list-disc space-y-0.5 pl-4 text-xs text-hf-text">
                {output.decisions.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {output.warnings.length > 0 ? (
            <section>
              <div className="mb-1 text-[10px] uppercase tracking-wide text-hf-muted">
                Warnings
              </div>
              <ul className="list-disc space-y-0.5 pl-4 text-xs text-hf-warning">
                {output.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </section>
          ) : null}

          <section>
            <div className="mb-1 text-[10px] uppercase tracking-wide text-hf-muted">
              Artifacts
            </div>
            {output.artifacts.length === 0 ? (
              <p className="text-xs text-hf-muted">None</p>
            ) : (
              <ul className="space-y-2">
                {output.artifacts.map((artifact) => (
                  <ArtifactCard key={artifact.id} artifact={artifact} />
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}

function ArtifactCard({ artifact }: { artifact: ExecutionArtifact }) {
  const [copied, setCopied] = useState(false);
  const isJson =
    artifact.type.includes("json") || looksLikeJson(artifact.content);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(artifact.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <li
      className="rounded-md border border-hf-border bg-hf-panel-elevated px-2.5 py-2"
      data-testid={`artifact-${artifact.id}`}
    >
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-medium text-hf-text">{artifact.name}</span>
        <span className="font-mono text-[10px] text-hf-muted">{artifact.type}</span>
        {artifact.simulated ? (
          <Badge tone="warning" data-testid={`artifact-simulated-${artifact.id}`}>
            Simulated preview
          </Badge>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          data-testid={`artifact-copy-${artifact.id}`}
          onClick={() => void handleCopy()}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      {isJson ? (
        <JsonArtifact content={artifact.content} />
      ) : (
        <pre className="hf-scroll max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] text-hf-text">
          {artifact.content}
        </pre>
      )}
    </li>
  );
}

function looksLikeJson(content: string): boolean {
  const t = content.trim();
  return (t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"));
}

function JsonArtifact({ content }: { content: string }) {
  const parsed = tryParseJson(content);

  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const entries = Object.entries(parsed as Record<string, unknown>);
    return (
      <div className="overflow-hidden rounded border border-hf-border">
        <table className="w-full text-left text-[11px]">
          <tbody>
            {entries.map(([key, value]) => (
              <tr key={key} className="border-b border-hf-border last:border-0">
                <th className="w-1/3 bg-hf-bg px-2 py-1 font-medium text-hf-muted">
                  {key}
                </th>
                <td className="px-2 py-1 text-hf-text">
                  {typeof value === "string" ? value : JSON.stringify(value)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (Array.isArray(parsed)) {
    return (
      <ul className="space-y-1">
        {parsed.map((item, i) => (
          <li
            key={i}
            className="rounded border border-hf-border bg-hf-bg px-2 py-1 text-[11px] text-hf-text"
          >
            {typeof item === "string" ? item : JSON.stringify(item)}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <pre className="hf-scroll max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] text-hf-text">
      {content}
    </pre>
  );
}

function tryParseJson(content: string): unknown {
  try {
    return JSON.parse(content) as unknown;
  } catch {
    return null;
  }
}
