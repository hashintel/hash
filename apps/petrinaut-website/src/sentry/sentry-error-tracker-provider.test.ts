import { describe, expect, test, vi } from "vitest";

import { createErrorTracker } from "./sentry-error-tracker-provider";

const SENTINEL = "SENTINEL-conversation-content";

const createSinks = () => ({
  captureException: vi.fn(),
  consoleError: vi.fn(),
});

describe("createErrorTracker", () => {
  test("development prints the original error, its source and tags to the console", () => {
    const sinks = createSinks();
    const tracker = createErrorTracker("development", sinks);
    const error = new Error(`failed: ${SENTINEL}`);
    tracker.captureException(error, {
      source: "brunch.server-tool",
      tags: { toolCallId: "call-1", hidden: true },
    });
    expect(sinks.consoleError).toHaveBeenCalledWith(
      "[petrinaut] brunch.server-tool failed",
      error,
      { toolCallId: "call-1", hidden: true },
    );
    expect(sinks.captureException).not.toHaveBeenCalled();
  });

  test("production forwards a classified error and tags to Sentry, never the message", () => {
    const sinks = createSinks();
    const tracker = createErrorTracker("production", sinks);
    const error = Object.assign(new Error(`failed: ${SENTINEL}`), {
      code: "ECONNRESET",
    });
    tracker.captureException(error, {
      source: "ai-assistant.stream",
      tags: { toolCallId: "call-1" },
    });
    expect(sinks.consoleError).not.toHaveBeenCalled();
    expect(sinks.captureException).toHaveBeenCalledOnce();
    const [forwarded, hint] = sinks.captureException.mock.calls[0] as [
      Error,
      { tags: Record<string, unknown> },
    ];
    expect(forwarded).toBeInstanceOf(Error);
    expect(forwarded.message).toBe("ai-assistant.stream: ECONNRESET");
    expect(hint.tags).toEqual({
      toolCallId: "call-1",
      source: "ai-assistant.stream",
      "error.type": "ECONNRESET",
    });
    expect(JSON.stringify([forwarded.message, hint])).not.toContain(SENTINEL);
  });

  test("production classifies non-Error values by type", () => {
    const sinks = createSinks();
    createErrorTracker("production", sinks).captureException(SENTINEL);
    const [forwarded] = sinks.captureException.mock.calls[0] as [Error];
    expect(forwarded.message).toBe("petrinaut: string");
  });

  test("tests stay silent", () => {
    const sinks = createSinks();
    createErrorTracker("test", sinks).captureException(new Error("quiet"));
    expect(sinks.consoleError).not.toHaveBeenCalled();
    expect(sinks.captureException).not.toHaveBeenCalled();
  });
});
