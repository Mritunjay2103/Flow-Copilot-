import {
  CreativeBrief,
  Workflow,
  WorkflowEdge,
  WorkflowNode,
  createIdleRuntime,
} from "./schema";

const ISO_A = "2026-09-06T10:00:00.000Z";
const ISO_B = "2026-09-06T10:05:00.000Z";

export function createSneakerLaunchBrief(): CreativeBrief {
  return {
    objective: "Launch a limited neon runner with three hook variants for Reels",
    audience: "Urban runners aged 18–34 who follow sneaker drops",
    platform: "instagram_reels",
    durationSec: 30,
    aspectRatio: "9:16",
    tone: "energetic and premium",
    product: "HexPulse Neon Runner",
    visualDirection: "Night city neon reflections, kinetic camera, product hero close-ups",
    requiredElements: ["hooks", "product close-up", "logo end card"],
    avoidElements: ["competitor logos", "medical claims"],
    callToAction: "Shop the drop tonight",
  };
}

function node(partial: Omit<WorkflowNode, "runtime"> & { runtime?: WorkflowNode["runtime"] }): WorkflowNode {
  return {
    ...partial,
    runtime: partial.runtime ?? createIdleRuntime(),
  };
}

function edge(
  id: string,
  source: string,
  target: string,
  animated = false,
): WorkflowEdge {
  return { id, source, target, animated };
}

/** Smallest valid DAG: brief_input → analyzer → output */
export function createMinimalValidWorkflow(
  overrides?: Partial<Pick<Workflow, "id" | "mode" | "version">>,
): Workflow {
  const brief = createSneakerLaunchBrief();
  return {
    schemaVersion: 1,
    id: overrides?.id ?? "wf_minimal",
    title: "Minimal sneaker workflow",
    objective: brief.objective,
    brief,
    nodes: [
      node({
        id: "brief_input",
        kind: "brief_input",
        label: "Brief",
        description: "Campaign brief intake",
        position: { x: 0, y: 80 },
        config: {
          modelClass: "input",
          instruction: "Capture the creative brief",
          enabled: true,
          settings: [],
        },
        locked: true,
      }),
      node({
        id: "brief_analyzer",
        kind: "brief_analyzer",
        label: "Analyze brief",
        description: "Extract constraints and success criteria",
        position: { x: 280, y: 80 },
        config: {
          modelClass: "text",
          instruction: "Analyze audience, platform, and promise",
          enabled: true,
          settings: [],
        },
        locked: false,
      }),
      node({
        id: "output",
        kind: "output",
        label: "Output",
        description: "Package ready assets",
        position: { x: 560, y: 80 },
        config: {
          modelClass: "output",
          instruction: "Summarize deliverables",
          enabled: true,
          settings: [],
        },
        locked: false,
      }),
    ],
    edges: [
      edge("e_brief_analyzer", "brief_input", "brief_analyzer"),
      edge("e_analyzer_output", "brief_analyzer", "output"),
    ],
    createdAt: ISO_A,
    updatedAt: ISO_B,
    version: overrides?.version ?? 1,
    mode: overrides?.mode ?? "demo",
  };
}

/** Branched DAG with hook variants feeding brand check then output. */
export function createBranchedHookWorkflow(): Workflow {
  const brief = createSneakerLaunchBrief();
  return {
    schemaVersion: 1,
    id: "wf_hooks",
    title: "HexPulse hook variants",
    objective: brief.objective,
    brief,
    nodes: [
      node({
        id: "brief_input",
        kind: "brief_input",
        label: "Brief",
        description: "Campaign brief intake",
        position: { x: 0, y: 160 },
        config: {
          modelClass: "input",
          instruction: "Capture the creative brief",
          enabled: true,
          settings: [],
        },
        locked: true,
      }),
      node({
        id: "brief_analyzer",
        kind: "brief_analyzer",
        label: "Analyze brief",
        description: "Extract constraints",
        position: { x: 240, y: 160 },
        config: {
          modelClass: "text",
          instruction: "Analyze brief fields",
          enabled: true,
          settings: [],
        },
        locked: false,
      }),
      node({
        id: "script_writer",
        kind: "script_writer",
        label: "Script",
        description: "Write short-form script",
        position: { x: 480, y: 40 },
        config: {
          modelClass: "text",
          instruction: "Write hook, body, CTA",
          enabled: true,
          settings: [],
        },
        locked: false,
      }),
      node({
        id: "hook_variants",
        kind: "hook_variants",
        label: "Hook variants",
        description: "Three opening hooks",
        position: { x: 480, y: 280 },
        config: {
          modelClass: "text",
          instruction: "Produce three distinct hooks",
          enabled: true,
          settings: [{ key: "count", value: "3" }],
        },
        locked: false,
      }),
      node({
        id: "brand_validator",
        kind: "brand_validator",
        label: "Brand check",
        description: "Validate brand and claims",
        position: { x: 720, y: 160 },
        config: {
          modelClass: "utility",
          instruction: "Check required and avoid lists",
          enabled: true,
          settings: [],
        },
        locked: false,
      }),
      node({
        id: "output",
        kind: "output",
        label: "Output",
        description: "Final package",
        position: { x: 960, y: 160 },
        config: {
          modelClass: "output",
          instruction: "Summarize assets",
          enabled: true,
          settings: [],
        },
        locked: false,
      }),
    ],
    edges: [
      edge("e1", "brief_input", "brief_analyzer"),
      edge("e2", "brief_analyzer", "script_writer"),
      edge("e3", "brief_analyzer", "hook_variants"),
      edge("e4", "script_writer", "brand_validator"),
      edge("e5", "hook_variants", "brand_validator"),
      edge("e6", "brand_validator", "output"),
    ],
    createdAt: ISO_A,
    updatedAt: ISO_B,
    version: 1,
    mode: "demo",
  };
}
