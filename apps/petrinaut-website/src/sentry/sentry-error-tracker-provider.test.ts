import { describe, expect, test, vi } from "vitest";

import {
  createErrorTracker,
  type ErrorTrackerSinks,
  redactEventMessages,
} from "./sentry-error-tracker-provider";

import type { ErrorEvent } from "@sentry/react";

const SENTINEL = "SENTINEL-conversation-content";

const createSinks = () => ({
  captureException: vi.fn<ErrorTrackerSinks["captureException"]>(),
  consoleError: vi.fn<ErrorTrackerSinks["consoleError"]>(),
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

  test("production forwards the original error with tags and a message redactor", () => {
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
    const [forwarded, tags, redact] = sinks.captureException.mock.calls[0]!;
    // The original error object, so Sentry keeps its stack frames and type.
    expect(forwarded).toBe(error);
    expect(tags).toEqual({
      toolCallId: "call-1",
      source: "ai-assistant.stream",
      "error.type": "ECONNRESET",
    });
    expect(redact).toBe(redactEventMessages);
  });

  test("production classifies non-Error values by type", () => {
    const sinks = createSinks();
    createErrorTracker("production", sinks).captureException(SENTINEL);
    const [, tags] = sinks.captureException.mock.calls[0]!;
    expect(tags).toEqual({ source: "petrinaut", "error.type": "string" });
  });

  test("tests stay silent", () => {
    const sinks = createSinks();
    createErrorTracker("test", sinks).captureException(new Error("quiet"));
    expect(sinks.consoleError).not.toHaveBeenCalled();
    expect(sinks.captureException).not.toHaveBeenCalled();
  });
});

describe("redactEventMessages", () => {
  test("blanks message text but keeps exception types and stack frames", () => {
    const event = {
      event_id: "1",
      message: `top-level ${SENTINEL}`,
      exception: {
        values: [
          {
            type: "Error",
            value: `failed: ${SENTINEL}`,
            stacktrace: {
              frames: [{ filename: "ai-assistant-panel.tsx", lineno: 42 }],
            },
          },
        ],
      },
    } as ErrorEvent;
    const redacted = redactEventMessages(event);
    expect(JSON.stringify(redacted)).not.toContain(SENTINEL);
    expect(redacted.message).toBe("[redacted]");
    expect(redacted.exception?.values?.[0]).toMatchObject({
      type: "Error",
      value: "[redacted]",
      stacktrace: {
        frames: [{ filename: "ai-assistant-panel.tsx", lineno: 42 }],
      },
    });
  });

  test("leaves events without message text untouched", () => {
    const event = { event_id: "2" } as ErrorEvent;
    expect(redactEventMessages(event)).toEqual(event);
  });
});
