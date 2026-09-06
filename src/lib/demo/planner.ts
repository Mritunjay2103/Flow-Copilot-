import {
  CreativeBrief,
  NodeModelClass,
  Workflow,
  WorkflowEdge,
  WorkflowNode,
  WorkflowNodeKind,
  createIdleRuntime,
  validateWorkflowGraph,
} from "@/lib/workflow";
import {
  detectBriefFeatures,
  KIND_LABELS,
  truncateTitle,
} from "./brief-parser";

const COL_WIDTH = 260;
const ROW_HEIGHT = 120;
const MAX_PER_COLUMN = 3;

function modelClassFor(kind: WorkflowNodeKind): NodeModelClass {
  switch (kind) {
    case "brief_input":
      return "input";
    case "image_generator":
      return "image";
    case "video_generator":
      return "video";
    case "voiceover":
    case "music":
      return "audio";
    case "brand_validator":
    case "platform_adapter":
      return "utility";
    case "output":
      return "output";
    default:
      return "text";
  }
}

function instructionFor(kind: WorkflowNodeKind, brief: CreativeBrief): string {
  switch (kind) {
    case "brief_input":
      return `Hold the brief for ${brief.product}`;
    case "brief_analyzer":
      return `Analyze audience, platform, and constraints for ${brief.product}`;
    case "script_writer":
      return `Write a ${brief.durationSec}s ${brief.tone} script for ${brief.platform}`;
    case "scene_planner":
      return `Plan shots for ${brief.aspectRatio} ${brief.platform} delivery`;
    case "prompt_builder":
      return `Build visual prompts in a ${brief.visualDirection} style`;
    case "image_generator":
      return "Generate keyframe stills (provider required)";
    case "video_generator":
      return "Generate motion clips (provider required)";
    case "voiceover":
      return `Narration matching ${brief.tone} tone`;
    case "music":
      return `Soundtrack bed matching ${brief.tone}`;
    case "subtitle":
      return "Burned-in captions for silent viewing";
    case "hook_variants":
      return "Produce three distinct opening hooks";
    case "brand_validator":
      return "Validate required and avoid lists";
    case "platform_adapter":
      return `Adapt output for ${brief.platform}`;
    case "output":
      return "Package ready and provider-dependent assets";
  }
}

function makeNode(
  kind: WorkflowNodeKind,
  brief: CreativeBrief,
  position: { x: number; y: number },
  id: string,
): WorkflowNode {
  const needsProvider =
    kind === "image_generator" || kind === "video_generator";
  return {
    id,
    kind,
    label: KIND_LABELS[kind].slice(0, 60),
    description: needsProvider
      ? "Provider placeholder — not connected to a generation API"
      : instructionFor(kind, brief).slice(0, 240),
    position,
    config: {
      modelClass: modelClassFor(kind),
      instruction: instructionFor(kind, brief),
      enabled: true,
      settings: needsProvider
        ? [
            { key: "provider", value: "none" },
            { key: "requires_provider", value: "true" },
          ]
        : [],
    },
    runtime: createIdleRuntime(),
    locked: kind === "brief_input",
  };
}

function stableId(kind: WorkflowNodeKind, used: Map<string, number>): string {
  const count = used.get(kind) ?? 0;
  used.set(kind, count + 1);
  return count === 0 ? kind : `${kind}_${count + 1}`;
}

function layoutColumns(kinds: WorkflowNodeKind[]): Map<WorkflowNodeKind, { x: number; y: number }> {
  const positions = new Map<WorkflowNodeKind, { x: number; y: number }>();
  let col = 0;
  let row = 0;
  for (const kind of kinds) {
    positions.set(kind, { x: col * COL_WIDTH, y: row * ROW_HEIGHT });
    row += 1;
    if (row >= MAX_PER_COLUMN) {
      row = 0;
      col += 1;
    }
  }
  return positions;
}

/**
 * Build a deterministic workflow DAG from a validated creative brief.
 */
export function planWorkflowFromBrief(
  brief: CreativeBrief,
  options?: { mode?: "demo" | "ollama"; now?: string },
): Workflow {
  const features = detectBriefFeatures(brief);
  const kinds: WorkflowNodeKind[] = [
    "brief_input",
    "brief_analyzer",
    "script_writer",
  ];

  if (features.hooks) kinds.push("hook_variants");
  kinds.push("scene_planner", "prompt_builder");
  if (features.mediaGenerators) {
    kinds.push("image_generator", "video_generator");
  }
  if (features.voiceover) kinds.push("voiceover");
  if (features.subtitle) kinds.push("subtitle");
  if (features.music) kinds.push("music");
  kinds.push("brand_validator");
  if (features.platformAdapter) kinds.push("platform_adapter");
  kinds.push("output");

  const used = new Map<string, number>();
  const positions = layoutColumns(kinds);
  const nodes: WorkflowNode[] = kinds.map((kind) => {
    const id = stableId(kind, used);
    return makeNode(kind, brief, positions.get(kind)!, id);
  });

  const edges: WorkflowEdge[] = [];
  for (let i = 0; i < nodes.length - 1; i += 1) {
    const source = nodes[i]!;
    const target = nodes[i + 1]!;
    edges.push({
      id: `e_${source.id}_${target.id}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64),
      source: source.id,
      target: target.id,
      animated: false,
    });
  }

  const now = options?.now ?? new Date().toISOString();
  const workflow: Workflow = {
    schemaVersion: 1,
    id: "wf_demo_plan",
    title: truncateTitle(brief.product, brief.objective, 120),
    objective: brief.objective,
    brief: structuredClone(brief),
    nodes,
    edges,
    createdAt: now,
    updatedAt: now,
    version: 1,
    mode: options?.mode ?? "demo",
  };

  const validation = validateWorkflowGraph(workflow);
  if (!validation.ok) {
    throw new Error(
      `Demo planner produced invalid graph: ${validation.issues.map((i) => i.message).join("; ")}`,
    );
  }

  return workflow;
}
