import {
  compressToEncodedURIComponent,
  decompressFromEncodedURIComponent,
} from "lz-string";
import {
  resetRuntimeState,
  WorkflowSchema,
  validateWorkflowGraph,
  type Workflow,
} from "@/lib/workflow";
import { validatePersistedWorkflow } from "./persistence";

/** Conservative limit for shareable URL hashes (characters). */
export const SHARE_URL_MAX_CHARS = 8 * 1024;

export type ShareResult =
  | { ok: true; hash: string; url: string }
  | { ok: false; error: string };

export type LoadShareResult =
  | { ok: true; workflow: Workflow }
  | { ok: false; error: string };

/**
 * Encode a validated workflow into a URL hash using lz-string.
 * Client-side only — never sent to a server.
 */
export function createSharePayload(
  workflow: Workflow,
  options?: { includeRuntime?: boolean; origin?: string; pathname?: string },
): ShareResult {
  const validated = validatePersistedWorkflow(workflow);
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }

  const toEncode = options?.includeRuntime
    ? validated.workflow
    : resetRuntimeState(validated.workflow);

  const encoded = compressToEncodedURIComponent(JSON.stringify(toEncode));
  if (!encoded) {
    return { ok: false, error: "Could not compress the workflow for sharing." };
  }

  const hash = `#wf=${encoded}`;
  if (hash.length > SHARE_URL_MAX_CHARS) {
    return {
      ok: false,
      error:
        "This workflow is too large for a share URL (over 8 KB encoded). Use JSON export instead.",
    };
  }

  const origin =
    options?.origin ??
    (typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");
  const pathname =
    options?.pathname ??
    (typeof window !== "undefined" ? window.location.pathname : "/");

  return { ok: true, hash, url: `${origin}${pathname}${hash}` };
}

export function loadSharePayload(hashOrUrl: string): LoadShareResult {
  try {
    let hash = hashOrUrl.trim();
    if (hash.length > SHARE_URL_MAX_CHARS * 2) {
      return {
        ok: false,
        error:
          "Share payload is too large to decode safely. Use JSON import instead.",
      };
    }
    if (hash.includes("#")) {
      hash = hash.slice(hash.indexOf("#"));
    }
    if (!hash.startsWith("#")) {
      hash = `#${hash}`;
    }

    const match = hash.match(/[#&?]wf=([^&]*)/);
    if (!match?.[1]) {
      return {
        ok: false,
        error: "No share payload found in the URL hash (expected #wf=...).",
      };
    }

    const encoded = match[1];
    if (encoded.length > SHARE_URL_MAX_CHARS) {
      return {
        ok: false,
        error:
          "Share payload exceeds the 8 KB encoded limit. Use JSON import instead.",
      };
    }

    const json = decompressFromEncodedURIComponent(decodeURIComponent(encoded));
    if (!json) {
      return {
        ok: false,
        error: "Could not decode the share payload. It may be truncated or corrupted.",
      };
    }

    if (json.length > 512 * 1024) {
      return {
        ok: false,
        error: "Decoded share payload is too large. Use JSON import instead.",
      };
    }

    let data: unknown;
    try {
      data = JSON.parse(json);
    } catch {
      return { ok: false, error: "Share payload was not valid JSON after decoding." };
    }

    const parsed = WorkflowSchema.safeParse(data);
    if (!parsed.success) {
      const detail = parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".") || "workflow"}: ${i.message}`)
        .join("; ");
      return {
        ok: false,
        error: `Shared workflow is invalid (${detail || "schema mismatch"}).`,
      };
    }

    const graph = validateWorkflowGraph(parsed.data);
    if (!graph.ok) {
      return {
        ok: false,
        error: `Shared workflow failed graph validation (${graph.issues
          .slice(0, 3)
          .map((i) => i.message)
          .join("; ")}).`,
      };
    }

    return { ok: true, workflow: parsed.data };
  } catch {
    return {
      ok: false,
      error: "Unexpected error while reading the share URL.",
    };
  }
}
