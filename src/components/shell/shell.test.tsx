import { cleanup, waitFor, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExecutionDrawer } from "@/components/execution/ExecutionDrawer";
import { CanvasEmptyState } from "@/components/brief/CanvasEmptyState";
import { SAMPLE_BRIEFS } from "@/components/brief/sample-briefs";
import { ModeBadge, modeBadgeCopy } from "@/components/shell/ModeBadge";
import { TopBar } from "@/components/shell/TopBar";
import { AppShell } from "@/components/shell/AppShell";
import {
  __resetWorkflowStoreForTests,
  useWorkflowStore,
} from "@/store/workflow-store";

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  __resetWorkflowStoreForTests();
  localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/health/ollama")) {
        return Response.json({
          configuredMode: "demo",
          activeMode: "demo",
          reachable: false,
          model: null,
          latencyMs: null,
          message: "Demo engine",
        });
      }
      return Response.json({ error: { message: "not mocked" } }, { status: 500 });
    }),
  );
});

describe("ModeBadge", () => {
  it("renders demo and ollama labels", () => {
    expect(modeBadgeCopy("demo").label).toBe("Demo engine");
    expect(modeBadgeCopy("ollama").label).toBe("Ollama connected");
    expect(modeBadgeCopy("checking").label).toBe("Checking Ollama");
    expect(modeBadgeCopy("unreachable").label).toBe("Ollama unavailable");

    render(<ModeBadge status="demo" />);
    expect(screen.getByTestId("mode-badge")).toHaveTextContent("Demo engine");
  });
});

describe("CanvasEmptyState", () => {
  it("shows value proposition and create action", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    const onSelect = vi.fn();
    render(
      <CanvasEmptyState
        samples={SAMPLE_BRIEFS}
        isPlanning={false}
        onCreateFromBrief={onCreate}
        onSelectSample={onSelect}
      />,
    );

    expect(screen.getByTestId("canvas-empty-state")).toHaveTextContent(
      /executable workflows/i,
    );
    expect(screen.getByText(/Local recordings can use Ollama/i)).toBeInTheDocument();
    await user.click(screen.getByTestId("create-from-brief"));
    expect(onCreate).toHaveBeenCalled();
    await user.click(screen.getByTestId("empty-sample-sneaker-launch"));
    expect(onSelect).toHaveBeenCalled();
  });
});

describe("TopBar disabled actions", () => {
  it("disables undo/export/run without a workflow", () => {
    render(
      <TopBar
        workflowTitle={null}
        connectionStatus="demo"
        canUndo={false}
        canRedo={false}
        canRun={false}
        canExport={false}
        canShare={false}
        isRunning={false}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        onExport={vi.fn()}
        onImport={vi.fn()}
        onShare={vi.fn()}
        onRun={vi.fn()}
        onCancel={vi.fn()}
        onRecheck={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Export workflow JSON" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Run workflow/i })).toBeDisabled();
  });

  it("keeps keyboard focus styles available on primary controls", async () => {
    const user = userEvent.setup();
    render(
      <TopBar
        workflowTitle="Demo"
        connectionStatus="demo"
        canUndo={true}
        canRedo={false}
        canRun={true}
        canExport={true}
        canShare={true}
        isRunning={false}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        onExport={vi.fn()}
        onImport={vi.fn()}
        onShare={vi.fn()}
        onRun={vi.fn()}
        onCancel={vi.fn()}
        onRecheck={vi.fn()}
      />,
    );

    const undo = screen.getByRole("button", { name: "Undo" });
    undo.focus();
    expect(undo).toHaveFocus();
    await user.tab();
    // Disabled Redo is skipped; Import is next
    expect(screen.getByRole("button", { name: "Import workflow JSON" })).toHaveFocus();
  });
});

describe("responsive panel controls", () => {
  it("toggles mobile drawers from shell controls", async () => {
    const user = userEvent.setup();
    render(<AppShell />);

    expect(screen.queryByTestId("mobile-left-drawer")).not.toBeInTheDocument();
    await user.click(screen.getByTestId("mobile-left-toggle"));
    expect(screen.getByTestId("mobile-left-drawer")).toBeInTheDocument();

    await user.click(screen.getByTestId("mobile-right-toggle"));
    expect(screen.getByTestId("mobile-right-drawer")).toBeInTheDocument();
  });

  it("expands the execution drawer", async () => {
    const user = userEvent.setup();
    render(
      <ExecutionDrawer
        open={false}
        onToggle={vi.fn()}
        progress={null}
        isRunning={false}
        workflow={null}
        lastRunSummary={null}
        onViewOutput={vi.fn()}
      />,
    );
    expect(screen.getByTestId("execution-drawer-toggle")).toHaveAttribute(
      "aria-label",
      "Expand execution drawer",
    );
    await user.click(screen.getByTestId("execution-drawer-toggle"));
  });
});

describe("AppShell store wiring", () => {
  it("hydrates connection status to demo badge", async () => {
    render(<AppShell />);
    await waitFor(() => {
      expect(useWorkflowStore.getState().connectionStatus).toBe("demo");
    });
    expect(screen.getByTestId("mode-badge")).toHaveTextContent("Demo engine");
    expect(screen.getByTestId("canvas-empty-state")).toBeInTheDocument();
  });
});
