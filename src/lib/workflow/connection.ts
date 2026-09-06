import {
  isInputNode,
  isOutputNode,
  type NodeModelClass,
  type Workflow,
  type WorkflowNode,
} from "./schema";
import { getDownstreamNodeIds } from "./graph";

export type ConnectionRejectReason =
  | "missing_endpoint"
  | "self_loop"
  | "duplicate"
  | "incompatible_model_class"
  | "cycle";

export type ConnectionValidation =
  | { ok: true }
  | { ok: false; reason: ConnectionRejectReason; message: string };

/**
 * Validates a prospective edge before it is written to the store.
 * Prevents self-loops, duplicates, obvious model-class mismatches, and cycles.
 */
export function validateProposedConnection(
  workflow: Workflow,
  sourceId: string,
  targetId: string,
): ConnectionValidation {
  const source = workflow.nodes.find((n) => n.id === sourceId);
  const target = workflow.nodes.find((n) => n.id === targetId);

  if (!source || !target) {
    return {
      ok: false,
      reason: "missing_endpoint",
      message: "Both endpoints must exist.",
    };
  }

  if (sourceId === targetId) {
    return {
      ok: false,
      reason: "self_loop",
      message: "A node cannot connect to itself.",
    };
  }

  if (workflow.edges.some((e) => e.source === sourceId && e.target === targetId)) {
    return {
      ok: false,
      reason: "duplicate",
      message: "That connection already exists.",
    };
  }

  const classCheck = areModelClassesCompatible(
    source.config.modelClass,
    target.config.modelClass,
    source,
    target,
  );
  if (!classCheck.ok) return classCheck;

  if (wouldCreateCycle(workflow, sourceId, targetId)) {
    return {
      ok: false,
      reason: "cycle",
      message: "That connection would create a cycle.",
    };
  }

  return { ok: true };
}

export function areModelClassesCompatible(
  sourceClass: NodeModelClass,
  targetClass: NodeModelClass,
  source?: WorkflowNode,
  target?: WorkflowNode,
): ConnectionValidation {
  if (source && isOutputNode(source)) {
    return {
      ok: false,
      reason: "incompatible_model_class",
      message: "Output nodes cannot have outgoing connections.",
    };
  }
  if (target && isInputNode(target)) {
    return {
      ok: false,
      reason: "incompatible_model_class",
      message: "Input nodes cannot have incoming connections.",
    };
  }
  if (sourceClass === "output") {
    return {
      ok: false,
      reason: "incompatible_model_class",
      message: "Output model class cannot connect outward.",
    };
  }
  if (targetClass === "input") {
    return {
      ok: false,
      reason: "incompatible_model_class",
      message: "Input model class cannot accept incoming connections.",
    };
  }
  return { ok: true };
}

function wouldCreateCycle(
  workflow: Workflow,
  sourceId: string,
  targetId: string,
): boolean {
  // Cycle if target can already reach source
  if (sourceId === targetId) return true;
  const fromTarget = getDownstreamNodeIds(workflow, targetId);
  return fromTarget.includes(sourceId);
}

export function nodeRequiresProvider(node: WorkflowNode): boolean {
  if (
    node.kind === "image_generator" ||
    node.kind === "video_generator" ||
    node.kind === "voiceover" ||
    node.kind === "music"
  ) {
    return true;
  }
  if (
    node.config.modelClass === "image" ||
    node.config.modelClass === "video" ||
    node.config.modelClass === "audio"
  ) {
    return true;
  }
  return node.config.settings.some(
    (s) => s.key === "requires_provider" && s.value === "true",
  );
}
