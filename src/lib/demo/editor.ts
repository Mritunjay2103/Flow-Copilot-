import {
  AgentEditResponse,
  AspectRatio,
  createIdleRuntime,
  GraphEditOperation,
  Platform,
  Workflow,
  WorkflowNode,
  WorkflowNodeKind,
} from "@/lib/workflow";
import { KIND_LABELS } from "./brief-parser";

const EXAMPLE_COMMANDS = [
  "add a brand check",
  "add captions",
  "remove narration",
  "make it 9:16",
  "make it cinematic",
];

function emptyEdit(
  assistantMessage: string,
  intentSummary: string,
): AgentEditResponse {
  return { assistantMessage, intentSummary, operations: [] };
}

function findByKind(
  workflow: Workflow,
  kind: WorkflowNodeKind,
): WorkflowNode | undefined {
  return workflow.nodes.find((n) => n.kind === kind);
}

function modelClassFor(kind: WorkflowNodeKind): WorkflowNode["config"]["modelClass"] {
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

function buildNode(
  kind: WorkflowNodeKind,
  workflow: Workflow,
  position: { x: number; y: number },
): WorkflowNode {
  const needsProvider =
    kind === "image_generator" || kind === "video_generator";
  return {
    id: kind,
    kind,
    label: KIND_LABELS[kind],
    description: needsProvider
      ? "Provider placeholder — not connected to a generation API"
      : `Demo ${KIND_LABELS[kind].toLowerCase()} node`,
    position,
    config: {
      modelClass: modelClassFor(kind),
      instruction: `Execute ${KIND_LABELS[kind]} for ${workflow.brief.product}`,
      enabled: true,
      settings: needsProvider
        ? [
            { key: "provider", value: "none" },
            { key: "requires_provider", value: "true" },
          ]
        : [],
    },
    runtime: createIdleRuntime(),
    locked: false,
  };
}

function insertBeforeOperations(
  workflow: Workflow,
  kind: WorkflowNodeKind,
  beforeKind: WorkflowNodeKind,
): GraphEditOperation[] | null {
  if (findByKind(workflow, kind)) return null;

  const before =
    findByKind(workflow, beforeKind) ?? findByKind(workflow, "output");
  if (!before) return null;

  const inbound = workflow.edges.find((e) => e.target === before.id);
  if (!inbound) return null;

  const sourceNode = workflow.nodes.find((n) => n.id === inbound.source);
  const newNode = buildNode(kind, workflow, {
    x: sourceNode
      ? (sourceNode.position.x + before.position.x) / 2
      : before.position.x - 130,
    y: before.position.y,
  });

  const edgeInId = `e_${inbound.source}_${newNode.id}`.slice(0, 64);
  const edgeOutId = `e_${newNode.id}_${before.id}`.slice(0, 64);

  return [
    {
      type: "remove_edge",
      reason: `Open path to insert ${kind}`,
      edgeId: inbound.id,
    },
    {
      type: "add_node",
      reason: `Add ${KIND_LABELS[kind]}`,
      node: newNode,
    },
    {
      type: "add_edge",
      reason: `Connect upstream to ${kind}`,
      edge: {
        id: edgeInId,
        source: inbound.source,
        target: newNode.id,
        animated: false,
      },
    },
    {
      type: "add_edge",
      reason: `Connect ${kind} downstream`,
      edge: {
        id: edgeOutId,
        source: newNode.id,
        target: before.id,
        animated: false,
      },
    },
  ];
}

function removeKindOperations(
  workflow: Workflow,
  kind: WorkflowNodeKind,
): GraphEditOperation[] | null {
  const node = findByKind(workflow, kind);
  if (!node || node.locked) return null;

  const incoming = workflow.edges.filter((e) => e.target === node.id);
  const outgoing = workflow.edges.filter((e) => e.source === node.id);
  const ops: GraphEditOperation[] = [];

  for (const edge of [...incoming, ...outgoing]) {
    ops.push({
      type: "remove_edge",
      reason: `Detach ${kind} before removal`,
      edgeId: edge.id,
    });
  }

  if (incoming[0] && outgoing[0]) {
    ops.push({
      type: "add_edge",
      reason: `Bridge around removed ${kind}`,
      edge: {
        id: `e_${incoming[0].source}_${outgoing[0].target}`.slice(0, 64),
        source: incoming[0].source,
        target: outgoing[0].target,
        animated: false,
      },
    });
  }

  ops.push({
    type: "remove_node",
    reason: `Remove ${KIND_LABELS[kind]}`,
    nodeId: node.id,
  });

  return ops;
}

function success(
  intentSummary: string,
  assistantMessage: string,
  operations: GraphEditOperation[],
): AgentEditResponse {
  return { intentSummary, assistantMessage, operations };
}

function parseAspectRatio(command: string): AspectRatio | null {
  if (/\b9\s*:\s*16\b/.test(command) || /\bvertical\b/.test(command)) return "9:16";
  if (
    /\b16\s*:\s*9\b/.test(command) ||
    /\bhorizontal\b/.test(command) ||
    /\blandscape\b/.test(command)
  ) {
    return "16:9";
  }
  if (/\b1\s*:\s*1\b/.test(command) || /\bsquare\b/.test(command)) return "1:1";
  if (/\b4\s*:\s*5\b/.test(command)) return "4:5";
  return null;
}

function parsePlatform(command: string): Platform | null {
  if (/instagram|reels/.test(command)) return "instagram_reels";
  if (/youtube\s*shorts|shorts/.test(command)) return "youtube_shorts";
  if (/tiktok/.test(command)) return "tiktok";
  if (/youtube/.test(command)) return "youtube";
  if (/\bweb\b/.test(command)) return "web";
  if (/multi[\s-]?platform/.test(command)) return "multi_platform";
  return null;
}

function parseDuration(command: string): number | null {
  const match = command.match(
    /\b(?:duration|length|make it)\s*(?:to\s*)?(\d{1,3})\b/,
  );
  if (match) {
    const n = Number(match[1]);
    return n >= 5 && n <= 300 ? n : null;
  }
  const bare = command.match(/\b(\d{1,3})\s*(?:s|sec|seconds)\b/);
  if (!bare) return null;
  const n = Number(bare[1]);
  return n >= 5 && n <= 300 ? n : null;
}

function projectOperations(
  workflow: Workflow,
  ops: GraphEditOperation[],
): Workflow {
  let nodes = [...workflow.nodes];
  let edges = [...workflow.edges];
  for (const op of ops) {
    if (op.type === "remove_edge") {
      edges = edges.filter((e) => e.id !== op.edgeId);
    } else if (op.type === "add_edge") {
      edges = [...edges, op.edge];
    } else if (op.type === "add_node") {
      nodes = [...nodes, op.node];
    } else if (op.type === "remove_node") {
      nodes = nodes.filter((n) => n.id !== op.nodeId);
    }
  }
  return { ...workflow, nodes, edges };
}

function tryAdd(
  workflow: Workflow,
  kind: WorkflowNodeKind,
  before: WorkflowNodeKind,
  intent: string,
  message: string,
): AgentEditResponse {
  if (findByKind(workflow, kind)) {
    return emptyEdit(
      `${KIND_LABELS[kind]} is already present. No changes were made.`,
      `${KIND_LABELS[kind]} exists`,
    );
  }
  const ops = insertBeforeOperations(workflow, kind, before);
  if (!ops) {
    return emptyEdit(
      `Could not place ${KIND_LABELS[kind].toLowerCase()} safely. No changes were made.`,
      `Add ${kind} failed`,
    );
  }
  return success(intent, message, ops);
}

function tryRemove(
  workflow: Workflow,
  kind: WorkflowNodeKind,
  intent: string,
  message: string,
): AgentEditResponse {
  const ops = removeKindOperations(workflow, kind);
  if (!ops) {
    return emptyEdit(
      `There is no ${KIND_LABELS[kind].toLowerCase()} to remove. No changes were made.`,
      `No ${kind}`,
    );
  }
  return success(intent, message, ops);
}

/**
 * Deterministic conversational editor: returns operations, never a replaced graph.
 */
export function editWorkflowWithDemo(
  workflow: Workflow,
  message: string,
): AgentEditResponse {
  const command = message.trim().toLowerCase();
  if (!command) {
    return emptyEdit(
      "I need a command to edit the graph. Try: add captions, make it 9:16, or create three opening hooks.",
      "Empty command",
    );
  }

  // replace voice-over with subtitles
  if (
    /replace/.test(command) &&
    (/voice/.test(command) || /narration/.test(command)) &&
    (/subtitle/.test(command) || /caption/.test(command))
  ) {
    const ops: GraphEditOperation[] = [];
    if (!findByKind(workflow, "subtitle")) {
      const addSub = insertBeforeOperations(
        workflow,
        "subtitle",
        "brand_validator",
      );
      if (addSub) ops.push(...addSub);
    }
    if (findByKind(workflow, "voiceover")) {
      // Removal ops must account for graph after subtitle insert; apply against a
      // shallow projected node/edge list when subtitle was newly added on a different edge.
      const projected = projectOperations(workflow, ops);
      const removeVo = removeKindOperations(projected, "voiceover");
      if (removeVo) ops.push(...removeVo);
    }

    if (ops.length === 0) {
      return emptyEdit(
        "Subtitles are already present and there is no voice-over to replace. No changes were made.",
        "Nothing to replace",
      );
    }

    return success(
      "Replace voice-over with subtitles",
      "Prepared operations to ensure subtitles are present and remove voice-over.",
      ops,
    );
  }

  const isAdd =
    /\badd\b|\binclude\b|\binsert\b|\bcreate\b/.test(command) ||
    /\bmake\b.*\bwith\b/.test(command);
  const isRemove = /\bremove\b|\bdelete\b|\bdrop\b/.test(command);

  if (isAdd) {
    if (/brand/.test(command)) {
      return tryAdd(
        workflow,
        "brand_validator",
        "output",
        "Add brand check",
        "I'll add a brand check before the output node.",
      );
    }
    if (/caption|subtitle/.test(command)) {
      return tryAdd(
        workflow,
        "subtitle",
        "brand_validator",
        "Add subtitles",
        "I'll add a subtitles node before the brand check.",
      );
    }
    if (/voice|narration/.test(command)) {
      return tryAdd(
        workflow,
        "voiceover",
        "brand_validator",
        "Add voice-over",
        "I'll add a voice-over node before the brand check.",
      );
    }
    if (/music|soundtrack|score/.test(command)) {
      return tryAdd(
        workflow,
        "music",
        "brand_validator",
        "Add music",
        "I'll add a music node before the brand check.",
      );
    }
    if (/image/.test(command)) {
      return tryAdd(
        workflow,
        "image_generator",
        "brand_validator",
        "Add image generation",
        "I'll add an image generation placeholder (provider required).",
      );
    }
    if (/video/.test(command)) {
      return tryAdd(
        workflow,
        "video_generator",
        "brand_validator",
        "Add video generation",
        "I'll add a video generation placeholder (provider required).",
      );
    }
    if (/platform/.test(command)) {
      return tryAdd(
        workflow,
        "platform_adapter",
        "output",
        "Add platform adapter",
        "I'll add a platform adapter before output.",
      );
    }
    if (/hook/.test(command) || /three opening/.test(command)) {
      const script = findByKind(workflow, "script_writer");
      const preferBeforeScript = /script/.test(command) && Boolean(script);
      const beforeKind: WorkflowNodeKind = preferBeforeScript
        ? "script_writer"
        : findByKind(workflow, "scene_planner")
          ? "scene_planner"
          : "brand_validator";

      const existing = findByKind(workflow, "hook_variants");
      if (existing && preferBeforeScript && script) {
        const intoScript = workflow.edges.find((e) => e.target === script.id);
        if (intoScript?.source === existing.id) {
          return emptyEdit(
            "Hook variants are already before the script. No changes were made.",
            "Hooks already before script",
          );
        }
        const removeOps = removeKindOperations(workflow, "hook_variants");
        if (!removeOps) {
          return emptyEdit(
            "Could not move hook variants safely. No changes were made.",
            "Move hooks failed",
          );
        }
        const projected = projectOperations(workflow, removeOps);
        const insertOps = insertBeforeOperations(
          projected,
          "hook_variants",
          "script_writer",
        );
        if (!insertOps) {
          return emptyEdit(
            "Could not place hook variants before the script. No changes were made.",
            "Move hooks insert failed",
          );
        }
        return success(
          "Move hook variants before script",
          "I'll move the three hook variants to sit before the script.",
          [...removeOps, ...insertOps],
        );
      }

      return tryAdd(
        workflow,
        "hook_variants",
        beforeKind,
        "Add hook variants",
        preferBeforeScript
          ? "I'll add three hook variants before the script."
          : beforeKind === "scene_planner"
            ? "I'll add three hook variants before the scene planner."
            : "I'll add three hook variants to the graph.",
      );
    }
  }

  if (isRemove) {
    if (/brand/.test(command)) {
      return tryRemove(
        workflow,
        "brand_validator",
        "Remove brand check",
        "I'll remove the brand check and bridge its neighbors.",
      );
    }
    if (/voice|narration/.test(command)) {
      return tryRemove(
        workflow,
        "voiceover",
        "Remove voice-over",
        "I'll remove the voice-over node.",
      );
    }
    if (/caption|subtitle/.test(command)) {
      return tryRemove(
        workflow,
        "subtitle",
        "Remove subtitles",
        "I'll remove the subtitles node.",
      );
    }
    if (/music|soundtrack/.test(command)) {
      return tryRemove(
        workflow,
        "music",
        "Remove music",
        "I'll remove the music node.",
      );
    }
    if (/image/.test(command)) {
      return tryRemove(
        workflow,
        "image_generator",
        "Remove image generation",
        "I'll remove the image generation node.",
      );
    }
    if (/video/.test(command)) {
      return tryRemove(
        workflow,
        "video_generator",
        "Remove video generation",
        "I'll remove the video generation node.",
      );
    }
    if (/platform/.test(command)) {
      return tryRemove(
        workflow,
        "platform_adapter",
        "Remove platform adapter",
        "I'll remove the platform adapter.",
      );
    }
    if (/hook/.test(command)) {
      return tryRemove(
        workflow,
        "hook_variants",
        "Remove hook variants",
        "I'll remove the hook variants node.",
      );
    }
    if (/output|everything|all nodes|brief_input|the brief/.test(command)) {
      return emptyEdit(
        "That removal is ambiguous or unsafe for this prototype. Say which optional node to remove (for example: remove narration).",
        "Ambiguous removal",
      );
    }
  }

  const aspect = parseAspectRatio(command);
  if (
    aspect &&
    (/aspect|make it|ratio|vertical|horizontal|square|landscape/.test(command) ||
      /\d\s*:\s*\d/.test(command))
  ) {
    if (workflow.brief.aspectRatio === aspect) {
      return emptyEdit(
        `Aspect ratio is already ${aspect}. No changes were made.`,
        "Aspect unchanged",
      );
    }
    return success(
      `Set aspect ratio to ${aspect}`,
      `I'll update the brief aspect ratio to ${aspect}.`,
      [
        {
          type: "update_workflow_metadata",
          reason: `Set aspect ratio to ${aspect}`,
          patch: { brief: { aspectRatio: aspect } },
        },
      ],
    );
  }

  if (/cinematic|energetic|playful|premium|tone|make it/.test(command) && !/\d\s*:\s*\d/.test(command)) {
    let tone: string | null = null;
    if (/cinematic/.test(command)) tone = "cinematic";
    else if (/energetic/.test(command)) tone = "energetic";
    else if (/playful/.test(command)) tone = "playful";
    else if (/premium/.test(command)) tone = "premium";
    else {
      const m = command.match(/make it\s+([a-z][a-z\s-]{1,40})$/);
      tone = m?.[1]?.trim() ?? null;
    }
    if (tone) {
      return success(
        `Set tone to ${tone}`,
        `I'll update the creative tone to “${tone}”.`,
        [
          {
            type: "update_workflow_metadata",
            reason: `Set tone to ${tone}`,
            patch: { brief: { tone } },
          },
        ],
      );
    }
  }

  const platform = parsePlatform(command);
  if (
    platform &&
    /platform|target|switch|for instagram|for tiktok|for youtube|for web|multi/.test(
      command,
    )
  ) {
    if (workflow.brief.platform === platform) {
      return emptyEdit(
        `Platform is already ${platform}. No changes were made.`,
        "Platform unchanged",
      );
    }
    return success(
      `Set platform to ${platform}`,
      `I'll update the brief platform to ${platform}.`,
      [
        {
          type: "update_workflow_metadata",
          reason: `Set platform to ${platform}`,
          patch: { brief: { platform } },
        },
      ],
    );
  }

  const duration = parseDuration(command);
  if (
    duration !== null &&
    /duration|length|seconds|make it \d|\d\s*s\b/.test(command)
  ) {
    if (workflow.brief.durationSec === duration) {
      return emptyEdit(
        `Duration is already ${duration}s. No changes were made.`,
        "Duration unchanged",
      );
    }
    return success(
      `Set duration to ${duration}s`,
      `I'll update the brief duration to ${duration} seconds.`,
      [
        {
          type: "update_workflow_metadata",
          reason: `Set duration to ${duration}`,
          patch: { brief: { durationSec: duration } },
        },
      ],
    );
  }

  const examples = EXAMPLE_COMMANDS.map((c) => `• ${c}`).join("\n");
  return emptyEdit(
    `I could not map that to a graph edit. No changes were made. Try one of:\n${examples}`,
    "Unsupported command",
  );
}
