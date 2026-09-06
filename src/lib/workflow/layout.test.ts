import { describe, expect, it } from "vitest";
import {
  createMinimalValidWorkflow,
  layoutWorkflow,
  topologicalLevelsAll,
  validateProposedConnection,
} from "@/lib/workflow";

describe("layoutWorkflow", () => {
  it("is deterministic across calls", () => {
    const wf = createMinimalValidWorkflow();
    const a = layoutWorkflow(wf);
    const b = layoutWorkflow(wf);
    expect(a.nodes.map((n) => n.position)).toEqual(b.nodes.map((n) => n.position));
  });

  it("groups nodes into topological columns", () => {
    const levels = topologicalLevelsAll(createMinimalValidWorkflow());
    expect(levels[0]).toContain("brief_input");
    expect(levels.at(-1)).toContain("output");
  });
});

describe("validateProposedConnection", () => {
  it("rejects a back-edge that would cycle", () => {
    const wf = createMinimalValidWorkflow();
    const result = validateProposedConnection(wf, "brief_analyzer", "brief_input");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(["cycle", "incompatible_model_class"]).toContain(result.reason);
    }
  });
});
