import type { CreativeBrief } from "@/lib/workflow";

export type SampleBriefDefinition = {
  id: string;
  title: string;
  summary: string;
  brief: CreativeBrief;
};

/** Exact sample briefs from the product prompt pack. */
export const SAMPLE_BRIEFS: SampleBriefDefinition[] = [
  {
    id: "sneaker-launch",
    title: "Sneaker launch",
    summary: "Pulse X1 — 20s Reels with hooks, VO, and subtitles",
    brief: {
      product: "Pulse X1 running shoe",
      objective:
        "Launch a lightweight city-running shoe with a scroll-stopping opening",
      audience: "Urban runners aged 18–30",
      platform: "instagram_reels",
      durationSec: 20,
      aspectRatio: "9:16",
      tone: "Energetic, premium, kinetic",
      visualDirection:
        "Night city, red and black palette, sharp macro details, rapid match cuts",
      requiredElements: [
        "three opening-hook variants",
        "voice-over",
        "subtitles",
        "brand consistency check",
      ],
      avoidElements: ["generic gym imagery", "distorted product logos"],
      callToAction: "Own the night",
    },
  },
  {
    id: "coffee-story",
    title: "Coffee product story",
    summary: "Warm 30s multi-platform launch with narration and music",
    brief: {
      product: "Harbor Roast coffee",
      objective:
        "Build a warm 30-second multi-platform launch with narration, music, and platform adaptations",
      audience: "Specialty coffee drinkers and weekend hosts",
      platform: "multi_platform",
      durationSec: 30,
      aspectRatio: "9:16",
      tone: "Warm, inviting, craft-forward",
      visualDirection:
        "Morning light through steam, ceramic pour, slow close-ups of beans and crema",
      requiredElements: ["narration", "music", "platform adaptations"],
      avoidElements: ["cold corporate office footage"],
      callToAction: "Brew the morning ritual",
    },
  },
  {
    id: "app-explainer",
    title: "App explainer",
    summary: "Clean 15s vertical demo with captions — no voice-over",
    brief: {
      product: "FlowNote mobile app",
      objective:
        "Build a clean 15-second vertical product demo with captions and no voice-over",
      audience: "Busy professionals discovering a new notes app",
      platform: "youtube_shorts",
      durationSec: 15,
      aspectRatio: "9:16",
      tone: "Clean, confident, minimal",
      visualDirection:
        "Bright UI captures, soft gradients, crisp finger taps, silent-friendly captions",
      requiredElements: ["captions", "product UI demo"],
      avoidElements: ["voice-over", "narration"],
      callToAction: "Try FlowNote free",
    },
  },
];

export function createDefaultBriefDraft(): CreativeBrief {
  return {
    product: "",
    objective: "",
    audience: "",
    platform: "instagram_reels",
    durationSec: 20,
    aspectRatio: "9:16",
    tone: "",
    visualDirection: "",
    requiredElements: [],
    avoidElements: [],
    callToAction: "",
  };
}
