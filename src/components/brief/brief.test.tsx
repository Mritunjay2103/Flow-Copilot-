import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BriefComposer } from "@/components/brief/BriefComposer";
import { CanvasEmptyState } from "@/components/brief/CanvasEmptyState";
import {
  SAMPLE_BRIEFS,
  createDefaultBriefDraft,
} from "@/components/brief/sample-briefs";
import { AppShell } from "@/components/shell/AppShell";
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
});

describe("brief defaults", () => {
  it("defaults to Instagram Reels, 20 seconds, and 9:16", () => {
    const draft = createDefaultBriefDraft();
    expect(draft.platform).toBe("instagram_reels");
    expect(draft.durationSec).toBe(20);
    expect(draft.aspectRatio).toBe("9:16");

    render(
      <BriefComposer
        open
        isPlanning={false}
        onClose={vi.fn()}
        onSubmit={vi.fn(async () => true)}
      />,
    );

    expect(screen.getByLabelText(/^Platform$/i)).toHaveValue("instagram_reels");
    expect(screen.getByLabelText(/Duration/i)).toHaveValue(20);
    expect(screen.getByLabelText(/Aspect ratio/i)).toHaveValue("9:16");
  });
});

describe("brief validation", () => {
  it("validates inline only after blur or submit", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => true);

    render(
      <BriefComposer open isPlanning={false} onClose={vi.fn()} onSubmit={onSubmit} />,
    );

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    const product = screen.getByLabelText(/Product or subject/i);
    await user.click(product);
    await user.tab();
    expect(await screen.findByText("Required")).toBeInTheDocument();

    await user.click(screen.getByTestId("plan-workflow"));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/Fix the highlighted fields/i)).toBeInTheDocument();
  });
});

describe("sample population", () => {
  it("fills editable fields from samples without submitting", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => true);

    render(
      <BriefComposer open isPlanning={false} onClose={vi.fn()} onSubmit={onSubmit} />,
    );

    await user.click(screen.getByTestId("sample-sneaker-launch"));
    expect(screen.getByLabelText(/Product or subject/i)).toHaveValue(
      "Pulse X1 running shoe",
    );
    expect(screen.getByLabelText(/Campaign objective/i)).toHaveValue(
      "Launch a lightweight city-running shoe with a scroll-stopping opening",
    );
    expect(onSubmit).not.toHaveBeenCalled();

    await user.click(screen.getByTestId("sample-coffee-story"));
    expect(screen.getByLabelText(/Product or subject/i)).toHaveValue(
      "Harbor Roast coffee",
    );
    expect(onSubmit).not.toHaveBeenCalled();

    await user.click(screen.getByTestId("sample-app-explainer"));
    expect(screen.getByLabelText(/Product or subject/i)).toHaveValue(
      "FlowNote mobile app",
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("opens composer from empty-state sample without planning", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <CanvasEmptyState
        samples={SAMPLE_BRIEFS}
        isPlanning={false}
        onCreateFromBrief={vi.fn()}
        onSelectSample={onSelect}
      />,
    );

    await user.click(screen.getByTestId("empty-sample-sneaker-launch"));
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: "sneaker-launch" }),
    );
  });
});

describe("failed request preservation", () => {
  it("keeps entered values when planning fails", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => false);
    const sneaker = SAMPLE_BRIEFS[0]!.brief;

    render(
      <BriefComposer
        open
        initialBrief={sneaker}
        isPlanning={false}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByLabelText(/Product or subject/i)).toHaveValue(
      "Pulse X1 running shoe",
    );

    await user.click(screen.getByTestId("plan-workflow"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));

    expect(screen.getByText(/Planning failed/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Product or subject/i)).toHaveValue(
      "Pulse X1 running shoe",
    );
    await user.click(screen.getByRole("tab", { name: /Creative controls/i }));
    expect(screen.getByLabelText(/Call to action/i)).toHaveValue("Own the night");
  });
});

describe("duplicate submission prevention", () => {
  it("disables plan while planning and ignores extra clicks", async () => {
    const user = userEvent.setup();
    let resolve!: (value: boolean) => void;
    const onSubmit = vi.fn(
      () =>
        new Promise<boolean>((r) => {
          resolve = r;
        }),
    );

    const { rerender } = render(
      <BriefComposer
        open
        initialBrief={SAMPLE_BRIEFS[0]!.brief}
        isPlanning={false}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    await user.click(screen.getByTestId("plan-workflow"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));

    rerender(
      <BriefComposer
        open
        initialBrief={SAMPLE_BRIEFS[0]!.brief}
        isPlanning
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByTestId("plan-workflow")).toBeDisabled();
    expect(screen.getByTestId("planning-progress")).toHaveTextContent(
      /Understanding brief|Designing workflow|Validating graph/,
    );

    await user.click(screen.getByTestId("plan-workflow"));
    expect(onSubmit).toHaveBeenCalledTimes(1);

    resolve(true);
  });
});

describe("successful store update", () => {
  it("closes composer and updates the store after a successful plan", async () => {
    const user = userEvent.setup();
    const workflow = createMinimalValidWorkflow({ id: "wf_from_brief", mode: "demo" });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
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
        if (url.includes("/api/agent/plan") && init?.method === "POST") {
          return Response.json({
            workflow,
            assistantMessage:
              "Built a Pulse X1 Reels workflow via the demo engine.",
            activeMode: "demo",
          });
        }
        return Response.json({ error: { message: "not mocked" } }, { status: 500 });
      }),
    );

    render(<AppShell />);

    await user.click(screen.getByTestId("create-from-brief"));
    expect(screen.getByTestId("brief-composer")).toBeInTheDocument();

    await user.click(screen.getByTestId("sample-sneaker-launch"));
    await user.click(screen.getByTestId("plan-workflow"));

    await waitFor(() => {
      expect(useWorkflowStore.getState().activeWorkflow?.id).toBe("wf_from_brief");
    });

    expect(screen.queryByTestId("brief-composer")).not.toBeInTheDocument();
    expect(screen.getByTestId("workflow-canvas")).toBeInTheDocument();
    expect(useWorkflowStore.getState().copilotMessages.at(-1)?.content).toMatch(
      /demo engine/i,
    );
  });
});
