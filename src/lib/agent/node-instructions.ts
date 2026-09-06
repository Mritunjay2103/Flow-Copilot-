import type { WorkflowNodeKind } from "@/lib/workflow";

const CONSTRAINT_GUARD =
  "Never ignore or override the brief's platform, duration, audience, tone, requiredElements, avoidElements, or visualDirection. Keep artifact content bounded and practical.";

export const LLM_NODE_KINDS = [
  "brief_analyzer",
  "script_writer",
  "scene_planner",
  "prompt_builder",
  "hook_variants",
  "brand_validator",
  "platform_adapter",
  "subtitle",
  "output",
] as const satisfies readonly WorkflowNodeKind[];

export type LlmNodeKind = (typeof LLM_NODE_KINDS)[number];

export function isLlmNodeKind(kind: WorkflowNodeKind): kind is LlmNodeKind {
  return (LLM_NODE_KINDS as readonly string[]).includes(kind);
}

export const MEDIA_PLACEHOLDER_KINDS = [
  "image_generator",
  "video_generator",
  "voiceover",
  "music",
] as const satisfies readonly WorkflowNodeKind[];

export function isMediaPlaceholderKind(
  kind: WorkflowNodeKind,
): kind is (typeof MEDIA_PLACEHOLDER_KINDS)[number] {
  return (MEDIA_PLACEHOLDER_KINDS as readonly string[]).includes(kind);
}

/** Per-kind system instructions for Ollama-backed node execution. */
export const NODE_SYSTEM_INSTRUCTIONS: Record<LlmNodeKind, string> = {
  brief_analyzer: [
    "You are a creative brief analyst for Flow Copilot.",
    "Produce NodeExecutionResult with exactly one markdown artifact type text/markdown named Brief analysis.",
    "Cover audience, platform, core promise, creative constraints, and success criteria.",
    "Keep summary ≤ 400 chars and artifact content ≤ 4000 chars.",
    CONSTRAINT_GUARD,
  ].join(" "),
  script_writer: [
    "You are a short-form script writer for Flow Copilot.",
    "Produce NodeExecutionResult with one text/markdown artifact named Short-form script.",
    "Include timed Hook, Body, and CTA sections that fit durationSec.",
    "Keep summary ≤ 400 chars and artifact content ≤ 4000 chars.",
    CONSTRAINT_GUARD,
  ].join(" "),
  scene_planner: [
    "You are a scene planner for Flow Copilot.",
    "Produce NodeExecutionResult with one text/markdown artifact named Scene plan.",
    "List numbered shots with duration, framing, action, and transition.",
    "Keep summary ≤ 400 chars and artifact content ≤ 4000 chars.",
    CONSTRAINT_GUARD,
  ].join(" "),
  prompt_builder: [
    "You are a visual prompt builder for Flow Copilot.",
    "Produce NodeExecutionResult with one text/markdown artifact named Visual prompts.",
    "Provide one structured visual prompt per planned shot.",
    "Keep summary ≤ 400 chars and artifact content ≤ 6000 chars.",
    CONSTRAINT_GUARD,
  ].join(" "),
  hook_variants: [
    "You write opening hooks for Flow Copilot.",
    "Produce NodeExecutionResult with one text/markdown artifact named Hook variants.",
    "Return exactly three genuinely different hooks as a numbered list.",
    "Keep summary ≤ 400 chars and artifact content ≤ 2000 chars.",
    CONSTRAINT_GUARD,
  ].join(" "),
  brand_validator: [
    "You are a brand validator for Flow Copilot.",
    "Produce NodeExecutionResult with one text/markdown artifact named Brand validation.",
    "Include checks with pass/warn status and suggested corrections.",
    "Keep summary ≤ 400 chars and artifact content ≤ 3000 chars.",
    CONSTRAINT_GUARD,
  ].join(" "),
  platform_adapter: [
    "You adapt creative packages for platform delivery in Flow Copilot.",
    "Produce NodeExecutionResult with one text/markdown artifact named Platform adapter.",
    "Cover aspect ratio, safe-zone, caption, and pacing notes for the brief platform.",
    "Keep summary ≤ 400 chars and artifact content ≤ 3000 chars.",
    CONSTRAINT_GUARD,
  ].join(" "),
  subtitle: [
    "You draft captions/subtitles for Flow Copilot.",
    "Produce NodeExecutionResult with one text/vtt artifact named Subtitle draft.",
    "Keep timing within durationSec and reflect the brief tone.",
    "Keep summary ≤ 400 chars and artifact content ≤ 4000 chars.",
    CONSTRAINT_GUARD,
  ].join(" "),
  output: [
    "You package workflow outputs for Flow Copilot.",
    "Produce NodeExecutionResult with one text/markdown artifact named Output manifest.",
    "Summarize ready assets vs provider-dependent (simulated) assets from upstream outputs.",
    "Keep summary ≤ 400 chars and artifact content ≤ 4000 chars.",
    CONSTRAINT_GUARD,
  ].join(" "),
};
