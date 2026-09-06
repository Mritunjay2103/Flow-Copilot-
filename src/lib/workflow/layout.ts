import type { Workflow, WorkflowNode } from "./schema";

const COLUMN_GAP = 280;
const ROW_GAP = 140;
const ORIGIN_X = 40;
const ORIGIN_Y = 40;

/**
 * Deterministic left-to-right DAG layout by topological level.
 * Includes disabled nodes. Stable within a level (sorted by id).
 */
export function layoutWorkflowNodes(workflow: Workflow): WorkflowNode[] {
  const levels = topologicalLevelsAll(workflow);
  const positionById = new Map<string, { x: number; y: number }>();

  levels.forEach((level, column) => {
    level.forEach((id, row) => {
      positionById.set(id, {
        x: ORIGIN_X + column * COLUMN_GAP,
        y: ORIGIN_Y + row * ROW_GAP,
      });
    });
  });

  return workflow.nodes.map((node) => {
    const position = positionById.get(node.id);
    return position ? { ...node, position } : node;
  });
}

export function layoutWorkflow(workflow: Workflow): Workflow {
  return {
    ...workflow,
    nodes: layoutWorkflowNodes(workflow),
    updatedAt: new Date().toISOString(),
  };
}

/** Kahn leveling over every node (enabled or not). */
export function topologicalLevelsAll(workflow: Workflow): string[][] {
  const ids = new Set(workflow.nodes.map((n) => n.id));
  const indegree = new Map<string, number>();
  const outgoing = new Map<string, string[]>();

  for (const id of ids) {
    indegree.set(id, 0);
    outgoing.set(id, []);
  }

  for (const edge of workflow.edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) continue;
    if (edge.source === edge.target) continue;
    outgoing.get(edge.source)!.push(edge.target);
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
  }

  const levels: string[][] = [];
  let frontier = [...ids].filter((id) => (indegree.get(id) ?? 0) === 0);

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

  // Orphans from cycles (should not happen on valid DAGs) — place at end
  const placed = new Set(levels.flat());
  const leftovers = [...ids].filter((id) => !placed.has(id)).sort();
  if (leftovers.length > 0) {
    levels.push(leftovers);
  }

  return levels;
}
