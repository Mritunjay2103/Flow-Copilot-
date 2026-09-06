import type { ActiveAiMode } from "@/lib/ai-mode";
import {
  getDownstreamNodeIds,
  getUpstreamNodeIds,
  topologicalLevels,
  validateWorkflowGraph,
  type NodeExecutionResult,
  type NodeRunStatus,
  type Workflow,
  type WorkflowNode,
} from "@/lib/workflow";

export type UpstreamOutputItem = {
  nodeId: string;
  nodeLabel: string;
  result: NodeExecutionResult;
};

export type RunNodeTransportRequest = {
  workflowContext: {
    workflowId: string;
    title: string;
    brief: Workflow["brief"];
    mode: "demo" | "ollama";
  };
  node: WorkflowNode;
  upstreamOutputs: UpstreamOutputItem[];
  signal?: AbortSignal;
};

export type RunNodeTransportResponse = {
  result: NodeExecutionResult;
  status: NodeRunStatus;
  activeMode: ActiveAiMode;
  model: string | null;
  durationMs: number;
};

export type RunNodeTransport = (
  request: RunNodeTransportRequest,
) => Promise<RunNodeTransportResponse>;

export type OrchestratorProgress = {
  completedTerminal: number;
  enabledCount: number;
  ratio: number;
};

const TERMINAL: ReadonlySet<NodeRunStatus> = new Set([
  "completed",
  "failed",
  "needs_provider",
  "skipped",
]);

function cloneWorkflow(workflow: Workflow): Workflow {
  return structuredClone(workflow);
}

function updateNodeRuntime(
  workflow: Workflow,
  nodeId: string,
  runtime: WorkflowNode["runtime"],
): Workflow {
  return {
    ...workflow,
    nodes: workflow.nodes.map((n) =>
      n.id === nodeId ? { ...n, runtime: { ...runtime } } : n,
    ),
    updatedAt: new Date().toISOString(),
  };
}

function collectUpstreamOutputs(
  workflow: Workflow,
  nodeId: string,
): UpstreamOutputItem[] {
  const upstreamIds = getUpstreamNodeIds(workflow, nodeId);
  const items: UpstreamOutputItem[] = [];
  for (const id of upstreamIds) {
    const node = workflow.nodes.find((n) => n.id === id);
    if (!node?.runtime.output) continue;
    if (
      node.runtime.status === "completed" ||
      node.runtime.status === "needs_provider"
    ) {
      items.push({
        nodeId: node.id,
        nodeLabel: node.label,
        result: node.runtime.output,
      });
    }
  }
  return items;
}

function markSkippedDependents(
  workflow: Workflow,
  failedNodeId: string,
): Workflow {
  const downstream = getDownstreamNodeIds(workflow, failedNodeId);
  let next = workflow;
  for (const id of downstream) {
    const node = next.nodes.find((n) => n.id === id);
    if (!node || !node.config.enabled) continue;
    if (TERMINAL.has(node.runtime.status) && node.runtime.status !== "queued") {
      continue;
    }
    next = updateNodeRuntime(next, id, {
      status: "skipped",
      error: `Skipped because upstream node ${failedNodeId} failed.`,
      completedAt: new Date().toISOString(),
    });
  }
  return next;
}

export function computeExecutionProgress(workflow: Workflow): OrchestratorProgress {
  const enabled = workflow.nodes.filter((n) => n.config.enabled);
  const completedTerminal = enabled.filter((n) =>
    TERMINAL.has(n.runtime.status),
  ).length;
  const enabledCount = enabled.length || 1;
  return {
    completedTerminal,
    enabledCount: enabled.length,
    ratio: completedTerminal / enabledCount,
  };
}

export type OrchestrateOptions = {
  workflow: Workflow;
  transport: RunNodeTransport;
  signal?: AbortSignal;
  onUpdate?: (workflow: Workflow, progress: OrchestratorProgress) => void;
};

/**
 * Client-safe DAG orchestration. Never mutates the original workflow.
 * HTTP transport is injectable so tests do not need a server.
 */
export async function orchestrateWorkflowExecution(
  options: OrchestrateOptions,
): Promise<Workflow> {
  const validation = validateWorkflowGraph(options.workflow);
  if (!validation.ok) {
    throw new Error(
      `Cannot execute invalid graph: ${validation.issues.map((i) => i.message).join("; ")}`,
    );
  }

  let current = cloneWorkflow(options.workflow);

  // Queue all enabled nodes
  for (const node of current.nodes) {
    if (!node.config.enabled) continue;
    current = updateNodeRuntime(current, node.id, { status: "queued" });
  }
  options.onUpdate?.(current, computeExecutionProgress(current));

  const levels = topologicalLevels(current);

  const throwIfAborted = () => {
    if (options.signal?.aborted) {
      const err = new Error("Execution aborted");
      err.name = "AbortError";
      throw err;
    }
  };

  for (const level of levels) {
    throwIfAborted();

    const runnable = level.filter((id) => {
      const node = current.nodes.find((n) => n.id === id);
      return node?.config.enabled && node.runtime.status === "queued";
    });

    type Outcome =
      | {
          nodeId: string;
          startedAt: string;
          ok: true;
          response: RunNodeTransportResponse;
        }
      | {
          nodeId: string;
          startedAt: string;
          ok: false;
          error: unknown;
        };

    const toRun: string[] = [];

    for (const nodeId of runnable) {
      const node = current.nodes.find((n) => n.id === nodeId);
      if (!node) continue;

      const directUp = current.edges
        .filter((e) => e.target === nodeId)
        .map((e) => e.source);
      const blocked = directUp.some((upId) => {
        const up = current.nodes.find((n) => n.id === upId);
        return (
          up?.runtime.status === "failed" || up?.runtime.status === "skipped"
        );
      });

      if (blocked) {
        current = updateNodeRuntime(current, nodeId, {
          status: "skipped",
          error: "Skipped because an upstream dependency failed.",
          completedAt: new Date().toISOString(),
        });
        options.onUpdate?.(current, computeExecutionProgress(current));
        continue;
      }

      const startedAt = new Date().toISOString();
      current = updateNodeRuntime(current, nodeId, {
        status: "running",
        startedAt,
      });
      options.onUpdate?.(current, computeExecutionProgress(current));
      toRun.push(nodeId);
    }

    const outcomes: Outcome[] = await Promise.all(
      toRun.map(async (nodeId) => {
        throwIfAborted();
        const node = current.nodes.find((n) => n.id === nodeId)!;
        const startedAt = node.runtime.startedAt ?? new Date().toISOString();
        try {
          const response = await options.transport({
            workflowContext: {
              workflowId: current.id,
              title: current.title,
              brief: current.brief,
              mode: current.mode,
            },
            node,
            upstreamOutputs: collectUpstreamOutputs(current, nodeId),
            signal: options.signal,
          });
          throwIfAborted();
          return { nodeId, startedAt, ok: true as const, response };
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") {
            throw error;
          }
          return { nodeId, startedAt, ok: false as const, error };
        }
      }),
    );

    for (const outcome of outcomes) {
      if (outcome.ok) {
        const completedAt = new Date().toISOString();
        current = updateNodeRuntime(current, outcome.nodeId, {
          status: outcome.response.status,
          startedAt: outcome.startedAt,
          completedAt,
          durationMs: outcome.response.durationMs,
          output: outcome.response.result,
        });
      } else {
        const completedAt = new Date().toISOString();
        const message =
          outcome.error instanceof Error
            ? outcome.error.message
            : "Node execution failed";
        current = updateNodeRuntime(current, outcome.nodeId, {
          status: "failed",
          startedAt: outcome.startedAt,
          completedAt,
          durationMs: Math.max(
            0,
            Date.now() - new Date(outcome.startedAt).getTime(),
          ),
          error: message.slice(0, 2000),
        });
        current = markSkippedDependents(current, outcome.nodeId);
      }
      options.onUpdate?.(current, computeExecutionProgress(current));
    }
  }

  return current;
}

/**
 * Retry a single failed node after confirming upstream dependencies are ready.
 */
export async function retryFailedNode(options: {
  workflow: Workflow;
  nodeId: string;
  transport: RunNodeTransport;
  signal?: AbortSignal;
}): Promise<Workflow> {
  const validation = validateWorkflowGraph(options.workflow);
  if (!validation.ok) {
    throw new Error(
      `Cannot retry on invalid graph: ${validation.issues.map((i) => i.message).join("; ")}`,
    );
  }

  let current = cloneWorkflow(options.workflow);
  const node = current.nodes.find((n) => n.id === options.nodeId);
  if (!node) {
    throw new Error(`Unknown node id: ${options.nodeId}`);
  }
  if (
    node.runtime.status !== "failed" &&
    node.runtime.status !== "needs_provider"
  ) {
    throw new Error(
      `Node ${options.nodeId} is not eligible for retry (status: ${node.runtime.status}).`,
    );
  }

  const upstreamIds = getUpstreamNodeIds(current, options.nodeId);
  const upstreamReady = upstreamIds.every((id) => {
    const up = current.nodes.find((n) => n.id === id);
    if (!up || !up.config.enabled) return true;
    return (
      up.runtime.status === "completed" ||
      up.runtime.status === "needs_provider"
    );
  });
  if (!upstreamReady) {
    throw new Error(
      `Upstream dependencies for ${options.nodeId} are not ready for retry.`,
    );
  }

  // Un-skip dependents that were skipped solely due to this failure — reset them to queued
  // only if all other upstreams are ok; keep simple: re-queue this node and previously skipped
  // descendants so a later full run or this retry path can continue.
  const startedAt = new Date().toISOString();
  current = updateNodeRuntime(current, options.nodeId, {
    status: "running",
    startedAt,
  });

  try {
    const response = await options.transport({
      workflowContext: {
        workflowId: current.id,
        title: current.title,
        brief: current.brief,
        mode: current.mode,
      },
      node,
      upstreamOutputs: collectUpstreamOutputs(current, options.nodeId),
      signal: options.signal,
    });

    const completedAt = new Date().toISOString();
    current = updateNodeRuntime(current, options.nodeId, {
      status: response.status,
      startedAt,
      completedAt,
      durationMs: response.durationMs,
      output: response.result,
    });

    // Re-queue skipped dependents so caller can continue orchestration if desired
    for (const depId of getDownstreamNodeIds(current, options.nodeId)) {
      const dep = current.nodes.find((n) => n.id === depId);
      if (dep?.runtime.status === "skipped") {
        current = updateNodeRuntime(current, depId, { status: "queued" });
      }
    }

    return current;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    const completedAt = new Date().toISOString();
    return updateNodeRuntime(current, options.nodeId, {
      status: "failed",
      startedAt,
      completedAt,
      error: (error instanceof Error ? error.message : "Retry failed").slice(
        0,
        2000,
      ),
    });
  }
}
