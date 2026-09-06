import { z } from "zod";

/** Conservative node/edge/workflow identifiers: letter start, then alnum/_/-. */
export const WorkflowIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/, "Identifier must match [a-zA-Z][a-zA-Z0-9_-]*");

export const WorkflowNodeKindSchema = z.enum([
  "brief_input",
  "brief_analyzer",
  "script_writer",
  "scene_planner",
  "prompt_builder",
  "image_generator",
  "video_generator",
  "voiceover",
  "music",
  "subtitle",
  "hook_variants",
  "brand_validator",
  "platform_adapter",
  "output",
]);

export const NodeModelClassSchema = z.enum([
  "input",
  "text",
  "image",
  "video",
  "audio",
  "utility",
  "output",
]);

export const NodeRunStatusSchema = z.enum([
  "idle",
  "queued",
  "running",
  "completed",
  "failed",
  "needs_provider",
  "skipped",
]);

export const PlatformSchema = z.enum([
  "instagram_reels",
  "youtube_shorts",
  "tiktok",
  "youtube",
  "web",
  "multi_platform",
]);

export const AspectRatioSchema = z.enum(["9:16", "16:9", "1:1", "4:5"]);

export const SettingEntrySchema = z.object({
  key: z.string().min(1).max(64),
  value: z.string().max(2000),
});

export const NodePositionSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

export const NodeConfigSchema = z.object({
  modelClass: NodeModelClassSchema,
  instruction: z.string().max(2000),
  enabled: z.boolean(),
  settings: z.array(SettingEntrySchema).max(50),
});

export const ExecutionArtifactSchema = z.object({
  id: WorkflowIdSchema,
  name: z.string().min(1).max(120),
  type: z.string().min(1).max(64),
  content: z.string().max(50_000),
  simulated: z.boolean(),
});

export const NodeExecutionResultSchema = z.object({
  summary: z.string().max(4000),
  artifacts: z.array(ExecutionArtifactSchema).max(50),
  decisions: z.array(z.string().max(500)).max(50),
  warnings: z.array(z.string().max(500)).max(50),
});

export const NodeRuntimeSchema = z.object({
  status: NodeRunStatusSchema,
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  durationMs: z.number().finite().nonnegative().optional(),
  error: z.string().max(2000).optional(),
  output: NodeExecutionResultSchema.optional(),
});

export const WorkflowNodeSchema = z.object({
  id: WorkflowIdSchema,
  kind: WorkflowNodeKindSchema,
  label: z.string().min(1).max(60),
  description: z.string().max(240),
  position: NodePositionSchema,
  config: NodeConfigSchema,
  runtime: NodeRuntimeSchema,
  locked: z.boolean(),
});

export const WorkflowEdgeSchema = z.object({
  id: WorkflowIdSchema,
  source: WorkflowIdSchema,
  target: WorkflowIdSchema,
  label: z.string().max(60).optional(),
  animated: z.boolean(),
});

export const CreativeBriefSchema = z.object({
  objective: z.string().min(1).max(500),
  audience: z.string().min(1).max(300),
  platform: PlatformSchema,
  durationSec: z.number().int().min(5).max(300),
  aspectRatio: AspectRatioSchema,
  tone: z.string().min(1).max(120),
  product: z.string().min(1).max(200),
  visualDirection: z.string().min(1).max(500),
  requiredElements: z.array(z.string().min(1).max(120)).max(30),
  avoidElements: z.array(z.string().min(1).max(120)).max(30),
  callToAction: z.string().max(200).optional(),
});

export const WorkflowSchema = z.object({
  schemaVersion: z.literal(1),
  id: WorkflowIdSchema,
  title: z.string().min(1).max(120),
  objective: z.string().min(1).max(500),
  brief: CreativeBriefSchema,
  nodes: z.array(WorkflowNodeSchema).max(80),
  edges: z.array(WorkflowEdgeSchema).max(160),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  version: z.number().int().positive(),
  mode: z.enum(["demo", "ollama"]),
});

export const GraphEditOperationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("add_node"),
    reason: z.string().min(1).max(240),
    node: WorkflowNodeSchema,
  }),
  z.object({
    type: z.literal("update_node"),
    reason: z.string().min(1).max(240),
    nodeId: WorkflowIdSchema,
    patch: z
      .object({
        label: z.string().min(1).max(60).optional(),
        description: z.string().max(240).optional(),
        position: NodePositionSchema.optional(),
        config: NodeConfigSchema.partial().optional(),
        locked: z.boolean().optional(),
      })
      .strict(),
  }),
  z.object({
    type: z.literal("remove_node"),
    reason: z.string().min(1).max(240),
    nodeId: WorkflowIdSchema,
  }),
  z.object({
    type: z.literal("add_edge"),
    reason: z.string().min(1).max(240),
    edge: WorkflowEdgeSchema,
  }),
  z.object({
    type: z.literal("remove_edge"),
    reason: z.string().min(1).max(240),
    edgeId: WorkflowIdSchema,
  }),
  z.object({
    type: z.literal("replace_edge"),
    reason: z.string().min(1).max(240),
    edgeId: WorkflowIdSchema,
    edge: WorkflowEdgeSchema,
  }),
  z.object({
    type: z.literal("update_workflow_metadata"),
    reason: z.string().min(1).max(240),
    patch: z
      .object({
        title: z.string().min(1).max(120).optional(),
        objective: z.string().min(1).max(500).optional(),
        brief: CreativeBriefSchema.partial().optional(),
      })
      .strict(),
  }),
]);

export const AgentEditResponseSchema = z.object({
  assistantMessage: z.string().min(1).max(4000),
  intentSummary: z.string().min(1).max(500),
  operations: z.array(GraphEditOperationSchema).max(40),
});

export type WorkflowNodeKind = z.infer<typeof WorkflowNodeKindSchema>;
export type NodeModelClass = z.infer<typeof NodeModelClassSchema>;
export type NodeRunStatus = z.infer<typeof NodeRunStatusSchema>;
export type Platform = z.infer<typeof PlatformSchema>;
export type AspectRatio = z.infer<typeof AspectRatioSchema>;
export type SettingEntry = z.infer<typeof SettingEntrySchema>;
export type NodeConfig = z.infer<typeof NodeConfigSchema>;
export type NodeRuntime = z.infer<typeof NodeRuntimeSchema>;
export type WorkflowNode = z.infer<typeof WorkflowNodeSchema>;
export type WorkflowEdge = z.infer<typeof WorkflowEdgeSchema>;
export type CreativeBrief = z.infer<typeof CreativeBriefSchema>;
export type Workflow = z.infer<typeof WorkflowSchema>;
export type ExecutionArtifact = z.infer<typeof ExecutionArtifactSchema>;
export type NodeExecutionResult = z.infer<typeof NodeExecutionResultSchema>;
export type GraphEditOperation = z.infer<typeof GraphEditOperationSchema>;
export type AgentEditResponse = z.infer<typeof AgentEditResponseSchema>;

export function isInputNode(node: WorkflowNode): boolean {
  return node.kind === "brief_input" || node.config.modelClass === "input";
}

export function isOutputNode(node: WorkflowNode): boolean {
  return node.kind === "output" || node.config.modelClass === "output";
}

/** Default idle runtime for newly created nodes. */
export function createIdleRuntime(): NodeRuntime {
  return { status: "idle" };
}
