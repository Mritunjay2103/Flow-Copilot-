import { describe, expect, it } from "vitest";
import {
  IMPORT_MAX_BYTES,
  sanitizeWorkflowFilename,
  serializeWorkflowForExport,
  validateImportFile,
  createMinimalValidWorkflow,
} from "@/lib/workflow";

describe("workflow io helpers", () => {
  it("sanitizes filenames from titles", () => {
    expect(sanitizeWorkflowFilename("Sneaker Launch!!")).toBe("Sneaker-Launch");
    expect(sanitizeWorkflowFilename("   ")).toBe("workflow");
    expect(sanitizeWorkflowFilename("a".repeat(120)).length).toBeLessThanOrEqual(80);
  });

  it("excludes runtime when requested", () => {
    const wf = createMinimalValidWorkflow();
    wf.nodes[1]!.runtime = {
      status: "completed",
      output: {
        summary: "keep-or-drop",
        artifacts: [],
        decisions: [],
        warnings: [],
      },
    };
    const full = serializeWorkflowForExport(wf, { includeRuntime: true });
    const stripped = serializeWorkflowForExport(wf, { includeRuntime: false });
    expect(full).toContain("keep-or-drop");
    expect(stripped).not.toContain("keep-or-drop");
  });

  it("rejects non-json and oversized import files", () => {
    const ok = validateImportFile(
      new File(["{}"], "wf.json", { type: "application/json" }),
    );
    expect(ok.ok).toBe(true);

    const badExt = validateImportFile(new File(["{}"], "wf.txt"));
    expect(badExt.ok).toBe(false);
    if (!badExt.ok) expect(badExt.error).toMatch(/\.json/i);

    const big = new File([new Uint8Array(IMPORT_MAX_BYTES + 1)], "big.json");
    const oversized = validateImportFile(big);
    expect(oversized.ok).toBe(false);
    if (!oversized.ok) expect(oversized.error).toMatch(/1 MB/i);
  });
});
