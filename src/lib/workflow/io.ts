import { resetRuntimeState, type Workflow } from "@/lib/workflow";

export const IMPORT_MAX_BYTES = 1024 * 1024;

export function sanitizeWorkflowFilename(title: string): string {
  const cleaned = title
    .trim()
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return cleaned || "workflow";
}

export function serializeWorkflowForExport(
  workflow: Workflow,
  options?: { includeRuntime?: boolean },
): string {
  const includeRuntime = options?.includeRuntime !== false;
  const payload = includeRuntime ? workflow : resetRuntimeState(workflow);
  return JSON.stringify(payload, null, 2);
}

export function validateImportFile(file: File): { ok: true } | { ok: false; error: string } {
  const name = file.name.toLowerCase();
  if (!name.endsWith(".json")) {
    return { ok: false, error: "Import accepts .json files only." };
  }
  if (file.size > IMPORT_MAX_BYTES) {
    return {
      ok: false,
      error: `File is too large (${Math.round(file.size / 1024)} KB). Maximum is 1 MB.`,
    };
  }
  return { ok: true };
}
