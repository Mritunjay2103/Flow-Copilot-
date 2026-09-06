import type {
  CreativeBrief,
  NodeExecutionResult,
  WorkflowNode,
  WorkflowNodeKind,
} from "@/lib/workflow";

export type UpstreamOutputs = Record<string, NodeExecutionResult | undefined>;

/** Configurable demo delay. Production defaults ~350–700ms; tests set 0. */
let demoDelayRangeMs: { min: number; max: number } = { min: 350, max: 700 };

export function setDemoDelayRange(minMs: number, maxMs: number): void {
  demoDelayRangeMs = { min: Math.max(0, minMs), max: Math.max(minMs, maxMs) };
}

export function getDemoDelayRange(): { min: number; max: number } {
  return { ...demoDelayRangeMs };
}

/** Deterministic delay from node id within the configured range. */
export async function demoDelay(seed = "node"): Promise<number> {
  const { min, max } = demoDelayRangeMs;
  if (max <= 0) return 0;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const span = Math.max(0, max - min);
  const ms = min + (span === 0 ? 0 : hash % (span + 1));
  if (ms > 0) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
  return ms;
}

function platformLabel(platform: CreativeBrief["platform"]): string {
  return platform.replaceAll("_", " ");
}

function shotCount(durationSec: number): number {
  if (durationSec <= 15) return 3;
  if (durationSec <= 30) return 4;
  if (durationSec <= 60) return 5;
  return 6;
}

function executeBriefAnalyzer(brief: CreativeBrief): NodeExecutionResult {
  return {
    summary: `Brief analysis for ${brief.product} on ${platformLabel(brief.platform)}.`,
    artifacts: [
      {
        id: "analysis_brief",
        name: "Brief analysis",
        type: "text/markdown",
        content: [
          `## Audience`,
          brief.audience,
          ``,
          `## Platform`,
          platformLabel(brief.platform),
          ``,
          `## Core promise`,
          `${brief.product} delivered with a ${brief.tone} tone in ${brief.durationSec}s (${brief.aspectRatio}).`,
          ``,
          `## Creative constraints`,
          `- Required: ${brief.requiredElements.join("; ") || "none"}`,
          `- Avoid: ${brief.avoidElements.join("; ") || "none"}`,
          `- Visual: ${brief.visualDirection}`,
          ``,
          `## Success criteria`,
          `- Clear hook within the first 3 seconds`,
          `- Product visibly featured`,
          `- CTA: ${brief.callToAction ?? "none specified"}`,
        ].join("\n"),
        simulated: false,
      },
    ],
    decisions: [
      `Prioritize ${brief.aspectRatio} framing for ${platformLabel(brief.platform)}`,
      `Lead with ${brief.tone} energy`,
    ],
    warnings: [],
  };
}

function executeScriptWriter(brief: CreativeBrief): NodeExecutionResult {
  const hookEnd = Math.max(2, Math.round(brief.durationSec * 0.15));
  const bodyEnd = Math.max(hookEnd + 1, Math.round(brief.durationSec * 0.75));
  return {
    summary: `Timed ${brief.durationSec}s script for ${brief.product}.`,
    artifacts: [
      {
        id: "script_main",
        name: "Short-form script",
        type: "text/markdown",
        content: [
          `# Script — ${brief.product}`,
          ``,
          `## Hook (0–${hookEnd}s)`,
          `What if ${brief.product} changed how ${brief.audience.split(" ").slice(0, 4).join(" ")} move?`,
          ``,
          `## Body (${hookEnd}–${bodyEnd}s)`,
          `Show the product in a ${brief.tone} rhythm. Visual direction: ${brief.visualDirection}.`,
          `Hit required beats: ${brief.requiredElements.join(", ") || "product hero"}.`,
          ``,
          `## CTA (${bodyEnd}–${brief.durationSec}s)`,
          brief.callToAction ?? `Discover ${brief.product} now.`,
        ].join("\n"),
        simulated: false,
      },
    ],
    decisions: [`Hook window ${hookEnd}s`, `CTA in final ${brief.durationSec - bodyEnd}s`],
    warnings: [],
  };
}

function executeScenePlanner(brief: CreativeBrief): NodeExecutionResult {
  const shots = shotCount(brief.durationSec);
  const each = Math.round((brief.durationSec / shots) * 10) / 10;
  const lines: string[] = [`# Scene plan — ${brief.product}`, ``];
  for (let i = 1; i <= shots; i += 1) {
    lines.push(`## Shot ${i}`);
    lines.push(`- Duration: ~${each}s`);
    lines.push(
      `- Framing: ${brief.aspectRatio} ${i === 1 ? "hero wide" : i === shots ? "end card" : "detail insert"}`,
    );
    lines.push(
      `- Action: ${i === 1 ? "Open on motion" : i === shots ? "Hold logo + CTA" : `Feature ${brief.product}`}`,
    );
    lines.push(`- Transition: ${i === shots ? "cut to black" : "whip / match cut"}`);
    lines.push(``);
  }
  return {
    summary: `${shots} shots planned for a ${brief.durationSec}s ${brief.tone} cut.`,
    artifacts: [
      {
        id: "scene_plan",
        name: "Scene plan",
        type: "text/markdown",
        content: lines.join("\n"),
        simulated: false,
      },
    ],
    decisions: [`${shots} shots`, `${brief.aspectRatio} framing`],
    warnings: [],
  };
}

function executePromptBuilder(brief: CreativeBrief): NodeExecutionResult {
  const shots = shotCount(brief.durationSec);
  const prompts = Array.from({ length: shots }, (_, i) => {
    const n = i + 1;
    return [
      `### Shot ${n} prompt`,
      `Subject: ${brief.product}`,
      `Style: ${brief.visualDirection}`,
      `Tone: ${brief.tone}`,
      `Aspect: ${brief.aspectRatio}`,
      `Notes: avoid ${brief.avoidElements.join(", ") || "clutter"}`,
    ].join("\n");
  });
  return {
    summary: `${shots} structured visual prompts for ${brief.product}.`,
    artifacts: [
      {
        id: "visual_prompts",
        name: "Visual prompts",
        type: "text/markdown",
        content: `# Prompts\n\n${prompts.join("\n\n")}`,
        simulated: false,
      },
    ],
    decisions: [`One prompt per shot (${shots})`],
    warnings: [],
  };
}

function executeHookVariants(brief: CreativeBrief): NodeExecutionResult {
  const hooks = [
    `Stop scrolling — ${brief.product} just dropped.`,
    `${brief.audience.split(",")[0]?.trim() ?? "Creators"}: this ${brief.tone} cut is for you.`,
    `Three seconds to see why ${brief.product} owns ${platformLabel(brief.platform)}.`,
  ];
  return {
    summary: `Three distinct hooks for ${brief.product}.`,
    artifacts: [
      {
        id: "hooks",
        name: "Hook variants",
        type: "text/markdown",
        content: hooks.map((h, i) => `${i + 1}. ${h}`).join("\n"),
        simulated: false,
      },
    ],
    decisions: hooks.map((h, i) => `Hook ${i + 1}: ${h}`),
    warnings: [],
  };
}

function executeBrandValidator(brief: CreativeBrief): NodeExecutionResult {
  const checks = [
    {
      name: "Required elements",
      status: brief.requiredElements.length > 0 ? "pass" : "warn",
      note:
        brief.requiredElements.length > 0
          ? `Cover: ${brief.requiredElements.join(", ")}`
          : "No required elements listed — confirm with brand.",
    },
    {
      name: "Avoid list",
      status: "pass",
      note: `Do not include: ${brief.avoidElements.join(", ") || "n/a"}`,
    },
    {
      name: "Claims",
      status: brief.avoidElements.some((e) => /medical|guarantee/i.test(e))
        ? "pass"
        : "warn",
      note: "Keep claims factual; no unverified guarantees.",
    },
  ] as const;

  return {
    summary: `Brand checks for ${brief.product}: ${checks.filter((c) => c.status === "pass").length} pass, ${checks.filter((c) => c.status === "warn").length} warn.`,
    artifacts: [
      {
        id: "brand_report",
        name: "Brand validation",
        type: "text/markdown",
        content: checks
          .map((c) => `- [${c.status.toUpperCase()}] ${c.name}: ${c.note}`)
          .join("\n"),
        simulated: false,
      },
    ],
    decisions: checks.map((c) => `${c.status}: ${c.name}`),
    warnings: checks
      .filter((c) => c.status === "warn")
      .map((c) => c.note),
  };
}

function executePlatformAdapter(brief: CreativeBrief): NodeExecutionResult {
  const notes: Record<CreativeBrief["platform"], string> = {
    instagram_reels: "Keep UI safe-zones clear of bottom captions; punchy first frame.",
    youtube_shorts: "Front-load title energy; end screen optional.",
    tiktok: "Native pacing; on-screen text large; trend-aware but on-brand.",
    youtube: "Allow slightly longer setup; clearer mid-roll CTA.",
    web: "Square/landscape flexibility; slower paced hero.",
    multi_platform: "Master in 9:16 then crop-safe center for secondary cuts.",
  };
  return {
    summary: `Platform notes for ${platformLabel(brief.platform)}.`,
    artifacts: [
      {
        id: "platform_notes",
        name: "Platform adapter",
        type: "text/markdown",
        content: [
          `# ${platformLabel(brief.platform)}`,
          `- Aspect: ${brief.aspectRatio}`,
          `- Safe-zone: keep logos away from bottom 20%`,
          `- Caption: ${brief.callToAction ?? brief.objective}`,
          `- Pacing: ${brief.durationSec}s ${brief.tone}`,
          `- Note: ${notes[brief.platform]}`,
        ].join("\n"),
        simulated: false,
      },
    ],
    decisions: [`Target ${brief.platform}`, `Caption length tuned for ${brief.durationSec}s`],
    warnings: [],
  };
}

function executeSimulatedMedia(
  kind: WorkflowNodeKind,
  brief: CreativeBrief,
): NodeExecutionResult {
  const label =
    kind === "image_generator"
      ? "Image"
      : kind === "video_generator"
        ? "Video"
        : kind === "voiceover"
          ? "Voice-over"
          : "Music";
  return {
    summary: `${label} placeholder for ${brief.product} (${brief.tone}, ${brief.aspectRatio}).`,
    artifacts: [
      {
        id: `${kind}_sim`,
        name: `${label} (simulated)`,
        type: "text/plain",
        content: `Simulated ${label.toLowerCase()} asset for “${brief.product}” — ${brief.visualDirection}`,
        simulated: true,
      },
    ],
    decisions: [`Mark ${label.toLowerCase()} as provider-dependent`],
    warnings: [
      "A generation provider is not connected. This artifact is simulated for demo purposes.",
      "Workflow logic completed; connect a generation provider to render this asset.",
    ],
  };
}

function executeBriefInput(brief: CreativeBrief): NodeExecutionResult {
  return {
    summary: `Brief loaded for ${brief.product}.`,
    artifacts: [
      {
        id: "brief_snapshot",
        name: "Creative brief",
        type: "application/json",
        content: JSON.stringify(brief, null, 2),
        simulated: false,
      },
    ],
    decisions: ["Use brief as source of truth for downstream nodes"],
    warnings: [],
  };
}

function executeOutput(
  brief: CreativeBrief,
  upstream: UpstreamOutputs,
): NodeExecutionResult {
  const artifacts = Object.values(upstream).flatMap((o) => o?.artifacts ?? []);
  const ready = artifacts.filter((a) => !a.simulated);
  const simulated = artifacts.filter((a) => a.simulated);
  return {
    summary: `Package for ${brief.product}: ${ready.length} ready, ${simulated.length} provider-dependent.`,
    artifacts: [
      {
        id: "output_manifest",
        name: "Output manifest",
        type: "text/markdown",
        content: [
          `# Output — ${brief.product}`,
          ``,
          `## Ready assets`,
          ready.length ? ready.map((a) => `- ${a.name}`).join("\n") : "- None yet",
          ``,
          `## Provider-dependent`,
          simulated.length
            ? simulated.map((a) => `- ${a.name} (simulated)`).join("\n")
            : "- None",
        ].join("\n"),
        simulated: false,
      },
    ],
    decisions: [
      `Ready count: ${ready.length}`,
      `Simulated count: ${simulated.length}`,
    ],
    warnings:
      simulated.length > 0
        ? ["Some assets remain simulated until a generation provider is connected."]
        : [],
  };
}

function executeSubtitle(brief: CreativeBrief): NodeExecutionResult {
  return {
    summary: `Caption track drafted for ${brief.durationSec}s ${brief.product} cut.`,
    artifacts: [
      {
        id: "captions",
        name: "Subtitle draft",
        type: "text/vtt",
        content: [
          "WEBVTT",
          "",
          "00:00.000 --> 00:03.000",
          `${brief.product} — ${brief.tone}`,
          "",
          `00:03.000 --> 00:${String(Math.min(9, brief.durationSec)).padStart(2, "0")}.000`,
          brief.objective.slice(0, 80),
          "",
          `00:${String(Math.max(4, brief.durationSec - 4)).padStart(2, "0")}.000 --> 00:${String(brief.durationSec).padStart(2, "0")}.000`,
          brief.callToAction ?? `Learn more about ${brief.product}`,
        ].join("\n"),
        simulated: false,
      },
    ],
    decisions: ["Burned-in captions for silent viewing"],
    warnings: [],
  };
}

/**
 * Execute a single workflow node with the demo engine.
 */
export async function executeDemoNode(params: {
  node: WorkflowNode;
  brief: CreativeBrief;
  upstreamOutputs?: UpstreamOutputs;
  skipDelay?: boolean;
}): Promise<NodeExecutionResult> {
  const { node, brief, upstreamOutputs = {}, skipDelay = false } = params;
  if (!skipDelay) {
    await demoDelay(node.id);
  }

  switch (node.kind) {
    case "brief_input":
      return executeBriefInput(brief);
    case "brief_analyzer":
      return executeBriefAnalyzer(brief);
    case "script_writer":
      return executeScriptWriter(brief);
    case "scene_planner":
      return executeScenePlanner(brief);
    case "prompt_builder":
      return executePromptBuilder(brief);
    case "hook_variants":
      return executeHookVariants(brief);
    case "brand_validator":
      return executeBrandValidator(brief);
    case "platform_adapter":
      return executePlatformAdapter(brief);
    case "subtitle":
      return executeSubtitle(brief);
    case "image_generator":
    case "video_generator":
    case "voiceover":
    case "music":
      return executeSimulatedMedia(node.kind, brief);
    case "output":
      return executeOutput(brief, upstreamOutputs);
    default: {
      const _exhaustive: never = node.kind;
      return {
        summary: `No demo executor for ${String(_exhaustive)}`,
        artifacts: [],
        decisions: [],
        warnings: ["Unsupported node kind in demo executor"],
      };
    }
  }
}
