"use client";

import { create } from "zustand";
import type { ActiveAiMode } from "@/lib/ai-mode";
import {
  applyGraphOperations,
  affectedIdsFromOperations,
  createIdleRuntime,
  formatRunSummaryMessage,
  layoutWorkflow,
  IMPORT_MAX_BYTES,
  orchestrateWorkflowExecution,
  resetRuntimeState,
  retryFailedNode,
  summarizeOperations,
  summarizeRun,
  serializeWorkflowForExport,
  validateWorkflowGraph,
  workflowHasRuntimeOutputs,
  WorkflowSchema,
  type CreativeBrief,
  type GraphEditOperation,
  type NodeConfig,
  type OrchestratorProgress,
  type RunSummary,
  type Workflow,
  type WorkflowEdge,
  type WorkflowNode,
} from "@/lib/workflow";
import {
  createDebouncedPersister,
  isBrowser,
  readPersistedState,
  type PersistedCopilotMessage,
  validatePersistedWorkflow,
} from "./persistence";
import { createSharePayload, loadSharePayload } from "./share";
import {
  CLIENT_API_TIMEOUT_MS,
  CLIENT_HEALTH_TIMEOUT_MS,
  sanitizeClientErrorMessage,
  signalWithTimeout,
} from "@/lib/client-fetch";

export type CopilotMessage = PersistedCopilotMessage;

export type ConnectionStatus =
  | "unknown"
  | "demo"
  | "ollama"
  | "unreachable"
  | "checking";

export type EditHighlight = {
  nodeIds: string[];
  edgeIds: string[];
};

export type ImportResult =
  | { ok: true }
  | { ok: false; error: string };

export type ShareUrlResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

const HISTORY_LIMIT = 30;
const EDIT_HIGHLIGHT_MS = 1500;

type ApiErrorBody = {
  error?: { code?: string; message?: string; retryable?: boolean };
};

export type WorkflowStoreState = {
  activeWorkflow: Workflow | null;
  selectedNodeId: string | null;
  copilotMessages: CopilotMessage[];
  executionProgress: OrchestratorProgress | null;
  isPlanning: boolean;
  isEditing: boolean;
  isRunning: boolean;
  lastError: string | null;
  undoStack: Workflow[];
  redoStack: Workflow[];
  activeMode: ActiveAiMode | null;
  connectionStatus: ConnectionStatus;
  /** Timestamp of last health check (throttle polls to ≥1 minute). */
  lastConnectionCheckAt: number | null;
  /** Model name from health / last edit response (caption only). */
  connectedModel: string | null;
  /** Last failed copilot command retained for retry. */
  failedCopilotCommand: string | null;
  /** Nodes/edges to flash after a successful edit. */
  editHighlight: EditHighlight | null;
  /** Sanitized operations from the latest successful edit (dev details). */
  lastEditOperations: GraphEditOperation[] | null;
  /** Truthful counts from the last completed or cancelled run. */
  lastRunSummary: RunSummary | null;
  /** Focus-safe live-region / toast text. */
  executionAnnouncement: string | null;
};

type WorkflowStoreActions = {
  hydrateFromStorage: () => void;
  refreshConnectionStatus: (options?: { force?: boolean }) => Promise<void>;
  createWorkflowFromBrief: (brief: CreativeBrief) => Promise<boolean>;
  loadWorkflow: (workflow: Workflow) => ImportResult;
  selectNode: (nodeId: string | null) => void;
  updateNodePosition: (nodeId: string, position: { x: number; y: number }) => void;
  beginNodeDrag: () => void;
  endNodeDrag: () => void;
  updateNodeConfig: (
    nodeId: string,
    patch: Partial<Pick<WorkflowNode, "label" | "description" | "locked">> & {
      config?: Partial<NodeConfig>;
    },
  ) => ImportResult;
  addEdge: (edge: WorkflowEdge) => ImportResult;
  removeEdge: (edgeId: string) => ImportResult;
  removeNode: (nodeId: string) => ImportResult;
  resetLayout: () => ImportResult;
  sendCopilotCommand: (message: string) => Promise<boolean>;
  cancelCopilotEdit: () => void;
  clearEditHighlight: () => void;
  /** Returns false if blocked; may leave announcement. Caller confirms reset when needed. */
  runWorkflow: (options?: { resetRuntime?: boolean }) => Promise<boolean>;
  /** True when a run would clear prior outputs and needs confirmation. */
  runNeedsRuntimeReset: () => boolean;
  cancelRun: () => void;
  retryNode: (nodeId: string) => Promise<boolean>;
  resetRun: () => void;
  clearExecutionAnnouncement: () => void;
  undo: () => void;
  redo: () => void;
  clearWorkflow: () => void;
  exportWorkflow: (options?: { includeRuntime?: boolean }) => string | null;
  importWorkflow: (json: string) => ImportResult;
  createShareUrl: (options?: { includeRuntime?: boolean }) => ShareUrlResult;
  loadFromShareUrl: (hashOrUrl: string) => ImportResult;
  clearError: () => void;
};

export type WorkflowStore = WorkflowStoreState & WorkflowStoreActions;

const persister = createDebouncedPersister(300);

let runAbort: AbortController | null = null;
let editAbort: AbortController | null = null;
let editHighlightTimer: ReturnType<typeof setTimeout> | null = null;
let dragSnapshot: Workflow | null = null;

function cloneWorkflow(workflow: Workflow): Workflow {
  return structuredClone(workflow);
}

function pushHistory(
  undoStack: Workflow[],
  snapshot: Workflow,
): Workflow[] {
  const next = [...undoStack, cloneWorkflow(snapshot)];
  if (next.length > HISTORY_LIMIT) {
    return next.slice(next.length - HISTORY_LIMIT);
  }
  return next;
}

function persistSlice(state: WorkflowStoreState) {
  persister.schedule({
    activeWorkflow: state.activeWorkflow,
    copilotMessages: state.copilotMessages,
  });
}

function humanApiError(status: number, body: ApiErrorBody | null): string {
  if (body?.error?.message) {
    return sanitizeClientErrorMessage(body.error.message);
  }
  return `Request failed (${status}).`;
}

async function parseJsonSafe(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

const initialState: WorkflowStoreState = {
  activeWorkflow: null,
  selectedNodeId: null,
  copilotMessages: [],
  executionProgress: null,
  isPlanning: false,
  isEditing: false,
  isRunning: false,
  lastError: null,
  undoStack: [],
  redoStack: [],
  activeMode: null,
  connectionStatus: "unknown",
  lastConnectionCheckAt: null,
  connectedModel: null,
  failedCopilotCommand: null,
  editHighlight: null,
  lastEditOperations: null,
  lastRunSummary: null,
  executionAnnouncement: null,
};

export const useWorkflowStore = create<WorkflowStore>((set, get) => ({
  ...initialState,

  hydrateFromStorage: () => {
    if (!isBrowser()) return;
    const saved = readPersistedState();
    if (!saved) return;
    set({
      activeWorkflow: saved.activeWorkflow,
      copilotMessages: saved.copilotMessages,
      lastError: null,
    });
  },

  refreshConnectionStatus: async (options) => {
    if (!isBrowser()) return;
    const now = Date.now();
    const last = get().lastConnectionCheckAt;
    const minIntervalMs = 60_000;
    if (
      !options?.force &&
      last != null &&
      now - last < minIntervalMs &&
      get().connectionStatus !== "unknown" &&
      get().connectionStatus !== "checking"
    ) {
      return;
    }

    set({ connectionStatus: "checking", lastConnectionCheckAt: now });
    try {
      const res = await fetch("/api/health/ollama", {
        cache: "no-store",
        signal: signalWithTimeout(CLIENT_HEALTH_TIMEOUT_MS),
      });
      const body = (await parseJsonSafe(res)) as {
        activeMode?: ActiveAiMode | null;
        reachable?: boolean;
        configuredMode?: string;
        model?: string | null;
      } | null;
      if (!res.ok || !body) {
        set({ connectionStatus: "unreachable" });
        return;
      }
      const model =
        typeof body.model === "string" && body.model.trim()
          ? body.model.trim()
          : null;
      if (body.activeMode === "demo" || body.configuredMode === "demo") {
        set({
          connectionStatus: "demo",
          activeMode: body.activeMode ?? "demo",
          connectedModel: model,
        });
        return;
      }
      if (body.activeMode === "ollama" && body.reachable) {
        set({
          connectionStatus: "ollama",
          activeMode: "ollama",
          connectedModel: model,
        });
        return;
      }
      set({
        connectionStatus: "unreachable",
        activeMode: body.activeMode ?? null,
        connectedModel: model,
      });
    } catch {
      set({ connectionStatus: "unreachable" });
    }
  },

  createWorkflowFromBrief: async (brief) => {
    const state = get();
    if (state.isPlanning || state.isEditing || state.isRunning) return false;

    set({ isPlanning: true, lastError: null });
    try {
      const res = await fetch("/api/agent/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ brief }),
        signal: signalWithTimeout(CLIENT_API_TIMEOUT_MS),
      });
      const body = (await parseJsonSafe(res)) as
        | {
            workflow?: Workflow;
            assistantMessage?: string;
            activeMode?: ActiveAiMode;
          }
        | ApiErrorBody
        | null;

      if (!res.ok) {
        set({
          isPlanning: false,
          lastError: humanApiError(res.status, body as ApiErrorBody),
        });
        return false;
      }

      const workflow = (body as { workflow?: Workflow }).workflow;
      const validated = workflow
        ? validatePersistedWorkflow(workflow)
        : { ok: false as const, error: "Planner returned no workflow." };
      if (!validated.ok) {
        set({ isPlanning: false, lastError: validated.error });
        return false;
      }

      const laidOut = layoutWorkflow(validated.workflow);
      const assistantMessage =
        (body as { assistantMessage?: string }).assistantMessage ??
        "Workflow planned.";
      const activeMode =
        (body as { activeMode?: ActiveAiMode }).activeMode ?? null;

      set((s) => {
        const next: WorkflowStoreState = {
          ...s,
          activeWorkflow: laidOut,
          selectedNodeId: null,
          copilotMessages: [
            ...s.copilotMessages,
            {
              id: `m_${Date.now()}`,
              role: "assistant",
              content: assistantMessage,
              createdAt: new Date().toISOString(),
            },
          ],
          undoStack: [],
          redoStack: [],
          activeMode,
          isPlanning: false,
          lastError: null,
          executionProgress: null,
        };
        persistSlice(next);
        return next;
      });
      return true;
    } catch (error) {
      set({
        isPlanning: false,
        lastError:
          error instanceof Error ? error.message : "Planning request failed.",
      });
      return false;
    }
  },

  loadWorkflow: (workflow) => {
    const validated = validatePersistedWorkflow(workflow);
    if (!validated.ok) return validated;
    set((s) => {
      const next = {
        ...s,
        activeWorkflow: validated.workflow,
        selectedNodeId: null,
        undoStack: [],
        redoStack: [],
        executionProgress: null,
        lastError: null,
      };
      persistSlice(next);
      return next;
    });
    return { ok: true };
  },

  selectNode: (nodeId) =>
    set((s) =>
      s.selectedNodeId === nodeId ? s : { selectedNodeId: nodeId },
    ),

  beginNodeDrag: () => {
    const wf = get().activeWorkflow;
    if (wf && !dragSnapshot) {
      dragSnapshot = cloneWorkflow(wf);
    }
  },

  updateNodePosition: (nodeId, position) => {
    set((s) => {
      if (!s.activeWorkflow) return s;
      const activeWorkflow = {
        ...s.activeWorkflow,
        nodes: s.activeWorkflow.nodes.map((n) =>
          n.id === nodeId
            ? { ...n, position: { x: position.x, y: position.y } }
            : n,
        ),
        updatedAt: new Date().toISOString(),
      };
      // No history / no persist on every pointer move
      return { ...s, activeWorkflow };
    });
  },

  endNodeDrag: () => {
    const snapshot = dragSnapshot;
    dragSnapshot = null;
    set((s) => {
      if (!s.activeWorkflow || !snapshot) return s;
      const next = {
        ...s,
        undoStack: pushHistory(s.undoStack, snapshot),
        redoStack: [],
      };
      persistSlice(next);
      return next;
    });
  },

  updateNodeConfig: (nodeId, patch) => {
    const state = get();
    if (!state.activeWorkflow) {
      return { ok: false, error: "No active workflow to update." };
    }
    const existing = state.activeWorkflow.nodes.find((n) => n.id === nodeId);
    if (!existing) {
      return { ok: false, error: `Unknown node “${nodeId}”.` };
    }
    if (existing.locked) {
      return { ok: false, error: "Locked nodes cannot be edited." };
    }

    const updatedNode: WorkflowNode = {
      ...existing,
      label: patch.label ?? existing.label,
      description: patch.description ?? existing.description,
      locked: patch.locked ?? existing.locked,
      config: patch.config
        ? {
            ...existing.config,
            ...patch.config,
            settings: patch.config.settings ?? existing.config.settings,
          }
        : existing.config,
    };

    const candidate: Workflow = {
      ...state.activeWorkflow,
      nodes: state.activeWorkflow.nodes.map((n) =>
        n.id === nodeId ? updatedNode : n,
      ),
      updatedAt: new Date().toISOString(),
      version: state.activeWorkflow.version + 1,
    };

    const validated = validatePersistedWorkflow(candidate);
    if (!validated.ok) return validated;

    set((s) => {
      const next = {
        ...s,
        activeWorkflow: validated.workflow,
        undoStack: pushHistory(s.undoStack, state.activeWorkflow!),
        redoStack: [],
        lastError: null,
      };
      persistSlice(next);
      return next;
    });
    return { ok: true };
  },

  addEdge: (edge) => {
    const state = get();
    if (!state.activeWorkflow) {
      return { ok: false, error: "No active workflow to update." };
    }
    try {
      const nextWf = applyGraphOperations(state.activeWorkflow, [
        { type: "add_edge", reason: "Manual edge", edge },
      ]);
      set((s) => {
        const next = {
          ...s,
          activeWorkflow: nextWf,
          undoStack: pushHistory(s.undoStack, state.activeWorkflow!),
          redoStack: [],
          lastError: null,
        };
        persistSlice(next);
        return next;
      });
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Could not add that edge.",
      };
    }
  },

  removeEdge: (edgeId) => {
    const state = get();
    if (!state.activeWorkflow) {
      return { ok: false, error: "No active workflow to update." };
    }
    try {
      const nextWf = applyGraphOperations(state.activeWorkflow, [
        { type: "remove_edge", reason: "Manual edge removal", edgeId },
      ]);
      set((s) => {
        const next = {
          ...s,
          activeWorkflow: nextWf,
          undoStack: pushHistory(s.undoStack, state.activeWorkflow!),
          redoStack: [],
          lastError: null,
        };
        persistSlice(next);
        return next;
      });
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Could not remove that edge.",
      };
    }
  },

  removeNode: (nodeId) => {
    const state = get();
    if (!state.activeWorkflow) {
      return { ok: false, error: "No active workflow to update." };
    }
    const node = state.activeWorkflow.nodes.find((n) => n.id === nodeId);
    if (!node) {
      return { ok: false, error: `Unknown node “${nodeId}”.` };
    }
    if (node.locked) {
      return { ok: false, error: "Locked nodes cannot be deleted." };
    }
    try {
      const nextWf = applyGraphOperations(state.activeWorkflow, [
        { type: "remove_node", reason: "Manual node removal", nodeId },
      ]);
      set((s) => {
        const next = {
          ...s,
          activeWorkflow: nextWf,
          selectedNodeId:
            s.selectedNodeId === nodeId ? null : s.selectedNodeId,
          undoStack: pushHistory(s.undoStack, state.activeWorkflow!),
          redoStack: [],
          lastError: null,
        };
        persistSlice(next);
        return next;
      });
      return { ok: true };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not remove that node.";
      set({ lastError: message });
      return {
        ok: false,
        error: message,
      };
    }
  },

  resetLayout: () => {
    const state = get();
    if (!state.activeWorkflow) {
      return { ok: false, error: "No active workflow to layout." };
    }
    const nextWf = layoutWorkflow(state.activeWorkflow);
    set((s) => {
      const next = {
        ...s,
        activeWorkflow: nextWf,
        undoStack: pushHistory(s.undoStack, state.activeWorkflow!),
        redoStack: [],
        lastError: null,
      };
      persistSlice(next);
      return next;
    });
    return { ok: true };
  },

  sendCopilotCommand: async (message) => {
    const state = get();
    if (!state.activeWorkflow) {
      set({ lastError: "Create or load a workflow before chatting." });
      return false;
    }
    if (state.isPlanning || state.isEditing || state.isRunning) return false;

    const trimmed = message.trim().slice(0, 2000);
    if (!trimmed) return false;

    const userMessage: CopilotMessage = {
      id: `m_${Date.now()}_u`,
      role: "user",
      content: trimmed,
      createdAt: new Date().toISOString(),
    };

    editAbort?.abort();
    editAbort = new AbortController();
    const signal = editAbort.signal;

    set((s) => ({
      ...s,
      isEditing: true,
      lastError: null,
      failedCopilotCommand: null,
      lastEditOperations: null,
      copilotMessages: [...s.copilotMessages, userMessage],
    }));

    const priorWorkflow = state.activeWorkflow;

    try {
      const recentMessages = [...state.copilotMessages, userMessage]
        .slice(-6)
        .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));

      const res = await fetch("/api/agent/edit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workflow: priorWorkflow,
          message: trimmed,
          recentMessages,
        }),
        signal: signalWithTimeout(CLIENT_API_TIMEOUT_MS, signal),
      });
      const body = (await parseJsonSafe(res)) as
        | {
            workflow?: Workflow;
            edit?: {
              assistantMessage?: string;
              intentSummary?: string;
              operations?: GraphEditOperation[];
            };
            activeMode?: ActiveAiMode;
            model?: string | null;
          }
        | ApiErrorBody
        | null;

      if (signal.aborted) {
        return false;
      }

      if (!res.ok) {
        set((s) => ({
          ...s,
          isEditing: false,
          activeWorkflow: priorWorkflow,
          failedCopilotCommand: trimmed,
          lastError: humanApiError(res.status, body as ApiErrorBody),
          copilotMessages: [
            ...s.copilotMessages,
            {
              id: `m_${Date.now()}_a`,
              role: "assistant",
              content: humanApiError(res.status, body as ApiErrorBody),
              createdAt: new Date().toISOString(),
            },
          ],
        }));
        persistSlice(get());
        return false;
      }

      const workflow = (body as { workflow?: Workflow }).workflow;
      const validated = workflow
        ? validatePersistedWorkflow(workflow)
        : { ok: false as const, error: "Edit response missing workflow." };
      if (!validated.ok) {
        set((s) => ({
          ...s,
          isEditing: false,
          activeWorkflow: priorWorkflow,
          failedCopilotCommand: trimmed,
          lastError: validated.error,
        }));
        return false;
      }

      const edit = (
        body as {
          edit?: {
            assistantMessage?: string;
            operations?: GraphEditOperation[];
          };
        }
      ).edit;
      const operations = Array.isArray(edit?.operations) ? edit!.operations! : [];
      const opsCount = operations.length;
      const assistantMessage =
        edit?.assistantMessage ??
        (opsCount > 0 ? "Workflow updated." : "No changes were made.");
      const chips = opsCount > 0 ? summarizeOperations(operations) : [];
      const highlight =
        opsCount > 0 ? affectedIdsFromOperations(operations) : null;
      const model =
        typeof (body as { model?: string | null }).model === "string"
          ? (body as { model: string }).model
          : get().connectedModel;

      if (editHighlightTimer) {
        clearTimeout(editHighlightTimer);
        editHighlightTimer = null;
      }

      set((s) => {
        const next = {
          ...s,
          isEditing: false,
          activeWorkflow: validated.workflow,
          activeMode:
            (body as { activeMode?: ActiveAiMode }).activeMode ?? s.activeMode,
          connectedModel: model,
          failedCopilotCommand: null,
          lastEditOperations: opsCount > 0 ? operations : null,
          editHighlight: highlight,
          undoStack:
            opsCount > 0
              ? pushHistory(s.undoStack, priorWorkflow)
              : s.undoStack,
          redoStack: opsCount > 0 ? [] : s.redoStack,
          lastError: null,
          copilotMessages: [
            ...s.copilotMessages,
            {
              id: `m_${Date.now()}_a`,
              role: "assistant" as const,
              content: assistantMessage,
              createdAt: new Date().toISOString(),
              operationChips: chips.length > 0 ? chips : undefined,
              isClarification: opsCount === 0,
            },
          ],
        };
        persistSlice(next);
        return next;
      });

      if (highlight) {
        editHighlightTimer = setTimeout(() => {
          set({ editHighlight: null });
          editHighlightTimer = null;
        }, EDIT_HIGHLIGHT_MS);
      }

      return true;
    } catch (error) {
      if (
        (error instanceof DOMException && error.name === "AbortError") ||
        (error instanceof Error && error.name === "AbortError") ||
        signal.aborted
      ) {
        set((s) => ({
          ...s,
          isEditing: false,
          activeWorkflow: priorWorkflow,
          lastError: null,
          failedCopilotCommand: trimmed,
          copilotMessages: [
            ...s.copilotMessages,
            {
              id: `m_${Date.now()}_a`,
              role: "assistant",
              content: "Cancelled — your graph is unchanged.",
              createdAt: new Date().toISOString(),
              isClarification: true,
            },
          ],
        }));
        persistSlice(get());
        return false;
      }

      set((s) => ({
        ...s,
        isEditing: false,
        activeWorkflow: priorWorkflow,
        failedCopilotCommand: trimmed,
        lastError:
          error instanceof Error ? error.message : "Edit request failed.",
      }));
      return false;
    } finally {
      if (editAbort?.signal === signal) {
        editAbort = null;
      }
    }
  },

  cancelCopilotEdit: () => {
    if (!get().isEditing) return;
    editAbort?.abort();
  },

  clearEditHighlight: () => {
    if (editHighlightTimer) {
      clearTimeout(editHighlightTimer);
      editHighlightTimer = null;
    }
    set({ editHighlight: null });
  },

  runNeedsRuntimeReset: () => {
    const wf = get().activeWorkflow;
    return Boolean(wf && workflowHasRuntimeOutputs(wf));
  },

  runWorkflow: async (options) => {
    const state = get();
    if (!state.activeWorkflow) {
      set({ lastError: "No workflow to run." });
      return false;
    }
    if (state.isPlanning || state.isEditing || state.isRunning) return false;

    const graph = validateWorkflowGraph(state.activeWorkflow);
    if (!graph.ok) {
      set({
        lastError: `Cannot run: ${graph.issues.map((i) => i.message).join("; ")}`,
      });
      return false;
    }

    let workflow = state.activeWorkflow;
    if (options?.resetRuntime || workflowHasRuntimeOutputs(workflow)) {
      if (!options?.resetRuntime && workflowHasRuntimeOutputs(workflow)) {
        // Caller must pass resetRuntime: true after confirming
        set({
          lastError:
            "Previous run outputs exist. Confirm reset before starting a new run.",
        });
        return false;
      }
      workflow = {
        ...resetRuntimeState(workflow),
        nodes: workflow.nodes.map((n) => ({
          ...n,
          runtime: createIdleRuntime(),
        })),
      };
      set({ activeWorkflow: workflow, lastRunSummary: null });
    }

    runAbort?.abort();
    runAbort = new AbortController();
    const signal = runAbort.signal;
    const startedAt = Date.now();

    set({
      isRunning: true,
      lastError: null,
      lastRunSummary: null,
      executionAnnouncement: "Workflow run started.",
      executionProgress: {
        completedTerminal: 0,
        enabledCount: workflow.nodes.filter((n) => n.config.enabled).length,
        ratio: 0,
      },
      activeWorkflow: workflow,
    });

    try {
      const result = await orchestrateWorkflowExecution({
        workflow,
        signal,
        onUpdate: (wf, progress) => {
          set({
            activeWorkflow: wf,
            executionProgress: progress,
          });
        },
        transport: async ({ workflowContext, node, upstreamOutputs, signal: s }) => {
          const res = await fetch("/api/nodes/run", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ workflowContext, node, upstreamOutputs }),
            signal: signalWithTimeout(CLIENT_API_TIMEOUT_MS, s),
          });
          const body = (await parseJsonSafe(res)) as
            | {
                result?: WorkflowNode["runtime"]["output"];
                status?: string;
                activeMode?: ActiveAiMode;
                model?: string | null;
                durationMs?: number;
              }
            | ApiErrorBody
            | null;
          if (!res.ok) {
            throw new Error(humanApiError(res.status, body as ApiErrorBody));
          }
          const success = body as {
            result: NonNullable<WorkflowNode["runtime"]["output"]>;
            status: WorkflowNode["runtime"]["status"];
            activeMode: ActiveAiMode;
            model: string | null;
            durationMs: number;
          };
          if (success.activeMode) {
            set({ activeMode: success.activeMode });
          }
          return {
            result: success.result,
            status: success.status,
            activeMode: success.activeMode,
            model: success.model,
            durationMs: success.durationMs,
          };
        },
      });

      const summary = summarizeRun(result, Date.now() - startedAt, false);
      const announcement = formatRunSummaryMessage(summary);

      set((s) => {
        const next = {
          ...s,
          activeWorkflow: result,
          isRunning: false,
          executionProgress: {
            completedTerminal: summary.completed + summary.needsProvider + summary.failed + summary.skipped,
            enabledCount: summary.enabled,
            ratio: 1,
          },
          lastRunSummary: summary,
          executionAnnouncement: announcement,
        };
        persistSlice(next);
        return next;
      });
      return true;
    } catch (error) {
      const current = get().activeWorkflow ?? workflow;
      if (error instanceof Error && error.name === "AbortError") {
        const summary = summarizeRun(current, Date.now() - startedAt, true);
        set({
          isRunning: false,
          lastRunSummary: summary,
          executionAnnouncement: formatRunSummaryMessage(summary),
          lastError: null,
        });
        return false;
      }
      set({
        isRunning: false,
        lastError:
          error instanceof Error ? error.message : "Workflow run failed.",
        executionAnnouncement:
          error instanceof Error ? error.message : "Workflow run failed.",
      });
      return false;
    } finally {
      runAbort = null;
    }
  },

  cancelRun: () => {
    if (!get().isRunning) return;
    runAbort?.abort();
  },

  retryNode: async (nodeId) => {
    const state = get();
    if (!state.activeWorkflow || state.isRunning) return false;

    runAbort?.abort();
    runAbort = new AbortController();
    set({
      isRunning: true,
      lastError: null,
      executionAnnouncement: `Retrying node ${nodeId}…`,
    });

    try {
      const result = await retryFailedNode({
        workflow: state.activeWorkflow,
        nodeId,
        signal: runAbort.signal,
        transport: async ({ workflowContext, node, upstreamOutputs, signal }) => {
          const res = await fetch("/api/nodes/run", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ workflowContext, node, upstreamOutputs }),
            signal: signalWithTimeout(CLIENT_API_TIMEOUT_MS, signal),
          });
          const body = (await parseJsonSafe(res)) as
            | {
                result: NonNullable<WorkflowNode["runtime"]["output"]>;
                status: WorkflowNode["runtime"]["status"];
                activeMode: ActiveAiMode;
                model: string | null;
                durationMs: number;
              }
            | ApiErrorBody
            | null;
          if (!res.ok) {
            throw new Error(humanApiError(res.status, body as ApiErrorBody));
          }
          return body as {
            result: NonNullable<WorkflowNode["runtime"]["output"]>;
            status: WorkflowNode["runtime"]["status"];
            activeMode: ActiveAiMode;
            model: string | null;
            durationMs: number;
          };
        },
      });
      set((s) => {
        const next = {
          ...s,
          activeWorkflow: result,
          isRunning: false,
          executionAnnouncement: `Retry finished for ${nodeId}.`,
        };
        persistSlice(next);
        return next;
      });
      return true;
    } catch (error) {
      set({
        isRunning: false,
        lastError:
          error instanceof Error ? error.message : "Retry failed.",
      });
      return false;
    } finally {
      runAbort = null;
    }
  },

  resetRun: () => {
    set((s) => {
      if (!s.activeWorkflow) return s;
      const activeWorkflow = {
        ...resetRuntimeState(s.activeWorkflow),
        nodes: s.activeWorkflow.nodes.map((n) => ({
          ...n,
          runtime: createIdleRuntime(),
        })),
      };
      const next = {
        ...s,
        activeWorkflow,
        executionProgress: null,
        lastRunSummary: null,
        lastError: null,
        executionAnnouncement: "Run state cleared.",
      };
      persistSlice(next);
      return next;
    });
  },

  clearExecutionAnnouncement: () => set({ executionAnnouncement: null }),

  undo: () => {
    set((s) => {
      if (!s.activeWorkflow || s.undoStack.length === 0) return s;
      const previous = s.undoStack[s.undoStack.length - 1]!;
      const next = {
        ...s,
        activeWorkflow: cloneWorkflow(previous),
        undoStack: s.undoStack.slice(0, -1),
        redoStack: pushHistory(s.redoStack, s.activeWorkflow),
        lastError: null,
      };
      persistSlice(next);
      return next;
    });
  },

  redo: () => {
    set((s) => {
      if (!s.activeWorkflow || s.redoStack.length === 0) return s;
      const nextWf = s.redoStack[s.redoStack.length - 1]!;
      const next = {
        ...s,
        activeWorkflow: cloneWorkflow(nextWf),
        redoStack: s.redoStack.slice(0, -1),
        undoStack: pushHistory(s.undoStack, s.activeWorkflow),
        lastError: null,
      };
      persistSlice(next);
      return next;
    });
  },

  clearWorkflow: () => {
    dragSnapshot = null;
    if (editHighlightTimer) {
      clearTimeout(editHighlightTimer);
      editHighlightTimer = null;
    }
    set((s) => {
      const next = {
        ...s,
        activeWorkflow: null,
        selectedNodeId: null,
        copilotMessages: [],
        executionProgress: null,
        undoStack: [],
        redoStack: [],
        lastError: null,
        failedCopilotCommand: null,
        editHighlight: null,
        lastEditOperations: null,
      };
      persistSlice(next);
      return next;
    });
  },

  exportWorkflow: (options) => {
    const wf = get().activeWorkflow;
    if (!wf) return null;
    const validated = validatePersistedWorkflow(wf);
    if (!validated.ok) {
      set({ lastError: validated.error });
      return null;
    }
    return serializeWorkflowForExport(validated.workflow, {
      includeRuntime: options?.includeRuntime !== false,
    });
  },

  importWorkflow: (json) => {
    if (json.length > IMPORT_MAX_BYTES) {
      return {
        ok: false,
        error: "Import failed: JSON exceeds the 1 MB size limit.",
      };
    }

    let data: unknown;
    try {
      data = JSON.parse(json);
    } catch {
      return {
        ok: false,
        error: "Import failed: the file is not valid JSON.",
      };
    }

    const parsed = WorkflowSchema.safeParse(data);
    if (!parsed.success) {
      const detail = parsed.error.issues
        .slice(0, 4)
        .map((i) => `${i.path.join(".") || "workflow"}: ${i.message}`)
        .join("; ");
      return {
        ok: false,
        error: `Import failed: ${detail || "workflow did not match the expected schema."}`,
      };
    }

    const graph = validateWorkflowGraph(parsed.data);
    if (!graph.ok) {
      return {
        ok: false,
        error: `Import failed: ${graph.issues
          .slice(0, 4)
          .map((i) => i.message)
          .join("; ")}`,
      };
    }

    set((s) => {
      const next = {
        ...s,
        activeWorkflow: parsed.data,
        selectedNodeId: null,
        undoStack: s.activeWorkflow
          ? pushHistory(s.undoStack, s.activeWorkflow)
          : s.undoStack,
        redoStack: [],
        executionProgress: null,
        lastRunSummary: null,
        lastError: null,
      };
      persistSlice(next);
      return next;
    });
    return { ok: true };
  },

  createShareUrl: (options) => {
    const wf = get().activeWorkflow;
    if (!wf) {
      return { ok: false, error: "No active workflow to share." };
    }
    const result = createSharePayload(wf, {
      includeRuntime: options?.includeRuntime === true,
    });
    if (!result.ok) return result;
    return { ok: true, url: result.url };
  },

  loadFromShareUrl: (hashOrUrl) => {
    const loaded = loadSharePayload(hashOrUrl);
    if (!loaded.ok) return loaded;
    set((s) => {
      const next = {
        ...s,
        activeWorkflow: loaded.workflow,
        selectedNodeId: null,
        undoStack: [],
        redoStack: [],
        executionProgress: null,
        lastError: null,
      };
      persistSlice(next);
      return next;
    });
    return { ok: true };
  },

  clearError: () => set({ lastError: null }),
}));

/** Test helper — reset module state between cases. */
export function __resetWorkflowStoreForTests() {
  runAbort?.abort();
  runAbort = null;
  editAbort?.abort();
  editAbort = null;
  if (editHighlightTimer) {
    clearTimeout(editHighlightTimer);
    editHighlightTimer = null;
  }
  dragSnapshot = null;
  persister.cancel();
  useWorkflowStore.setState({ ...initialState });
}

export function __flushWorkflowPersistenceForTests() {
  persister.flush();
}
