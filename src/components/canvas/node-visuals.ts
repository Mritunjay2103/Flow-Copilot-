import type { NodeModelClass, NodeRunStatus, WorkflowNodeKind } from "@/lib/workflow";
import {
  AlertTriangle,
  AudioLines,
  Captions,
  Clapperboard,
  FileOutput,
  Film,
  GitBranch,
  Image,
  Lock,
  Mic2,
  Music2,
  NotebookPen,
  ScanSearch,
  ScrollText,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

export const KIND_ICONS: Record<WorkflowNodeKind, LucideIcon> = {
  brief_input: NotebookPen,
  brief_analyzer: ScanSearch,
  script_writer: ScrollText,
  scene_planner: Clapperboard,
  prompt_builder: Sparkles,
  image_generator: Image,
  video_generator: Film,
  voiceover: Mic2,
  music: Music2,
  subtitle: Captions,
  hook_variants: GitBranch,
  brand_validator: ShieldCheck,
  platform_adapter: AudioLines,
  output: FileOutput,
};

export const STATUS_META: Record<
  NodeRunStatus,
  { label: string; className: string; ring?: string }
> = {
  idle: { label: "Idle", className: "bg-hf-muted/40 text-hf-muted" },
  queued: {
    label: "Queued",
    className: "border border-dashed border-hf-muted text-hf-muted bg-transparent",
  },
  running: {
    label: "Running",
    className: "bg-hf-violet/20 text-hf-violet",
    ring: "hf-running-ring",
  },
  completed: { label: "Completed", className: "bg-hf-success/20 text-hf-success" },
  failed: { label: "Failed", className: "bg-hf-destructive/20 text-hf-destructive" },
  needs_provider: {
    label: "Needs provider",
    className: "bg-hf-warning/20 text-hf-warning",
  },
  skipped: { label: "Skipped", className: "bg-hf-border text-hf-muted" },
};

export const MODEL_CLASS_LABEL: Record<NodeModelClass, string> = {
  input: "input",
  text: "text",
  image: "image",
  video: "video",
  audio: "audio",
  utility: "utility",
  output: "output",
};

export function formatDuration(ms: number | undefined): string | null {
  if (ms == null || !Number.isFinite(ms)) return null;
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export { AlertTriangle, Lock };
