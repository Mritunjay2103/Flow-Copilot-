import { describe, expect, it, vi } from "vitest";
import {
  describeAiMode,
  parseConfiguredAiMode,
  resolveActiveAiMode,
} from "@/lib/ai-mode";

describe("ai-mode", () => {
  it("parses known modes and defaults unknown values to auto", () => {
    expect(parseConfiguredAiMode("demo")).toBe("demo");
    expect(parseConfiguredAiMode("OLLAMA")).toBe("ollama");
    expect(parseConfiguredAiMode("auto")).toBe("auto");
    expect(parseConfiguredAiMode(undefined)).toBe("auto");
    expect(parseConfiguredAiMode("unexpected")).toBe("auto");
  });

  it("always resolves demo to demo without probing", async () => {
    const probe = vi.fn(async () => true);
    await expect(resolveActiveAiMode("demo", probe)).resolves.toBe("demo");
    expect(probe).not.toHaveBeenCalled();
  });

  it("requires Ollama when configured as ollama", async () => {
    await expect(
      resolveActiveAiMode("ollama", async () => true),
    ).resolves.toBe("ollama");
    await expect(
      resolveActiveAiMode("ollama", async () => false),
    ).resolves.toBeNull();
  });

  it("falls back to demo in auto mode when Ollama is unreachable", async () => {
    await expect(
      resolveActiveAiMode("auto", async () => false),
    ).resolves.toBe("demo");
    await expect(
      resolveActiveAiMode("auto", async () => true),
    ).resolves.toBe("ollama");
  });

  it("describes modes for documentation surfaces", () => {
    expect(describeAiMode("demo")).toMatch(/demo engine/i);
    expect(describeAiMode("ollama")).toMatch(/Ollama/i);
    expect(describeAiMode("auto")).toMatch(/falls back/i);
  });
});
