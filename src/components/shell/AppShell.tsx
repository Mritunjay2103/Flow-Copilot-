"use client";

import { useEffect, useMemo, useState } from "react";
import { Menu, MessageSquare, PanelLeft, X } from "lucide-react";
import { WorkflowCanvas } from "@/components/canvas/WorkflowCanvas";
import { BriefComposer } from "@/components/brief/BriefComposer";
import { CanvasEmptyState } from "@/components/brief/CanvasEmptyState";
import {
  SAMPLE_BRIEFS,
  type SampleBriefDefinition,
} from "@/components/brief/sample-briefs";
import { ExportDialog } from "@/components/io/ExportDialog";
import { ImportDialog } from "@/components/io/ImportDialog";
import { ShareDialog } from "@/components/io/ShareDialog";
import { OnboardingTour } from "@/components/onboarding/OnboardingTour";
import { IconButton, PanelSkeleton, StatusBanner } from "@/components/ui";
import { planWorkflowFromBrief } from "@/lib/demo";
import {
  createBranchedHookWorkflow,
  createMinimalValidWorkflow,
  layoutWorkflow,
  sanitizeWorkflowFilename,
  type CreativeBrief,
} from "@/lib/workflow";
import { useWorkflowStore } from "@/store/workflow-store";
import { ExecutionDrawer } from "@/components/execution/ExecutionDrawer";
import { ExecutionToast } from "@/components/execution/ExecutionToast";
import { LeftRail, type SampleTemplate } from "./LeftRail";
import { RightPanel, type RightTab } from "./RightPanel";
import { TopBar } from "./TopBar";

const TEMPLATES: SampleTemplate[] = [
  {
    id: "sneaker-hooks",
    title: "Sneaker hooks",
    description: "Branched Reels workflow with hook variants",
  },
  {
    id: "minimal",
    title: "Minimal pipeline",
    description: "Brief → analyze → output",
  },
  {
    id: "tea-calm",
    title: "Coffee multi-platform",
    description: "Warm launch template from sample brief",
  },
];

export function AppShell() {
  const activeWorkflow = useWorkflowStore((s) => s.activeWorkflow);
  const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId);
  const executionProgress = useWorkflowStore((s) => s.executionProgress);
  const isPlanning = useWorkflowStore((s) => s.isPlanning);
  const isRunning = useWorkflowStore((s) => s.isRunning);
  const lastError = useWorkflowStore((s) => s.lastError);
  const undoStack = useWorkflowStore((s) => s.undoStack);
  const redoStack = useWorkflowStore((s) => s.redoStack);
  const connectionStatus = useWorkflowStore((s) => s.connectionStatus);

  const hydrateFromStorage = useWorkflowStore((s) => s.hydrateFromStorage);
  const refreshConnectionStatus = useWorkflowStore((s) => s.refreshConnectionStatus);
  const createWorkflowFromBrief = useWorkflowStore((s) => s.createWorkflowFromBrief);
  const loadWorkflow = useWorkflowStore((s) => s.loadWorkflow);
  const clearWorkflow = useWorkflowStore((s) => s.clearWorkflow);
  const undo = useWorkflowStore((s) => s.undo);
  const redo = useWorkflowStore((s) => s.redo);
  const exportWorkflow = useWorkflowStore((s) => s.exportWorkflow);
  const importWorkflow = useWorkflowStore((s) => s.importWorkflow);
  const createShareUrl = useWorkflowStore((s) => s.createShareUrl);
  const loadFromShareUrl = useWorkflowStore((s) => s.loadFromShareUrl);
  const runWorkflow = useWorkflowStore((s) => s.runWorkflow);
  const runNeedsRuntimeReset = useWorkflowStore((s) => s.runNeedsRuntimeReset);
  const cancelRun = useWorkflowStore((s) => s.cancelRun);
  const clearError = useWorkflowStore((s) => s.clearError);
  const selectNode = useWorkflowStore((s) => s.selectNode);
  const lastRunSummary = useWorkflowStore((s) => s.lastRunSummary);

  const [rightTab, setRightTab] = useState<RightTab>("copilot");
  const [inspectorTab, setInspectorTab] = useState<"config" | "output">("config");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mobileLeftOpen, setMobileLeftOpen] = useState(false);
  const [mobileRightOpen, setMobileRightOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerInitial, setComposerInitial] = useState<CreativeBrief | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareStatus, setShareStatus] = useState<
    "idle" | "copied" | "failed" | "too_large" | null
  >(null);

  useEffect(() => {
    hydrateFromStorage();
    void refreshConnectionStatus({ force: true });
    if (typeof window !== "undefined" && window.location.hash.includes("wf=")) {
      const result = loadFromShareUrl(window.location.href);
      if (!result.ok) {
        queueMicrotask(() => setStatusMessage(result.error));
      }
    }

    const id = window.setInterval(() => {
      void refreshConnectionStatus();
    }, 60_000);
    return () => window.clearInterval(id);
  }, [hydrateFromStorage, refreshConnectionStatus, loadFromShareUrl]);

  const selectedNode = useMemo(() => {
    if (!activeWorkflow || !selectedNodeId) return null;
    return activeWorkflow.nodes.find((n) => n.id === selectedNodeId) ?? null;
  }, [activeWorkflow, selectedNodeId]);

  const hasWorkflow = Boolean(activeWorkflow);

  const openComposer = (brief?: CreativeBrief | null) => {
    setComposerInitial(brief ? structuredClone(brief) : null);
    setComposerOpen(true);
  };

  const downloadJson = (json: string, title: string) => {
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sanitizeWorkflowFilename(title)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportDownload = (options: { includeRuntime: boolean }) => {
    const json = exportWorkflow({ includeRuntime: options.includeRuntime });
    if (!json) return false;
    downloadJson(json, activeWorkflow?.title ?? "workflow");
    setStatusMessage(
      options.includeRuntime
        ? "Exported workflow JSON (including runtime outputs)."
        : "Exported workflow JSON (structure and config only).",
    );
    return true;
  };

  const handleShareCopy = async (): Promise<"copied" | "failed" | "too_large"> => {
    const result = createShareUrl();
    if (!result.ok) {
      if (/too large|JSON export/i.test(result.error)) {
        setShareStatus("too_large");
        return "too_large";
      }
      setStatusMessage(result.error);
      setShareStatus("failed");
      return "failed";
    }
    try {
      await navigator.clipboard.writeText(result.url);
      setShareStatus("copied");
      setStatusMessage("Share link copied. Shared links omit runtime outputs by default.");
      return "copied";
    } catch {
      setShareStatus("failed");
      setStatusMessage(result.url);
      return "failed";
    }
  };

  const handleLoadTemplate = (id: string) => {
    if (id === "sneaker-hooks") {
      loadWorkflow(layoutWorkflow(createBranchedHookWorkflow()));
    } else if (id === "minimal") {
      loadWorkflow(layoutWorkflow(createMinimalValidWorkflow()));
    } else if (id === "tea-calm") {
      const coffee = SAMPLE_BRIEFS.find((s) => s.id === "coffee-story")!.brief;
      loadWorkflow(layoutWorkflow(planWorkflowFromBrief(coffee, { mode: "demo" })));
    }
    setMobileLeftOpen(false);
  };

  const handlePlanSubmit = async (brief: CreativeBrief) => {
    const ok = await createWorkflowFromBrief(brief);
    if (ok) {
      setComposerOpen(false);
      setComposerInitial(null);
      setRightTab("copilot");
      const engine =
        useWorkflowStore.getState().activeMode === "ollama"
          ? "Ollama"
          : "the demo engine";
      setStatusMessage(`Workflow planned via ${engine}.`);
    }
    return ok;
  };

  const handleSelectSample = (sample: SampleBriefDefinition) => {
    openComposer(sample.brief);
  };

  const handleRun = () => {
    setDrawerOpen(true);
    if (runNeedsRuntimeReset()) {
      const ok = window.confirm(
        "Previous run outputs exist. Clear them and start a fresh run?",
      );
      if (!ok) return;
      void runWorkflow({ resetRuntime: true });
      return;
    }
    void runWorkflow();
  };

  const handleViewOutput = (nodeId: string) => {
    selectNode(nodeId);
    setInspectorTab("output");
    setRightTab("inspector");
    setMobileRightOpen(true);
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-hf-bg text-hf-text">
      <TopBar
        workflowTitle={activeWorkflow?.title ?? null}
        connectionStatus={connectionStatus}
        canUndo={undoStack.length > 0}
        canRedo={redoStack.length > 0}
        canRun={hasWorkflow && !isPlanning}
        canExport={hasWorkflow}
        canShare={hasWorkflow}
        isRunning={isRunning}
        onUndo={undo}
        onRedo={redo}
        onExport={() => setExportOpen(true)}
        onImport={() => setImportOpen(true)}
        onShare={() => {
          setShareStatus("idle");
          setShareOpen(true);
        }}
        onRun={handleRun}
        onCancel={cancelRun}
        onRecheck={() => void refreshConnectionStatus({ force: true })}
        recheckDisabled={connectionStatus === "checking"}
      />

      {(lastError || statusMessage) && (
        <StatusBanner
          tone={lastError ? "danger" : "info"}
          message={lastError ?? statusMessage!}
          onDismiss={() => {
            clearError();
            setStatusMessage(null);
          }}
        />
      )}

      <div
        className="sr-only"
        aria-live="polite"
        aria-atomic="true"
        data-testid="shell-live-region"
      >
        {statusMessage ?? lastError ?? ""}
      </div>

      <div className="flex items-center gap-1 border-b border-hf-border bg-hf-panel px-2 py-1 lg:hidden">
        <IconButton
          label="Toggle library panel"
          tooltip="Library"
          onClick={() => setMobileLeftOpen((v) => !v)}
          data-testid="mobile-left-toggle"
        >
          <PanelLeft className="h-4 w-4" aria-hidden />
        </IconButton>
        <IconButton
          label="Toggle copilot panel"
          tooltip="Copilot"
          onClick={() => setMobileRightOpen((v) => !v)}
          data-testid="mobile-right-toggle"
        >
          <MessageSquare className="h-4 w-4" aria-hidden />
        </IconButton>
        <span className="ml-auto text-[11px] text-hf-muted">
          Narrow layout — panels as drawers
        </span>
        <Menu className="h-3.5 w-3.5 text-hf-muted" aria-hidden />
      </div>

      <div className="relative flex min-h-0 flex-1">
        <div className="hidden w-[var(--hf-left-w)] shrink-0 lg:block">
          <LeftRail
            templates={TEMPLATES}
            onNewWorkflow={() => {
              clearWorkflow();
              openComposer(null);
            }}
            onLoadTemplate={handleLoadTemplate}
          />
        </div>

        {mobileLeftOpen ? (
          <div className="absolute inset-0 z-40 flex lg:hidden" data-testid="mobile-left-drawer">
            <div className="w-[min(280px,85vw)] bg-hf-panel shadow-xl">
              <div className="flex items-center justify-between border-b border-hf-border px-2 py-1">
                <span className="text-xs font-medium">Library</span>
                <IconButton label="Close library" onClick={() => setMobileLeftOpen(false)}>
                  <X className="h-4 w-4" aria-hidden />
                </IconButton>
              </div>
              <div className="h-[calc(100%-36px)]">
                <LeftRail
                  templates={TEMPLATES}
                  onNewWorkflow={() => {
                    clearWorkflow();
                    setMobileLeftOpen(false);
                    openComposer(null);
                  }}
                  onLoadTemplate={handleLoadTemplate}
                />
              </div>
            </div>
            <button
              type="button"
              className="flex-1 bg-black/50"
              aria-label="Close library overlay"
              onClick={() => setMobileLeftOpen(false)}
            />
          </div>
        ) : null}

        <main className="hf-canvas-grid relative min-w-0 flex-1" aria-label="Workflow canvas">
          {!activeWorkflow ? (
            isPlanning ? (
              <PanelSkeleton label="Planning workflow" />
            ) : (
              <CanvasEmptyState
                samples={SAMPLE_BRIEFS}
                isPlanning={isPlanning}
                onCreateFromBrief={() => openComposer(null)}
                onSelectSample={handleSelectSample}
              />
            )
          ) : (
            <WorkflowCanvas
              workflow={activeWorkflow}
              onOpenInspector={() => setRightTab("inspector")}
            />
          )}
        </main>

        <div className="hidden w-[var(--hf-right-w)] shrink-0 lg:block">
          <RightPanel
            tab={rightTab}
            onTabChange={setRightTab}
            selectedNode={selectedNode}
            workflow={activeWorkflow}
            inspectorTab={inspectorTab}
          />
        </div>

        {mobileRightOpen ? (
          <div className="absolute inset-0 z-40 flex justify-end lg:hidden" data-testid="mobile-right-drawer">
            <button
              type="button"
              className="flex-1 bg-black/50"
              aria-label="Close copilot overlay"
              onClick={() => setMobileRightOpen(false)}
            />
            <div className="w-[min(360px,90vw)] bg-hf-panel shadow-xl">
              <div className="flex items-center justify-between border-b border-hf-border px-2 py-1">
                <span className="text-xs font-medium">Copilot / Inspector</span>
                <IconButton label="Close panel" onClick={() => setMobileRightOpen(false)}>
                  <X className="h-4 w-4" aria-hidden />
                </IconButton>
              </div>
              <div className="h-[calc(100%-36px)]">
                <RightPanel
                  tab={rightTab}
                  onTabChange={setRightTab}
                  selectedNode={selectedNode}
                  workflow={activeWorkflow}
                  inspectorTab={inspectorTab}
                />
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <footer
        className="shrink-0 border-t border-hf-border bg-hf-panel px-3 py-1.5 text-center text-[10px] text-hf-muted"
        data-testid="app-footer"
      >
        Creative workflow studio prototype.
      </footer>

      <ExecutionDrawer
        open={drawerOpen}
        onToggle={() => setDrawerOpen((v) => !v)}
        progress={executionProgress}
        isRunning={isRunning}
        workflow={activeWorkflow}
        lastRunSummary={lastRunSummary}
        onViewOutput={handleViewOutput}
      />

      <ExecutionToast />
      <OnboardingTour />

      <BriefComposer
        open={composerOpen}
        initialBrief={composerInitial}
        isPlanning={isPlanning}
        onClose={() => {
          if (!isPlanning) {
            setComposerOpen(false);
            setComposerInitial(null);
          }
        }}
        onSubmit={handlePlanSubmit}
      />

      <ExportDialog
        open={exportOpen}
        workflowTitle={activeWorkflow?.title ?? "workflow"}
        onClose={() => setExportOpen(false)}
        onExport={handleExportDownload}
      />

      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={(json) => {
          const result = importWorkflow(json);
          if (result.ok) {
            setStatusMessage("Workflow imported. Undo restores the previous graph.");
          }
          return result;
        }}
      />

      <ShareDialog
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        onCopyLink={handleShareCopy}
        onOpenExport={() => setExportOpen(true)}
        status={shareStatus}
      />
    </div>
  );
}
