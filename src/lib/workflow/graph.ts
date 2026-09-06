import {
  GraphEditOperation,
  GraphEditOperationSchema,
  isInputNode,
  isOutputNode,
  Workflow,
  WorkflowEdge,
  WorkflowNode,
  WorkflowSchema,
  createIdleRuntime,
} from "./schema";

export type GraphValidationIssue = {
  code: string;
  message: string;
};

export type GraphValidationResult =
  | { ok: true }
  | { ok: false; issues: GraphValidationIssue[] };

function issue(code: string, message: string): GraphValidationIssue {
  return { code, message };
}

function adjacency(workflow: Workflow): {
  outgoing: Map<string, string[]>;
  incoming: Map<string, string[]>;
  nodeById: Map<string, WorkflowNode>;
} {
  const nodeById = new Map(workflow.nodes.map((n) => [n.id, n]));
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();

  for (const node of workflow.nodes) {
    outgoing.set(node.id, []);
    incoming.set(node.id, []);
  }

  for (const edge of workflow.edges) {
    outgoing.get(edge.source)?.push(edge.target);
    incoming.get(edge.target)?.push(edge.source);
  }

  return { outgoing, incoming, nodeById };
}

function hasCycle(workflow: Workflow): boolean {
  const { outgoing } = adjacency(workflow);
  const visited = new Set<string>();
  const stack = new Set<string>();

  const dfs = (id: string): boolean => {
    if (stack.has(id)) return true;
    if (visited.has(id)) return false;
    visited.add(id);
    stack.add(id);
    for (const next of outgoing.get(id) ?? []) {
      if (dfs(next)) return true;
    }
    stack.delete(id);
    return false;
  };

  for (const node of workflow.nodes) {
    if (dfs(node.id)) return true;
  }
  return false;
}

function reachableFrom(
  starts: string[],
  outgoing: Map<string, string[]>,
): Set<string> {
  const seen = new Set<string>();
  const queue = [...starts];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const next of outgoing.get(id) ?? []) {
      queue.push(next);
    }
  }
  return seen;
}

function canReachTargets(
  nodeId: string,
  targets: Set<string>,
  outgoing: Map<string, string[]>,
): boolean {
  if (targets.has(nodeId)) return true;
  const seen = new Set<string>();
  const queue = [nodeId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    if (targets.has(id)) return true;
    for (const next of outgoing.get(id) ?? []) {
      queue.push(next);
    }
  }
  return false;
}

/**
 * Verifies structural DAG invariants. Does not re-run Zod field validation.
 */
export function validateWorkflowGraph(workflow: Workflow): GraphValidationResult {
  const issues: GraphValidationIssue[] = [];
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();
  const pairKeys = new Set<string>();

  for (const node of workflow.nodes) {
    if (nodeIds.has(node.id)) {
      issues.push(issue("duplicate_node_id", `Duplicate node id: ${node.id}`));
    }
    nodeIds.add(node.id);
  }

  for (const edge of workflow.edges) {
    if (edgeIds.has(edge.id)) {
      issues.push(issue("duplicate_edge_id", `Duplicate edge id: ${edge.id}`));
    }
    edgeIds.add(edge.id);

    if (!nodeIds.has(edge.source)) {
      issues.push(
        issue("missing_endpoint", `Edge ${edge.id} source missing: ${edge.source}`),
      );
    }
    if (!nodeIds.has(edge.target)) {
      issues.push(
        issue("missing_endpoint", `Edge ${edge.id} target missing: ${edge.target}`),
      );
    }
    if (edge.source === edge.target) {
      issues.push(issue("self_edge", `Edge ${edge.id} is a self-edge`));
    }

    const pair = `${edge.source}->${edge.target}`;
    if (pairKeys.has(pair)) {
      issues.push(
        issue("duplicate_edge_pair", `Duplicate source-target edge: ${pair}`),
      );
    }
    pairKeys.add(pair);
  }

  const briefInputs = workflow.nodes.filter((n) => n.kind === "brief_input");
  const outputs = workflow.nodes.filter((n) => n.kind === "output");

  if (briefInputs.length < 1) {
    issues.push(issue("missing_brief_input", "Workflow needs at least one brief_input node"));
  }
  if (outputs.length < 1) {
    issues.push(issue("missing_output", "Workflow needs at least one output node"));
  }

  if (hasCycle(workflow)) {
    issues.push(issue("cycle", "Workflow contains a cycle"));
  }

  const { outgoing } = adjacency(workflow);
  const enabledNodes = workflow.nodes.filter((n) => n.config.enabled);
  const inputStarts = enabledNodes.filter(isInputNode).map((n) => n.id);
  const outputIds = new Set(enabledNodes.filter(isOutputNode).map((n) => n.id));
  const fromInputs = reachableFrom(inputStarts, outgoing);

  for (const node of enabledNodes) {
    if (!isInputNode(node) && !fromInputs.has(node.id)) {
      issues.push(
        issue(
          "unreachable_from_input",
          `Enabled node ${node.id} is not reachable from an input`,
        ),
      );
    }
    if (!isOutputNode(node) && !canReachTargets(node.id, outputIds, outgoing)) {
      issues.push(
        issue(
          "cannot_reach_output",
          `Enabled node ${node.id} cannot reach an output`,
        ),
      );
    }
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }
  return { ok: true };
}

/**
 * Returns node IDs grouped into execution levels (independent nodes share a level).
 */
export function topologicalLevels(workflow: Workflow): string[][] {
  const validation = validateWorkflowGraph(workflow);
  if (!validation.ok) {
    throw new Error(
      `Cannot compute levels for invalid graph: ${validation.issues.map((i) => i.message).join("; ")}`,
    );
  }

  const enabled = workflow.nodes.filter((n) => n.config.enabled);
  const enabledIds = new Set(enabled.map((n) => n.id));
  const indegree = new Map<string, number>();
  const outgoing = new Map<string, string[]>();

  for (const id of enabledIds) {
    indegree.set(id, 0);
    outgoing.set(id, []);
  }

  for (const edge of workflow.edges) {
    if (!enabledIds.has(edge.source) || !enabledIds.has(edge.target)) continue;
    outgoing.get(edge.source)!.push(edge.target);
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
  }

  const levels: string[][] = [];
  let frontier = [...enabledIds].filter((id) => (indegree.get(id) ?? 0) === 0);

  while (frontier.length > 0) {
    frontier.sort();
    levels.push(frontier);
    const next: string[] = [];
    for (const id of frontier) {
      for (const target of outgoing.get(id) ?? []) {
        const nextDeg = (indegree.get(target) ?? 0) - 1;
        indegree.set(target, nextDeg);
        if (nextDeg === 0) next.push(target);
      }
    }
    frontier = next;
  }

  const placed = levels.reduce((n, level) => n + level.length, 0);
  if (placed !== enabledIds.size) {
    throw new Error("Topological leveling failed (unexpected cycle)");
  }

  return levels;
}

export function getUpstreamNodeIds(workflow: Workflow, nodeId: string): string[] {
  const { incoming } = adjacency(workflow);
  const seen = new Set<string>();
  const queue = [...(incoming.get(nodeId) ?? [])];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const prev of incoming.get(id) ?? []) {
      queue.push(prev);
    }
  }
  return [...seen].sort();
}

export function getDownstreamNodeIds(workflow: Workflow, nodeId: string): string[] {
  const { outgoing } = adjacency(workflow);
  const seen = new Set<string>();
  const queue = [...(outgoing.get(nodeId) ?? [])];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const next of outgoing.get(id) ?? []) {
      queue.push(next);
    }
  }
  return [...seen].sort();
}

export function resetRuntimeState(workflow: Workflow): Workflow {
  return {
    ...workflow,
    nodes: workflow.nodes.map((node) => ({
      ...node,
      runtime: createIdleRuntime(),
    })),
    updatedAt: new Date().toISOString(),
  };
}

export class GraphOperationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "GraphOperationError";
    this.code = code;
  }
}

function assertKnownNode(nodes: WorkflowNode[], nodeId: string): WorkflowNode {
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) {
    throw new GraphOperationError("unknown_node", `Unknown node id: ${nodeId}`);
  }
  return node;
}

function assertKnownEdge(edges: WorkflowEdge[], edgeId: string): WorkflowEdge {
  const edge = edges.find((e) => e.id === edgeId);
  if (!edge) {
    throw new GraphOperationError("unknown_edge", `Unknown edge id: ${edgeId}`);
  }
  return edge;
}

/**
 * Applies graph edit operations immutably. Increments version once per successful batch.
 */
export function applyGraphOperations(
  workflow: Workflow,
  operations: GraphEditOperation[],
): Workflow {
  if (operations.length === 0) {
    return workflow;
  }

  for (const op of operations) {
    const parsed = GraphEditOperationSchema.safeParse(op);
    if (!parsed.success) {
      throw new GraphOperationError(
        "invalid_operation",
        `Invalid operation: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
      );
    }
  }

  let nodes = workflow.nodes.map((n) => ({
    ...n,
    position: { ...n.position },
    config: {
      ...n.config,
      settings: n.config.settings.map((s) => ({ ...s })),
    },
    runtime: { ...n.runtime },
  }));
  let edges = workflow.edges.map((e) => ({ ...e }));
  let title = workflow.title;
  let objective = workflow.objective;
  let brief = { ...workflow.brief, requiredElements: [...workflow.brief.requiredElements], avoidElements: [...workflow.brief.avoidElements] };

  for (const op of operations) {
    switch (op.type) {
      case "add_node": {
        if (nodes.some((n) => n.id === op.node.id)) {
          throw new GraphOperationError(
            "duplicate_node_id",
            `Cannot add node; id already exists: ${op.node.id}`,
          );
        }
        nodes = [...nodes, structuredClone(op.node)];
        break;
      }
      case "update_node": {
        assertKnownNode(nodes, op.nodeId);
        nodes = nodes.map((n) => {
          if (n.id !== op.nodeId) return n;
          return {
            ...n,
            label: op.patch.label ?? n.label,
            description: op.patch.description ?? n.description,
            position: op.patch.position ? { ...op.patch.position } : n.position,
            locked: op.patch.locked ?? n.locked,
            config: op.patch.config
              ? {
                  ...n.config,
                  ...op.patch.config,
                  settings: op.patch.config.settings
                    ? op.patch.config.settings.map((s) => ({ ...s }))
                    : n.config.settings,
                }
              : n.config,
          };
        });
        break;
      }
      case "remove_node": {
        const existing = assertKnownNode(nodes, op.nodeId);
        if (existing.locked) {
          throw new GraphOperationError(
            "locked_node",
            `Cannot remove locked node: ${op.nodeId}`,
          );
        }
        nodes = nodes.filter((n) => n.id !== op.nodeId);
        edges = edges.filter(
          (e) => e.source !== op.nodeId && e.target !== op.nodeId,
        );
        break;
      }
      case "add_edge": {
        if (edges.some((e) => e.id === op.edge.id)) {
          throw new GraphOperationError(
            "duplicate_edge_id",
            `Cannot add edge; id already exists: ${op.edge.id}`,
          );
        }
        assertKnownNode(nodes, op.edge.source);
        assertKnownNode(nodes, op.edge.target);
        edges = [...edges, { ...op.edge }];
        break;
      }
      case "remove_edge": {
        assertKnownEdge(edges, op.edgeId);
        edges = edges.filter((e) => e.id !== op.edgeId);
        break;
      }
      case "replace_edge": {
        assertKnownEdge(edges, op.edgeId);
        assertKnownNode(nodes, op.edge.source);
        assertKnownNode(nodes, op.edge.target);
        edges = edges.map((e) =>
          e.id === op.edgeId ? { ...op.edge } : e,
        );
        // If replacement uses a new id, ensure uniqueness against other edges
        if (op.edge.id !== op.edgeId && edges.filter((e) => e.id === op.edge.id).length > 1) {
          throw new GraphOperationError(
            "duplicate_edge_id",
            `Replacement edge id already exists: ${op.edge.id}`,
          );
        }
        break;
      }
      case "update_workflow_metadata": {
        title = op.patch.title ?? title;
        objective = op.patch.objective ?? objective;
        if (op.patch.brief) {
          brief = {
            ...brief,
            ...op.patch.brief,
            requiredElements:
              op.patch.brief.requiredElements ?? brief.requiredElements,
            avoidElements: op.patch.brief.avoidElements ?? brief.avoidElements,
          };
        }
        break;
      }
      default: {
        const _exhaustive: never = op;
        throw new GraphOperationError(
          "unknown_operation",
          `Unsupported operation: ${JSON.stringify(_exhaustive)}`,
        );
      }
    }
  }

  const next: Workflow = {
    ...workflow,
    title,
    objective,
    brief,
    nodes,
    edges,
    version: workflow.version + 1,
    updatedAt: new Date().toISOString(),
  };

  const schemaCheck = WorkflowSchema.safeParse(next);
  if (!schemaCheck.success) {
    throw new GraphOperationError(
      "schema_invalid",
      `Result failed schema validation: ${schemaCheck.error.issues.map((i) => i.message).join("; ")}`,
    );
  }

  const graphCheck = validateWorkflowGraph(schemaCheck.data);
  if (!graphCheck.ok) {
    throw new GraphOperationError(
      "graph_invalid",
      `Result failed graph validation: ${graphCheck.issues.map((i) => i.message).join("; ")}`,
    );
  }

  return schemaCheck.data;
}
