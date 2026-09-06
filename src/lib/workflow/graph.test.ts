import { describe, expect, it } from "vitest";
import {
  applyGraphOperations,
  createBranchedHookWorkflow,
  createIdleRuntime,
  createMinimalValidWorkflow,
  createSneakerLaunchBrief,
  CreativeBriefSchema,
  getDownstreamNodeIds,
  getUpstreamNodeIds,
  GraphOperationError,
  resetRuntimeState,
  topologicalLevels,
  validateWorkflowGraph,
  WorkflowSchema,
} from "./index";

describe("workflow schemas", () => {
  it("parses the sneaker launch brief", () => {
    const brief = createSneakerLaunchBrief();
    expect(CreativeBriefSchema.parse(brief).product).toBe("HexPulse Neon Runner");
  });

  it("parses fixture workflows", () => {
    expect(WorkflowSchema.parse(createMinimalValidWorkflow()).nodes).toHaveLength(3);
    expect(WorkflowSchema.parse(createBranchedHookWorkflow()).nodes.length).toBeGreaterThan(3);
  });

  it("rejects invalid identifiers and duration bounds", () => {
    expect(() =>
      CreativeBriefSchema.parse({
        ...createSneakerLaunchBrief(),
        durationSec: 2,
      }),
    ).toThrow();

    const wf = createMinimalValidWorkflow();
    expect(() =>
      WorkflowSchema.parse({
        ...wf,
        nodes: wf.nodes.map((n, i) =>
          i === 0 ? { ...n, id: "1-bad" } : n,
        ),
      }),
    ).toThrow();
  });
});

describe("validateWorkflowGraph", () => {
  it("accepts valid minimal and branched graphs", () => {
    expect(validateWorkflowGraph(createMinimalValidWorkflow())).toEqual({ ok: true });
    expect(validateWorkflowGraph(createBranchedHookWorkflow())).toEqual({ ok: true });
  });

  it("rejects duplicate node and edge ids", () => {
    const wf = createMinimalValidWorkflow();
    const dupNode = {
      ...wf,
      nodes: [...wf.nodes, { ...wf.nodes[0], id: "brief_input" }],
    };
    const nodeResult = validateWorkflowGraph(dupNode);
    expect(nodeResult.ok).toBe(false);
    if (!nodeResult.ok) {
      expect(nodeResult.issues.some((i) => i.code === "duplicate_node_id")).toBe(true);
    }

    const dupEdge = {
      ...wf,
      edges: [...wf.edges, { ...wf.edges[0] }],
    };
    const edgeResult = validateWorkflowGraph(dupEdge);
    expect(edgeResult.ok).toBe(false);
    if (!edgeResult.ok) {
      expect(edgeResult.issues.some((i) => i.code === "duplicate_edge_id")).toBe(true);
    }
  });

  it("rejects missing endpoints, self edges, and duplicate pairs", () => {
    const wf = createMinimalValidWorkflow();

    const missing = validateWorkflowGraph({
      ...wf,
      edges: [...wf.edges, { id: "e_missing", source: "brief_input", target: "nope", animated: false }],
    });
    expect(missing.ok).toBe(false);

    const self = validateWorkflowGraph({
      ...wf,
      edges: [...wf.edges, { id: "e_self", source: "brief_analyzer", target: "brief_analyzer", animated: false }],
    });
    expect(self.ok).toBe(false);
    if (!self.ok) {
      expect(self.issues.some((i) => i.code === "self_edge")).toBe(true);
    }

    const dupPair = validateWorkflowGraph({
      ...wf,
      edges: [
        ...wf.edges,
        { id: "e_dup_pair", source: "brief_input", target: "brief_analyzer", animated: false },
      ],
    });
    expect(dupPair.ok).toBe(false);
    if (!dupPair.ok) {
      expect(dupPair.issues.some((i) => i.code === "duplicate_edge_pair")).toBe(true);
    }
  });

  it("rejects cycles", () => {
    const wf = createMinimalValidWorkflow();
    const cyclic = {
      ...wf,
      edges: [
        ...wf.edges,
        { id: "e_cycle", source: "output", target: "brief_analyzer", animated: false },
      ],
    };
    const result = validateWorkflowGraph(cyclic);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.code === "cycle")).toBe(true);
    }
  });

  it("rejects unreachable enabled nodes and nodes that cannot reach output", () => {
    const wf = createMinimalValidWorkflow();
    const island = {
      ...wf,
      nodes: [
        ...wf.nodes,
        {
          id: "script_writer",
          kind: "script_writer" as const,
          label: "Orphan script",
          description: "Not connected",
          position: { x: 100, y: 300 },
          config: {
            modelClass: "text" as const,
            instruction: "Write",
            enabled: true,
            settings: [],
          },
          runtime: createIdleRuntime(),
          locked: false,
        },
      ],
    };
    const result = validateWorkflowGraph(island);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.issues.some(
          (i) =>
            i.code === "unreachable_from_input" || i.code === "cannot_reach_output",
        ),
      ).toBe(true);
    }
  });

  it("requires brief_input and output nodes", () => {
    const wf = createMinimalValidWorkflow();
    const noInput = {
      ...wf,
      nodes: wf.nodes.filter((n) => n.kind !== "brief_input"),
      edges: wf.edges.filter((e) => e.source !== "brief_input"),
    };
    expect(validateWorkflowGraph(noInput).ok).toBe(false);
  });
});

describe("topologicalLevels", () => {
  it("returns parallel-safe levels for branched workflows", () => {
    const levels = topologicalLevels(createBranchedHookWorkflow());
    expect(levels[0]).toEqual(["brief_input"]);
    expect(levels[1]).toEqual(["brief_analyzer"]);
    expect(levels[2]).toEqual(["hook_variants", "script_writer"]);
    expect(levels[3]).toEqual(["brand_validator"]);
    expect(levels[4]).toEqual(["output"]);
  });

  it("throws for invalid graphs", () => {
    const wf = createMinimalValidWorkflow();
    const cyclic = {
      ...wf,
      edges: [
        ...wf.edges,
        { id: "e_cycle", source: "output", target: "brief_analyzer", animated: false },
      ],
    };
    expect(() => topologicalLevels(cyclic)).toThrow(/invalid graph/i);
  });
});

describe("upstream and downstream", () => {
  it("lists ancestors and descendants", () => {
    const wf = createBranchedHookWorkflow();
    expect(getUpstreamNodeIds(wf, "brand_validator")).toEqual([
      "brief_analyzer",
      "brief_input",
      "hook_variants",
      "script_writer",
    ]);
    expect(getDownstreamNodeIds(wf, "brief_analyzer")).toEqual([
      "brand_validator",
      "hook_variants",
      "output",
      "script_writer",
    ]);
  });
});

describe("resetRuntimeState", () => {
  it("clears runtime fields without changing structure", () => {
    const wf = createMinimalValidWorkflow();
    wf.nodes[1]!.runtime = {
      status: "completed",
      startedAt: "2026-09-06T10:01:00.000Z",
      completedAt: "2026-09-06T10:01:01.000Z",
      durationMs: 1000,
      output: {
        summary: "done",
        artifacts: [],
        decisions: [],
        warnings: [],
      },
    };
    const reset = resetRuntimeState(wf);
    expect(reset.nodes.every((n) => n.runtime.status === "idle")).toBe(true);
    expect(reset.nodes.map((n) => n.id)).toEqual(wf.nodes.map((n) => n.id));
    expect(reset.edges).toEqual(wf.edges);
  });
});

describe("applyGraphOperations", () => {
  it("applies edits immutably and increments version once", () => {
    const wf = createMinimalValidWorkflow();
    const next = applyGraphOperations(wf, [
      {
        type: "update_workflow_metadata",
        reason: "Rename",
        patch: { title: "Updated title" },
      },
      {
        type: "update_node",
        reason: "Clarify analyzer",
        nodeId: "brief_analyzer",
        patch: { label: "Brief analysis" },
      },
    ]);

    expect(next).not.toBe(wf);
    expect(next.version).toBe(wf.version + 1);
    expect(next.title).toBe("Updated title");
    expect(next.nodes.find((n) => n.id === "brief_analyzer")?.label).toBe("Brief analysis");
    expect(wf.title).toBe("Minimal sneaker workflow");
    expect(wf.version).toBe(1);
  });

  it("returns the same workflow for an empty operation list", () => {
    const wf = createMinimalValidWorkflow();
    expect(applyGraphOperations(wf, [])).toBe(wf);
  });

  it("cascades edge removal when deleting a node", () => {
    const wf = createBranchedHookWorkflow();
    const next = applyGraphOperations(wf, [
      {
        type: "remove_node",
        reason: "Drop script branch",
        nodeId: "script_writer",
      },
    ]);

    expect(next.nodes.some((n) => n.id === "script_writer")).toBe(false);
    expect(
      next.edges.some((e) => e.source === "script_writer" || e.target === "script_writer"),
    ).toBe(false);
    expect(next.edges.some((e) => e.id === "e2" || e.id === "e4")).toBe(false);
    expect(next.version).toBe(wf.version + 1);
    expect(validateWorkflowGraph(next)).toEqual({ ok: true });
  });

  it("rejects unknown references and locked-node removal", () => {
    const wf = createMinimalValidWorkflow();

    expect(() =>
      applyGraphOperations(wf, [
        {
          type: "remove_node",
          reason: "oops",
          nodeId: "does_not_exist",
        },
      ]),
    ).toThrow(GraphOperationError);

    expect(() =>
      applyGraphOperations(wf, [
        {
          type: "remove_node",
          reason: "try locked",
          nodeId: "brief_input",
        },
      ]),
    ).toThrow(/locked/i);
  });

  it("rejects operations that would leave an invalid graph", () => {
    const wf = createMinimalValidWorkflow();
    expect(() =>
      applyGraphOperations(wf, [
        {
          type: "add_edge",
          reason: "create cycle",
          edge: {
            id: "e_bad",
            source: "output",
            target: "brief_analyzer",
            animated: false,
          },
        },
      ]),
    ).toThrow(/graph validation|cycle/i);
  });

  it("can insert a node with rewired edges", () => {
    const wf = createMinimalValidWorkflow();
    const next = applyGraphOperations(wf, [
      {
        type: "remove_edge",
        reason: "Open slot for script",
        edgeId: "e_analyzer_output",
      },
      {
        type: "add_node",
        reason: "Add script writer",
        node: {
          id: "script_writer",
          kind: "script_writer",
          label: "Script",
          description: "Write timed script",
          position: { x: 420, y: 80 },
          config: {
            modelClass: "text",
            instruction: "Write hook body CTA",
            enabled: true,
            settings: [],
          },
          runtime: createIdleRuntime(),
          locked: false,
        },
      },
      {
        type: "add_edge",
        reason: "Analyzer to script",
        edge: {
          id: "e_analyzer_script",
          source: "brief_analyzer",
          target: "script_writer",
          animated: false,
        },
      },
      {
        type: "add_edge",
        reason: "Script to output",
        edge: {
          id: "e_script_output",
          source: "script_writer",
          target: "output",
          animated: false,
        },
      },
    ]);

    expect(next.nodes.map((n) => n.id)).toContain("script_writer");
    expect(next.version).toBe(2);
    expect(validateWorkflowGraph(next)).toEqual({ ok: true });
  });
});
