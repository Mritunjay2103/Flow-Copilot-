import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyGraphOperations,
  createMinimalValidWorkflow,
  createSneakerLaunchBrief,
  validateWorkflowGraph,
  type CreativeBrief,
} from "@/lib/workflow";
import {
  detectBriefFeatures,
  editWorkflowWithDemo,
  executeDemoNode,
  planWorkflowFromBrief,
  setDemoDelayRange,
} from "./index";

const FIXED_NOW = "2026-09-06T12:00:00.000Z";

function teaBrief(overrides?: Partial<CreativeBrief>): CreativeBrief {
  return {
    objective: "Promote a calming evening tea ritual for web visitors",
    audience: "Busy professionals seeking a wind-down ritual",
    platform: "web",
    durationSec: 20,
    aspectRatio: "1:1",
    tone: "calm",
    product: "Moonleaf Evening Tea",
    visualDirection: "Soft daylight, ceramic cup steam, quiet kitchen",
    requiredElements: ["product pack", "steam close-up"],
    avoidElements: ["energy drink vibes"],
    callToAction: "Brew tonight",
    ...overrides,
  };
}

beforeEach(() => {
  setDemoDelayRange(0, 0);
});

afterEach(() => {
  setDemoDelayRange(350, 700);
});

describe("demo planner", () => {
  it("always includes the core node set and returns a valid DAG", () => {
    const wf = planWorkflowFromBrief(createSneakerLaunchBrief(), {
      now: FIXED_NOW,
    });
    const kinds = new Set(wf.nodes.map((n) => n.kind));
    for (const required of [
      "brief_input",
      "brief_analyzer",
      "script_writer",
      "scene_planner",
      "prompt_builder",
      "brand_validator",
      "output",
    ] as const) {
      expect(kinds.has(required)).toBe(true);
    }
    expect(validateWorkflowGraph(wf)).toEqual({ ok: true });
    expect(wf.title).toContain("HexPulse");
  });

  it("is deterministic for the same brief", () => {
    const brief = createSneakerLaunchBrief();
    const a = planWorkflowFromBrief(brief, { now: FIXED_NOW });
    const b = planWorkflowFromBrief(brief, { now: FIXED_NOW });
    expect(a).toEqual(b);
  });

  it("varies optional nodes from brief features", () => {
    const withHooks = planWorkflowFromBrief(createSneakerLaunchBrief(), {
      now: FIXED_NOW,
    });
    expect(withHooks.nodes.some((n) => n.kind === "hook_variants")).toBe(true);
    expect(withHooks.nodes.some((n) => n.kind === "image_generator")).toBe(true);
    expect(withHooks.nodes.some((n) => n.kind === "video_generator")).toBe(true);

    const withExtras = planWorkflowFromBrief(
      teaBrief({
        platform: "multi_platform",
        requiredElements: ["voice-over", "captions", "music", "hooks"],
        visualDirection: "Narration over soft steam with soundtrack",
      }),
      { now: FIXED_NOW },
    );
    const kinds = new Set(withExtras.nodes.map((n) => n.kind));
    expect(kinds.has("voiceover")).toBe(true);
    expect(kinds.has("subtitle")).toBe(true);
    expect(kinds.has("music")).toBe(true);
    expect(kinds.has("platform_adapter")).toBe(true);
    expect(validateWorkflowGraph(withExtras)).toEqual({ ok: true });

    const plainWeb = planWorkflowFromBrief(teaBrief(), { now: FIXED_NOW });
    expect(plainWeb.nodes.some((n) => n.kind === "image_generator")).toBe(false);
    expect(detectBriefFeatures(teaBrief()).mediaGenerators).toBe(false);
  });

  it("places at most three nodes per column", () => {
    const wf = planWorkflowFromBrief(
      teaBrief({
        platform: "tiktok",
        requiredElements: ["hooks", "voice-over", "captions", "music"],
      }),
      { now: FIXED_NOW },
    );
    const byColumn = new Map<number, number>();
    for (const node of wf.nodes) {
      const col = node.position.x;
      byColumn.set(col, (byColumn.get(col) ?? 0) + 1);
    }
    for (const count of byColumn.values()) {
      expect(count).toBeLessThanOrEqual(3);
    }
  });
});

describe("demo editor", () => {
  const phrases: Array<{ command: string; expectOps: boolean; note: string }> = [
    { command: "add captions", expectOps: true, note: "add captions" },
    { command: "add a brand check", expectOps: true, note: "add brand on minimal" },
    { command: "remove narration", expectOps: false, note: "no narration on minimal" },
    { command: "make it 16:9", expectOps: true, note: "aspect" },
    { command: "make it cinematic", expectOps: true, note: "tone" },
    { command: "create three opening hooks", expectOps: true, note: "hooks" },
    { command: "add music", expectOps: true, note: "music" },
    { command: "add platform output", expectOps: true, note: "platform" },
    { command: "set duration to 45", expectOps: true, note: "duration" },
    { command: "switch platform to tiktok", expectOps: true, note: "platform switch" },
    { command: "add image generation", expectOps: true, note: "image" },
    { command: "add video generation", expectOps: true, note: "video" },
    { command: "delete everything", expectOps: false, note: "ambiguous" },
    { command: "paint the office blue", expectOps: false, note: "unsupported" },
  ];

  it("handles at least twelve edit phrasings", () => {
    expect(phrases.length).toBeGreaterThanOrEqual(12);
    const base = createMinimalValidWorkflow();

    for (const phrase of phrases) {
      const edit = editWorkflowWithDemo(base, phrase.command);
      expect(edit.operations.length > 0, phrase.note).toBe(phrase.expectOps);
      if (edit.operations.length === 0) {
        expect(edit.assistantMessage.toLowerCase()).toMatch(
          /no changes were made|ambiguous|could not map|try one of|need a command/,
        );
      } else {
        const next = applyGraphOperations(base, edit.operations);
        expect(validateWorkflowGraph(next)).toEqual({ ok: true });
        expect(next.version).toBe(base.version + 1);
      }
    }
  });

  it("replaces voice-over with subtitles via operations", () => {
    const planned = planWorkflowFromBrief(
      teaBrief({
        platform: "instagram_reels",
        requiredElements: ["voice-over"],
        visualDirection: "Narration over city lights",
      }),
      { now: FIXED_NOW },
    );
    expect(planned.nodes.some((n) => n.kind === "voiceover")).toBe(true);

    const edit = editWorkflowWithDemo(
      planned,
      "replace voice-over with subtitles",
    );
    expect(edit.operations.length).toBeGreaterThan(0);
    const next = applyGraphOperations(planned, edit.operations);
    expect(next.nodes.some((n) => n.kind === "voiceover")).toBe(false);
    expect(next.nodes.some((n) => n.kind === "subtitle")).toBe(true);
    expect(validateWorkflowGraph(next)).toEqual({ ok: true });
  });

  it("moves existing hook variants before the script when asked", () => {
    const planned = planWorkflowFromBrief(createSneakerLaunchBrief(), {
      now: FIXED_NOW,
    });
    expect(planned.nodes.some((n) => n.kind === "hook_variants")).toBe(true);
    const script = planned.nodes.find((n) => n.kind === "script_writer");
    expect(script).toBeTruthy();
    const before = planned.edges.find((e) => e.target === script!.id);
    expect(before?.source).not.toBe("hook_variants");

    const edit = editWorkflowWithDemo(
      planned,
      "Add three hook variants before the script.",
    );
    expect(edit.operations.length).toBeGreaterThan(0);
    const next = applyGraphOperations(planned, edit.operations);
    expect(validateWorkflowGraph(next)).toEqual({ ok: true });
    const intoScript = next.edges.find((e) => e.target === script!.id);
    expect(intoScript?.source).toBe("hook_variants");
  });

  it("never claims success with zero operations", () => {
    const edit = editWorkflowWithDemo(
      createMinimalValidWorkflow(),
      "do something mysterious",
    );
    expect(edit.operations).toHaveLength(0);
    expect(edit.assistantMessage.toLowerCase()).toContain("no changes were made");
    expect(edit.assistantMessage).toMatch(/add captions|make it 9:16/i);
  });
});

describe("demo executor", () => {
  it("customizes text outputs from brief fields", async () => {
    const sneaker = createSneakerLaunchBrief();
    const tea = teaBrief();
    const sneakerScript = await executeDemoNode({
      node: {
        id: "script_writer",
        kind: "script_writer",
        label: "Script",
        description: "",
        position: { x: 0, y: 0 },
        config: {
          modelClass: "text",
          instruction: "",
          enabled: true,
          settings: [],
        },
        runtime: { status: "idle" },
        locked: false,
      },
      brief: sneaker,
      skipDelay: true,
    });
    const teaScript = await executeDemoNode({
      node: {
        id: "script_writer",
        kind: "script_writer",
        label: "Script",
        description: "",
        position: { x: 0, y: 0 },
        config: {
          modelClass: "text",
          instruction: "",
          enabled: true,
          settings: [],
        },
        runtime: { status: "idle" },
        locked: false,
      },
      brief: tea,
      skipDelay: true,
    });

    expect(sneakerScript.artifacts[0]?.content).toContain("HexPulse");
    expect(teaScript.artifacts[0]?.content).toContain("Moonleaf");
    expect(sneakerScript.artifacts[0]?.content).not.toEqual(
      teaScript.artifacts[0]?.content,
    );
  });

  it("marks media outputs as simulated with honest warnings", async () => {
    const brief = createSneakerLaunchBrief();
    for (const kind of [
      "image_generator",
      "video_generator",
      "voiceover",
      "music",
    ] as const) {
      const result = await executeDemoNode({
        node: {
          id: kind,
          kind,
          label: kind,
          description: "",
          position: { x: 0, y: 0 },
          config: {
            modelClass: kind === "image_generator" ? "image" : kind === "video_generator" ? "video" : "audio",
            instruction: "",
            enabled: true,
            settings: [],
          },
          runtime: { status: "idle" },
          locked: false,
        },
        brief,
        skipDelay: true,
      });
      expect(result.artifacts.every((a) => a.simulated)).toBe(true);
      expect(result.warnings.join(" ")).toMatch(/provider is not connected/i);
    }
  });

  it("returns three distinct hooks and brand check structure", async () => {
    const brief = createSneakerLaunchBrief();
    const hooks = await executeDemoNode({
      node: {
        id: "hook_variants",
        kind: "hook_variants",
        label: "Hooks",
        description: "",
        position: { x: 0, y: 0 },
        config: {
          modelClass: "text",
          instruction: "",
          enabled: true,
          settings: [],
        },
        runtime: { status: "idle" },
        locked: false,
      },
      brief,
      skipDelay: true,
    });
    const lines = hooks.artifacts[0]?.content.split("\n").filter(Boolean) ?? [];
    expect(lines.length).toBe(3);
    expect(new Set(lines).size).toBe(3);

    const brand = await executeDemoNode({
      node: {
        id: "brand_validator",
        kind: "brand_validator",
        label: "Brand",
        description: "",
        position: { x: 0, y: 0 },
        config: {
          modelClass: "utility",
          instruction: "",
          enabled: true,
          settings: [],
        },
        runtime: { status: "idle" },
        locked: false,
      },
      brief,
      skipDelay: true,
    });
    expect(brand.artifacts[0]?.content).toMatch(/PASS|WARN/);
  });
});
