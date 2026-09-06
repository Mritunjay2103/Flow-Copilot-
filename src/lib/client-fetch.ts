/**
 * Client-side fetch helpers with bounded timeouts.
 * Never used for Ollama — that stays server-only.
 */

export const CLIENT_API_TIMEOUT_MS = 90_000;
export const CLIENT_HEALTH_TIMEOUT_MS = 12_000;

/** Combine an optional parent AbortSignal with a timeout. */
export function signalWithTimeout(
  timeoutMs: number,
  parent?: AbortSignal | null,
): AbortSignal {
  if (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal) {
    const timed = AbortSignal.timeout(timeoutMs);
    if (!parent) return timed;
    if (typeof AbortSignal !== "undefined" && "any" in AbortSignal) {
      return AbortSignal.any([timed, parent]);
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onParentAbort = () => {
    clearTimeout(timer);
    controller.abort();
  };
  if (parent) {
    if (parent.aborted) {
      clearTimeout(timer);
      controller.abort();
    } else {
      parent.addEventListener("abort", onParentAbort, { once: true });
    }
  }
  // Best-effort cleanup when the timed signal is observed elsewhere is not needed;
  // abort is idempotent.
  void timer;
  return controller.signal;
}

/** Strip hostnames/URLs from user-visible error text (defense in depth). */
export function sanitizeClientErrorMessage(message: string): string {
  return message
    .replace(/https?:\/\/[^\s"'<>]+/gi, "[redacted-url]")
    .replace(/\b127\.0\.0\.1(?::\d+)?\b/g, "[redacted-host]")
    .replace(/\blocalhost(?::\d+)?\b/gi, "[redacted-host]")
    .slice(0, 500);
}
