import type { Workflow } from "@/lib/workflow";
import { WorkflowSchema, validateWorkflowGraph } from "@/lib/workflow";

export const PERSISTENCE_KEY = "flow-copilot:v1";
/** Legacy key from earlier branding — read once for migration. */
const LEGACY_PERSISTENCE_KEY = "hexflow-copilot:v1";

export type PersistedCopilotMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  /** Compact operation chips after a successful edit (optional). */
  operationChips?: string[];
  /** True when the assistant clarified and made no graph changes. */
  isClarification?: boolean;
};

export type PersistedSlice = {
  activeWorkflow: Workflow | null;
  copilotMessages: PersistedCopilotMessage[];
};

export function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function validatePersistedWorkflow(
  value: unknown,
): { ok: true; workflow: Workflow } | { ok: false; error: string } {
  const parsed = WorkflowSchema.safeParse(value);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .slice(0, 3)
      .map((i) => `${i.path.join(".") || "workflow"}: ${i.message}`)
      .join("; ");
    return {
      ok: false,
      error: `Saved workflow failed validation (${detail || "invalid shape"}).`,
    };
  }
  const graph = validateWorkflowGraph(parsed.data);
  if (!graph.ok) {
    return {
      ok: false,
      error: `Saved workflow failed graph checks (${graph.issues
        .slice(0, 3)
        .map((i) => i.message)
        .join("; ")}).`,
    };
  }
  return { ok: true, workflow: parsed.data };
}

export function readPersistedState(
  storage?: Storage,
): PersistedSlice | null {
  if (!storage) {
    if (!isBrowser()) return null;
    storage = localStorage;
  }
  try {
    const raw =
      storage.getItem(PERSISTENCE_KEY) ??
      storage.getItem(LEGACY_PERSISTENCE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const record = parsed as Record<string, unknown>;
    const messages = Array.isArray(record.copilotMessages)
      ? (record.copilotMessages as PersistedCopilotMessage[]).filter(
          (m) =>
            m &&
            (m.role === "user" || m.role === "assistant") &&
            typeof m.content === "string",
        )
      : [];

    if (record.activeWorkflow == null) {
      return { activeWorkflow: null, copilotMessages: messages };
    }

    const validated = validatePersistedWorkflow(record.activeWorkflow);
    if (!validated.ok) {
      // Keep chat history; drop only the corrupt workflow so hydration cannot crash.
      return { activeWorkflow: null, copilotMessages: messages };
    }
    return { activeWorkflow: validated.workflow, copilotMessages: messages };
  } catch {
    return null;
  }
}

export function writePersistedState(
  slice: PersistedSlice,
  storage?: Storage,
): void {
  if (!storage) {
    if (!isBrowser()) return;
    storage = localStorage;
  }
  if (slice.activeWorkflow) {
    const validated = validatePersistedWorkflow(slice.activeWorkflow);
    if (!validated.ok) return;
  }
  try {
    storage.setItem(
      PERSISTENCE_KEY,
      JSON.stringify({
        activeWorkflow: slice.activeWorkflow,
        copilotMessages: slice.copilotMessages,
      }),
    );
    storage.removeItem(LEGACY_PERSISTENCE_KEY);
  } catch {
    // QuotaExceeded or private-mode storage — fail soft.
  }
}
export function clearPersistedState(storage?: Storage): void {
  if (!storage) {
    if (!isBrowser()) return;
    storage = localStorage;
  }
  storage.removeItem(PERSISTENCE_KEY);
  storage.removeItem(LEGACY_PERSISTENCE_KEY);
}

/** Debounced persistence writer (browser-only). */
export function createDebouncedPersister(delayMs = 300) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: PersistedSlice | null = null;

  return {
    schedule(slice: PersistedSlice, storage?: Storage) {
      pending = slice;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (pending) writePersistedState(pending, storage);
        pending = null;
        timer = null;
      }, delayMs);
    },
    flush(storage?: Storage) {
      if (timer) clearTimeout(timer);
      timer = null;
      if (pending) {
        writePersistedState(pending, storage);
        pending = null;
      }
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
      pending = null;
    },
  };
}
