import { Badge, Button, type BadgeTone } from "@/components/ui";
import type { ConnectionStatus } from "@/store/workflow-store";

export function modeBadgeCopy(status: ConnectionStatus): {
  label: string;
  tone: BadgeTone;
  detail: string;
} {
  switch (status) {
    case "ollama":
      return {
        label: "Ollama connected",
        tone: "success",
        detail: "Local Ollama is reachable for planning and edits.",
      };
    case "demo":
      return {
        label: "Demo engine",
        tone: "cyan",
        detail: "No external API is used — responses come from the deterministic demo engine.",
      };
    case "checking":
      return {
        label: "Checking Ollama",
        tone: "warning",
        detail: "Checking connection status…",
      };
    case "unreachable":
      return {
        label: "Ollama unavailable",
        tone: "danger",
        detail:
          "Start Ollama, confirm the configured model is installed, then recheck.",
      };
    default:
      return {
        label: "Checking Ollama",
        tone: "warning",
        detail: "Checking connection status…",
      };
  }
}

export function ModeBadge({
  status,
  onRecheck,
  recheckDisabled,
}: {
  status: ConnectionStatus;
  onRecheck?: () => void;
  recheckDisabled?: boolean;
}) {
  const { label, tone, detail } = modeBadgeCopy(status);
  return (
    <div className="flex min-w-0 max-w-[min(420px,40vw)] flex-col gap-0.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={tone} data-testid="mode-badge">
          <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
          <span>{label}</span>
        </Badge>
        {onRecheck ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-[11px]"
            disabled={recheckDisabled || status === "checking"}
            onClick={onRecheck}
            data-testid="connection-recheck"
            aria-label="Recheck Ollama connection"
          >
            Recheck
          </Button>
        ) : null}
      </div>
      <p
        className="hidden truncate text-[10px] leading-snug text-hf-muted sm:block"
        title={detail}
        data-testid="connection-detail"
      >
        {detail}
      </p>
    </div>
  );
}
