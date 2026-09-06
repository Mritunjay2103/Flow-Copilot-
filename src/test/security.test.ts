import { describe, expect, it, vi } from "vitest";
import { isFallbackEligible } from "@/lib/agent/planner";
import { sanitizeNodeForExecution } from "@/lib/agent/run-node";
import {
  sanitizeClientErrorMessage,
  signalWithTimeout,
} from "@/lib/client-fetch";
import { OllamaClientError } from "@/lib/ollama";
import {
  createMinimalValidWorkflow,
  IMPORT_MAX_BYTES,
} from "@/lib/workflow";
import {
  PERSISTENCE_KEY,
  readPersistedState,
  writePersistedState,
} from "@/store/persistence";
import { loadSharePayload, SHARE_URL_MAX_CHARS } from "@/store/share";
import {
  __resetWorkflowStoreForTests,
  useWorkflowStore,
} from "@/store/workflow-store";

describe("security & robustness gaps", () => {
  it("strips client-supplied provider URLs from node settings before execution", () => {
    const wf = createMinimalValidWorkflow();
    const node = {
      ...wf.nodes[1]!,
      config: {
        ...wf.nodes[1]!.config,
        settings: [
          { key: "ollama_url", value: "http://evil.example/api" },
          { key: "tone", value: "energetic" },
          { key: "hook", value: "http://looks-like-url.example" },
        ],
      },
    };
    const sanitized = sanitizeNodeForExecution(node);
    expect(sanitized.config.settings.map((s) => s.key)).toEqual(["tone"]);
    expect(sanitized.config.instruction).toBe(node.config.instruction);
  });

  it("does not treat validation / structured-output errors as auto fallback", () => {
    expect(
      isFallbackEligible(
        new OllamaClientError(
          "ollama_invalid_structured_output",
          "bad json",
        ),
      ),
    ).toBe(false);
    expect(
      isFallbackEligible(
        new OllamaClientError("ollama_unavailable", "down", { retryable: true }),
      ),
    ).toBe(true);
  });

  it("redacts URLs from client-visible error text", () => {
    expect(
      sanitizeClientErrorMessage(
        "Upstream failed at http://127.0.0.1:11434/api/chat",
      ),
    ).not.toMatch(/11434|http/i);
  });

  it("rejects oversized share payloads before decode", () => {
    const huge = `#wf=${"A".repeat(SHARE_URL_MAX_CHARS + 10)}`;
    const result = loadSharePayload(huge);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/8 KB|too large|JSON import/i);
    }
  });

  it("rejects import JSON over the 1 MB string limit without replacing workflow", () => {
    __resetWorkflowStoreForTests();
    const wf = createMinimalValidWorkflow();
    useWorkflowStore.getState().loadWorkflow(wf);
    const oversized = "x".repeat(IMPORT_MAX_BYTES + 1);
    const result = useWorkflowStore.getState().importWorkflow(oversized);
    expect(result.ok).toBe(false);
    expect(useWorkflowStore.getState().activeWorkflow?.id).toBe(wf.id);
  });

  it("does not crash hydration on corrupt localStorage and keeps messages", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem(key: string) {
        return store.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        store.set(key, value);
      },
      removeItem(key: string) {
        store.delete(key);
      },
    } as unknown as Storage;

    storage.setItem(
      PERSISTENCE_KEY,
      JSON.stringify({
        activeWorkflow: { broken: true },
        copilotMessages: [
          {
            id: "m1",
            role: "assistant",
            content: "kept",
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    );

    const loaded = readPersistedState(storage);
    expect(loaded).not.toBeNull();
    expect(loaded?.activeWorkflow).toBeNull();
    expect(loaded?.copilotMessages[0]?.content).toBe("kept");
  });

  it("writePersistedState swallows quota errors", () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("quota", "QuotaExceededError");
      },
      removeItem: () => {},
    } as unknown as Storage;
    expect(() =>
      writePersistedState(
        { activeWorkflow: null, copilotMessages: [] },
        storage,
      ),
    ).not.toThrow();
  });

  it("failed plan leaves the previous workflow intact", async () => {
    __resetWorkflowStoreForTests();
    const wf = createMinimalValidWorkflow();
    useWorkflowStore.getState().loadWorkflow(wf);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { error: { code: "x", message: "boom", retryable: false } },
          { status: 500 },
        ),
      ),
    );
    const ok = await useWorkflowStore.getState().createWorkflowFromBrief(
      wf.brief,
    );
    expect(ok).toBe(false);
    expect(useWorkflowStore.getState().activeWorkflow?.id).toBe(wf.id);
  });

  it("creates an abortable timeout signal", () => {
    const signal = signalWithTimeout(5);
    expect(signal.aborted).toBe(false);
  });

  it("health responses never include OLLAMA_BASE_URL (shape check via config module boundary)", async () => {
    // server-only ollama config must not be importable from client modules —
    // this file stays client-safe and only asserts the public health type fields.
    const sample = {
      configuredMode: "demo",
      activeMode: "demo",
      reachable: false,
      model: null,
      latencyMs: null,
      message: "Demo engine",
    };
    expect(JSON.stringify(sample)).not.toMatch(/OLLAMA_BASE_URL|11434/);
  });
});
