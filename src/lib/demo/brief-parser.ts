import type { CreativeBrief, WorkflowNodeKind } from "@/lib/workflow";

/** Normalized corpus from a brief for deterministic keyword detection. */
export function briefCorpus(brief: CreativeBrief): string {
  return [
    brief.objective,
    brief.audience,
    brief.tone,
    brief.product,
    brief.visualDirection,
    brief.callToAction ?? "",
    ...brief.requiredElements,
    ...brief.avoidElements,
    brief.platform,
  ]
    .join(" ")
    .toLowerCase();
}

export function mentionsHooks(text: string): boolean {
  const t = text.toLowerCase();
  return (
    /\bhooks?\b/.test(t) ||
    /\bvariants?\b/.test(t) ||
    /\ba\s*\/\s*b\b/.test(t) ||
    /\bab\s*test/.test(t) ||
    /\bmultiple openings?\b/.test(t) ||
    /\bopening hooks?\b/.test(t)
  );
}

export function mentionsVoiceover(text: string): boolean {
  const t = text.toLowerCase();
  return (
    /\bnarration\b/.test(t) ||
    /\bvoice[\s-]?overs?\b/.test(t) ||
    /\bvoiceover\b/.test(t)
  );
}

export function mentionsSubtitles(text: string): boolean {
  const t = text.toLowerCase();
  return (
    /\bsubtitles?\b/.test(t) ||
    /\bcaptions?\b/.test(t) ||
    /\bsilent viewing\b/.test(t) ||
    /\bsilent\b/.test(t)
  );
}

export function mentionsMusic(text: string): boolean {
  const t = text.toLowerCase();
  return /\bmusic\b/.test(t) || /\bsoundtrack\b/.test(t) || /\bscore\b/.test(t);
}

export function wantsPlatformAdapter(brief: CreativeBrief): boolean {
  if (brief.platform === "multi_platform") return true;
  const corpus = briefCorpus(brief);
  return (
    /\bmulti[\s-]?platform\b/.test(corpus) ||
    /\bcross[\s-]?platform\b/.test(corpus) ||
    /\bmultiple (destinations?|platforms?)\b/.test(corpus)
  );
}

/** Short-form / video-oriented campaigns get media generator placeholders. */
export function isVideoCampaign(brief: CreativeBrief): boolean {
  if (
    brief.platform === "instagram_reels" ||
    brief.platform === "youtube_shorts" ||
    brief.platform === "tiktok" ||
    brief.platform === "youtube" ||
    brief.platform === "multi_platform"
  ) {
    return true;
  }
  const corpus = briefCorpus(brief);
  return /\bvideo\b/.test(corpus) || /\bfilm\b/.test(corpus) || /\breel\b/.test(corpus);
}

export type FeatureFlags = {
  hooks: boolean;
  voiceover: boolean;
  subtitle: boolean;
  music: boolean;
  platformAdapter: boolean;
  mediaGenerators: boolean;
};

export function detectBriefFeatures(brief: CreativeBrief): FeatureFlags {
  const corpus = briefCorpus(brief);
  return {
    hooks: mentionsHooks(corpus),
    voiceover: mentionsVoiceover(corpus),
    subtitle: mentionsSubtitles(corpus),
    music: mentionsMusic(corpus),
    platformAdapter: wantsPlatformAdapter(brief),
    mediaGenerators: isVideoCampaign(brief),
  };
}

export const KIND_LABELS: Record<WorkflowNodeKind, string> = {
  brief_input: "Brief",
  brief_analyzer: "Analyze brief",
  script_writer: "Script",
  scene_planner: "Scene plan",
  prompt_builder: "Prompt builder",
  image_generator: "Image generation",
  video_generator: "Video generation",
  voiceover: "Voice-over",
  music: "Music",
  subtitle: "Subtitles",
  hook_variants: "Hook variants",
  brand_validator: "Brand check",
  platform_adapter: "Platform adapter",
  output: "Output",
};

export function truncateTitle(product: string, objective: string, max = 80): string {
  const productPart = product.trim().slice(0, 40);
  const objectivePart = objective.trim().slice(0, max - productPart.length - 3);
  const title = `${productPart}: ${objectivePart}`.trim();
  return title.length > max ? `${title.slice(0, max - 1)}…` : title;
}
