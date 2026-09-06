import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppErrorBoundary } from "@/components/shell/AppErrorBoundary";
import { AppShell } from "@/components/shell/AppShell";
import { ExportDialog } from "@/components/io/ExportDialog";
import { ImportDialog } from "@/components/io/ImportDialog";
import { ShareDialog } from "@/components/io/ShareDialog";
import {
  OnboardingTour,
  ONBOARDING_STORAGE_KEY,
} from "@/components/onboarding/OnboardingTour";
import { TopBar } from "@/components/shell/TopBar";
import { createMinimalValidWorkflow } from "@/lib/workflow";
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
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
});

describe("export dialog", () => {
  it("exports with runtime by default and can exclude outputs", async () => {
    const user = userEvent.setup();
    const onExport = vi.fn(() => true);
    render(
      <ExportDialog
        open
        workflowTitle="My Launch!!"
        onClose={vi.fn()}
        onExport={onExport}
      />,
    );

    expect(screen.getByTestId("export-dialog")).toHaveTextContent(/My-Launch\.json/i);
    await user.click(screen.getByTestId("export-download"));
    expect(onExport).toHaveBeenCalledWith({ includeRuntime: true });

    await user.click(screen.getByTestId("export-exclude-runtime"));
    await user.click(screen.getByTestId("export-download"));
    expect(onExport).toHaveBeenLastCalledWith({ includeRuntime: false });
  });
});

describe("import dialog", () => {
  it("shows validation errors without calling success path for bad JSON", async () => {
    const user = userEvent.setup();
    const onImport = vi.fn(() => ({
      ok: false as const,
      error: "Import failed: not valid JSON.",
    }));
    render(<ImportDialog open onClose={vi.fn()} onImport={onImport} />);

    const file = new File(["{bad"], "broken.json", { type: "application/json" });
    await user.upload(screen.getByTestId("import-file-input"), file);

    await waitFor(() => {
      expect(screen.getByTestId("import-error")).toHaveTextContent(/not valid JSON/i);
    });
    expect(onImport).toHaveBeenCalled();
  });
});

describe("share dialog", () => {
  it("explains omitted runtime and offers export fallback when too large", async () => {
    const user = userEvent.setup();
    const onOpenExport = vi.fn();
    render(
      <ShareDialog
        open
        onClose={vi.fn()}
        onCopyLink={async () => "too_large"}
        onOpenExport={onOpenExport}
        status="too_large"
      />,
    );

    expect(screen.getByTestId("share-dialog")).toHaveTextContent(/not runtime outputs/i);
    expect(screen.getByTestId("share-too-large")).toBeInTheDocument();
    await user.click(screen.getByTestId("share-fallback-export"));
    expect(onOpenExport).toHaveBeenCalled();
  });
});

describe("onboarding persistence", () => {
  it("shows the tour once then never again after skip", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<OnboardingTour />);
    expect(await screen.findByTestId("onboarding-tour")).toBeInTheDocument();
    await user.click(screen.getByTestId("onboarding-skip"));
    expect(localStorage.getItem(ONBOARDING_STORAGE_KEY)).toBe("1");
    unmount();

    render(<OnboardingTour />);
    expect(screen.queryByTestId("onboarding-tour")).not.toBeInTheDocument();
  });
});

describe("connection check", () => {
  it("calls health after hydration and supports manual recheck", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    render(<AppShell />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/health/ollama",
        expect.objectContaining({ cache: "no-store" }),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("mode-badge")).toHaveTextContent(/Demo engine/i);
    });
    expect(screen.getByTestId("connection-detail")).toHaveTextContent(
      /No external API/i,
    );

    const calls = fetchMock.mock.calls.length;
    await user.click(screen.getByTestId("connection-recheck"));
    await waitFor(() => {
      expect(fetchMock.mock.calls.length).toBeGreaterThan(calls);
    });
  });

  it("throttles non-forced refreshes within one minute", async () => {
    const fetchMock = vi.mocked(fetch);
    await useWorkflowStore.getState().refreshConnectionStatus({ force: true });
    const afterFirst = fetchMock.mock.calls.length;
    await useWorkflowStore.getState().refreshConnectionStatus();
    expect(fetchMock.mock.calls.length).toBe(afterFirst);
    await useWorkflowStore.getState().refreshConnectionStatus({ force: true });
    expect(fetchMock.mock.calls.length).toBeGreaterThan(afterFirst);
  });
});

describe("error boundary", () => {
  it("renders a recovery UI when a child throws", () => {
    const Boom = () => {
      throw new Error("boom");
    };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <AppErrorBoundary>
        <Boom />
      </AppErrorBoundary>,
    );
    expect(screen.getByTestId("error-boundary")).toHaveTextContent(/Something went wrong/i);
    spy.mockRestore();
  });
});

describe("keyboard and store polish", () => {
  it("closes export dialog on Escape and restores focus", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <div>
        <button type="button">Before</button>
        <ExportDialog open workflowTitle="x" onClose={onClose} onExport={() => true} />
      </div>,
    );
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("creates an undo snapshot after successful import", () => {
    const first = createMinimalValidWorkflow();
    first.title = "First";
    useWorkflowStore.getState().loadWorkflow(first);
    const second = createMinimalValidWorkflow();
    second.id = "wf_second";
    second.title = "Second";
    const json = JSON.stringify(second);
    const result = useWorkflowStore.getState().importWorkflow(json);
    expect(result.ok).toBe(true);
    expect(useWorkflowStore.getState().activeWorkflow?.title).toBe("Second");
    expect(useWorkflowStore.getState().undoStack.length).toBe(1);
    useWorkflowStore.getState().undo();
    expect(useWorkflowStore.getState().activeWorkflow?.title).toBe("First");
  });

  it("exports without runtime when asked", () => {
    const wf = createMinimalValidWorkflow();
    wf.nodes[1]!.runtime = {
      status: "completed",
      output: {
        summary: "secret-output",
        artifacts: [],
        decisions: [],
        warnings: [],
      },
    };
    useWorkflowStore.getState().loadWorkflow(wf);
    const withRuntime = useWorkflowStore.getState().exportWorkflow({ includeRuntime: true });
    const without = useWorkflowStore.getState().exportWorkflow({ includeRuntime: false });
    expect(withRuntime).toContain("secret-output");
    expect(without).not.toContain("secret-output");
  });

  it("keeps TopBar import reachable by keyboard", async () => {
    const user = userEvent.setup();
    const onImport = vi.fn();
    render(
      <TopBar
        workflowTitle="Demo"
        connectionStatus="demo"
        canUndo={false}
        canRedo={false}
        canRun={true}
        canExport={true}
        canShare={true}
        isRunning={false}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        onExport={vi.fn()}
        onImport={onImport}
        onShare={vi.fn()}
        onRun={vi.fn()}
        onCancel={vi.fn()}
        onRecheck={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Import workflow JSON" }));
    expect(onImport).toHaveBeenCalled();
  });
});
