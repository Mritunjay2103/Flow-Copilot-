import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  COPILOT_INTRO,
  COPILOT_SUGGESTIONS,
  CopilotPanel,
} from "@/components/copilot/CopilotPanel";
import {
  createMinimalValidWorkflow,
  summarizeOperations,
  type GraphEditOperation,
  type Workflow,
} from "@/lib/workflow";
import {
  __resetWorkflowStoreForTests,
  useWorkflowStore,
} from "@/store/workflow-store";

beforeEach(() => {
  vi.useRealTimers();
  __resetWorkflowStoreForTests();
  localStorage.clear();
  vi.unstubAllGlobals();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  __resetWorkflowStoreForTests();
  vi.unstubAllGlobals();
});

function mockEditResponse(body: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.signal?.aborted) {
        const err = new DOMException("Aborted", "AbortError");
        throw err;
      }
      return Response.json(body, { status });
    }),
  );
}

describe("summarizeOperations", () => {
  it("builds chips for adds and rewires", () => {
    const ops: GraphEditOperation[] = [
      {
        type: "add_node",
        reason: "Add hooks",
        node: createMinimalValidWorkflow().nodes[1]!,
      },
      {
        type: "add_edge",
        reason: "Wire",
        edge: {
          id: "e_new",
          source: "a",
          target: "b",
          animated: false,
        },
      },
      {
        type: "replace_edge",
        reason: "Rewire",
        edgeId: "e_old",
        edge: {
          id: "e_rep",
          source: "a",
          target: "c",
          animated: false,
        },
      },
    ];
    const chips = summarizeOperations(ops);
    expect(chips.some((c) => c.startsWith("Added"))).toBe(true);
    expect(chips).toContain("Rewired 2 connections");
  });
});

describe("CopilotPanel", () => {
  it("shows intro copy and exact suggestion chips", () => {
    useWorkflowStore.getState().loadWorkflow(createMinimalValidWorkflow());
    render(<CopilotPanel />);

    expect(screen.getByTestId("copilot-intro")).toHaveTextContent(COPILOT_INTRO);
    for (const suggestion of COPILOT_SUGGESTIONS) {
      expect(screen.getByText(suggestion)).toBeInTheDocument();
    }
  });

  it("disables send with no workflow and blank draft", () => {
    render(<CopilotPanel />);
    expect(screen.getByTestId("copilot-no-workflow")).toBeInTheDocument();
    expect(screen.getByTestId("copilot-send")).toBeDisabled();
    expect(screen.getByTestId("copilot-composer")).toBeDisabled();
  });

  it("Enter sends and Shift+Enter inserts a newline", async () => {
    const user = userEvent.setup();
    useWorkflowStore.getState().loadWorkflow(createMinimalValidWorkflow());

    let resolveFetch!: (value: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveFetch = resolve;
          }),
      ),
    );

    render(<CopilotPanel />);
    const composer = screen.getByTestId("copilot-composer");
    await user.type(composer, "Hello");
    await user.keyboard("{Shift>}{Enter}{/Shift}");
    await user.type(composer, "world");
    expect(composer).toHaveValue("Hello\nworld");

    await user.keyboard("{Enter}");
    await waitFor(() => {
      expect(useWorkflowStore.getState().isEditing).toBe(true);
    });
    expect(screen.getByTestId("copilot-loading")).toBeInTheDocument();

    resolveFetch(
      Response.json({
        workflow: createMinimalValidWorkflow({ id: "wf_edited", version: 2 }),
        edit: {
          assistantMessage: "Updated.",
          intentSummary: "noop-ish",
          operations: [],
        },
        activeMode: "demo",
      }),
    );

    await waitFor(() => {
      expect(useWorkflowStore.getState().isEditing).toBe(false);
    });
  });

  it("fills the composer from a suggestion without sending", async () => {
    const user = userEvent.setup();
    useWorkflowStore.getState().loadWorkflow(createMinimalValidWorkflow());
    render(<CopilotPanel />);

    await user.click(screen.getByTestId("copilot-suggestion-0"));
    expect(screen.getByTestId("copilot-composer")).toHaveValue(
      "Add three hook variants",
    );
    expect(useWorkflowStore.getState().isEditing).toBe(false);
  });

  it("shows long-wait helper after 8 seconds while editing", async () => {
    vi.useFakeTimers();
    useWorkflowStore.getState().loadWorkflow(createMinimalValidWorkflow());

    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("Aborted", "AbortError"));
            });
          }),
      ),
    );

    render(<CopilotPanel />);

    await act(async () => {
      void useWorkflowStore.getState().sendCopilotCommand("slow please");
    });

    expect(screen.getByTestId("copilot-loading")).toBeInTheDocument();
    expect(screen.getByTestId("copilot-wait-helper")).not.toHaveTextContent(
      /Local models can take/i,
    );

    await act(async () => {
      vi.advanceTimersByTime(8000);
    });

    expect(screen.getByTestId("copilot-wait-helper")).toHaveTextContent(
      /Local models can take a little longer/i,
    );

    await act(async () => {
      useWorkflowStore.getState().cancelCopilotEdit();
    });
  });

  it("marks clarifications when operations are empty", async () => {
    useWorkflowStore.getState().loadWorkflow(createMinimalValidWorkflow());
    mockEditResponse({
      workflow: createMinimalValidWorkflow(),
      edit: {
        assistantMessage: "No changes were made. Which platform?",
        intentSummary: "clarify",
        operations: [],
      },
      activeMode: "demo",
    });

    render(<CopilotPanel />);
    await useWorkflowStore.getState().sendCopilotCommand("make it better");

    await waitFor(() => {
      expect(screen.getByTestId("copilot-clarification")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("copilot-operation-chips")).not.toBeInTheDocument();
    expect(useWorkflowStore.getState().editHighlight).toBeNull();
  });

  it("shows operation chips after a successful edit", async () => {
    const base = createMinimalValidWorkflow();
    const next: Workflow = {
      ...base,
      version: base.version + 1,
      brief: { ...base.brief, tone: "cinematic and kinetic" },
      nodes: base.nodes.map((n) =>
        n.id === "brief_analyzer"
          ? {
              ...n,
              label: "Hook Variants",
              description: n.description,
            }
          : n,
      ),
    };

    useWorkflowStore.getState().loadWorkflow(base);
    mockEditResponse({
      workflow: next,
      edit: {
        assistantMessage: "I'll update the tone and rename the analyzer.",
        intentSummary: "tone+label",
        operations: [
          {
            type: "update_workflow_metadata",
            reason: "Updated Tone",
            patch: { brief: { tone: "cinematic and kinetic" } },
          },
          {
            type: "update_node",
            reason: "Added Hook Variants",
            nodeId: "brief_analyzer",
            patch: { label: "Hook Variants" },
          },
        ],
      },
      activeMode: "demo",
    });

    render(<CopilotPanel />);
    await useWorkflowStore.getState().sendCopilotCommand("Make the pacing more cinematic");

    await waitFor(() => {
      expect(screen.getByTestId("copilot-operation-chips")).toHaveTextContent(
        /Updated Tone/i,
      );
    });
    expect(screen.getByTestId("copilot-operation-chips")).toHaveTextContent(
      /Added Hook Variants/i,
    );
    expect(useWorkflowStore.getState().editHighlight?.nodeIds).toContain(
      "brief_analyzer",
    );
  });

  it("retains a failed command for retry", async () => {
    const user = userEvent.setup();
    const wf = createMinimalValidWorkflow();
    useWorkflowStore.getState().loadWorkflow(wf);
    mockEditResponse(
      { error: { code: "x", message: "edit failed", retryable: true } },
      400,
    );

    render(<CopilotPanel />);
    await user.type(screen.getByTestId("copilot-composer"), "add music");
    await user.click(screen.getByTestId("copilot-send"));

    await waitFor(() => {
      expect(screen.getByTestId("copilot-error")).toHaveTextContent(/edit failed/i);
    });
    expect(useWorkflowStore.getState().failedCopilotCommand).toBe("add music");
    expect(screen.getByTestId("copilot-composer")).toHaveValue("add music");
    expect(useWorkflowStore.getState().activeWorkflow).toEqual(wf);
  });

  it("cancels an in-flight edit and keeps the graph untouched", async () => {
    const wf = createMinimalValidWorkflow();
    useWorkflowStore.getState().loadWorkflow(wf);

    vi.stubGlobal(
      "fetch",
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
      }),
    );

    render(<CopilotPanel />);
    const pending = useWorkflowStore.getState().sendCopilotCommand("hang");
    await waitFor(() => expect(useWorkflowStore.getState().isEditing).toBe(true));

    await userEvent.setup().click(screen.getByTestId("copilot-cancel"));
    await pending;

    expect(useWorkflowStore.getState().isEditing).toBe(false);
    expect(useWorkflowStore.getState().activeWorkflow).toEqual(wf);
    expect(useWorkflowStore.getState().copilotMessages.at(-1)?.content).toMatch(
      /Cancelled/i,
    );
  });
});
