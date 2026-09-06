import type { GraphEditOperation } from "./schema";

export function summarizeOperations(operations: GraphEditOperation[]): string[] {
  const chips: string[] = [];
  let rewired = 0;

  for (const op of operations) {
    switch (op.type) {
      case "add_node":
        chips.push(`Added ${op.node.label}`);
        break;
      case "update_node": {
        const fromReason = humanizeReason(op.reason);
        chips.push(fromReason ?? `Updated ${op.nodeId}`);
        break;
      }
      case "remove_node":
        chips.push(humanizeReason(op.reason) ?? "Removed node");
        break;
      case "add_edge":
      case "remove_edge":
      case "replace_edge":
        rewired += 1;
        break;
      case "update_workflow_metadata": {
        if (op.patch.brief?.tone) {
          chips.push("Updated Tone");
        } else if (op.patch.brief?.aspectRatio) {
          chips.push("Updated Aspect Ratio");
        } else if (op.patch.title) {
          chips.push("Updated Title");
        } else {
          chips.push(humanizeReason(op.reason) ?? "Updated Workflow");
        }
        break;
      }
      default:
        break;
    }
  }

  if (rewired > 0) {
    chips.push(
      rewired === 1
        ? "Rewired 1 connection"
        : `Rewired ${rewired} connections`,
    );
  }

  return chips;
}

export function affectedIdsFromOperations(operations: GraphEditOperation[]): {
  nodeIds: string[];
  edgeIds: string[];
} {
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();

  for (const op of operations) {
    switch (op.type) {
      case "add_node":
        nodeIds.add(op.node.id);
        break;
      case "update_node":
      case "remove_node":
        nodeIds.add(op.nodeId);
        break;
      case "add_edge":
        edgeIds.add(op.edge.id);
        nodeIds.add(op.edge.source);
        nodeIds.add(op.edge.target);
        break;
      case "remove_edge":
        edgeIds.add(op.edgeId);
        break;
      case "replace_edge":
        edgeIds.add(op.edgeId);
        edgeIds.add(op.edge.id);
        nodeIds.add(op.edge.source);
        nodeIds.add(op.edge.target);
        break;
      default:
        break;
    }
  }

  return { nodeIds: [...nodeIds], edgeIds: [...edgeIds] };
}

function humanizeReason(reason: string): string | null {
  const trimmed = reason.trim();
  if (!trimmed) return null;
  // Prefer short title-ish reasons from the demo editor
  if (trimmed.length <= 48) {
    return trimmed.replace(/\.$/, "");
  }
  return null;
}
