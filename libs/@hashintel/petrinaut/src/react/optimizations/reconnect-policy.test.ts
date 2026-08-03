import { describe, expect, it } from "vitest";

import {
  type AttachFailureInput,
  decideAttachFailure,
  MAX_CONSECUTIVE_RECONNECT_FAILURES,
  reconnectDelayMs,
} from "./reconnect-policy";

import type { ClassifiedError } from "./transport-errors";

const classified = (
  category: ClassifiedError["category"],
  httpStatus: number | null = null,
): ClassifiedError => ({
  category,
  retryAfter: null,
  diagnostics: { hashRequestId: null, optimizationRunId: null, httpStatus },
});

const failure = (
  overrides: Partial<AttachFailureInput> = {},
): AttachFailureInput => ({
  error: new Error("dropped"),
  classified: classified("network"),
  isRetryableInterruption: false,
  aborted: false,
  sawTerminalEvent: false,
  receivedAnyEvent: true,
  dropRecordOnNotFound: false,
  consecutiveFailures: 1,
  ...overrides,
});

describe("reconnectDelayMs", () => {
  it("doubles from one second and caps at thirty", () => {
    expect([1, 2, 3, 4, 5, 6].map(reconnectDelayMs)).toEqual([
      1_000, 2_000, 4_000, 8_000, 16_000, 30_000,
    ]);
  });
});

describe("decideAttachFailure", () => {
  it("reconnects a network drop with backoff", () => {
    expect(decideAttachFailure(failure({ consecutiveFailures: 3 }))).toEqual({
      kind: "reconnect",
      delayMs: 4_000,
    });
  });

  it("reconnects a protocol failure and a gateway status", () => {
    for (const candidate of [
      classified("protocol"),
      classified("http", 502),
      classified("http", 503),
      classified("http", 504),
    ]) {
      expect(decideAttachFailure(failure({ classified: candidate })).kind).toBe(
        "reconnect",
      );
    }
  });

  it("reconnects a retryable interruption even when unclassified", () => {
    expect(
      decideAttachFailure(
        failure({ classified: null, isRetryableInterruption: true }),
      ).kind,
    ).toBe("reconnect");
  });

  it("gives up on a definitive http failure without retrying", () => {
    for (const candidate of [
      classified("http", 404),
      classified("http", 400),
      classified("http", 500),
    ]) {
      expect(decideAttachFailure(failure({ classified: candidate })).kind).toBe(
        "giveUp",
      );
    }
  });

  it("gives up once the failure cap is reached", () => {
    expect(
      decideAttachFailure(
        failure({
          consecutiveFailures: MAX_CONSECUTIVE_RECONNECT_FAILURES - 1,
        }),
      ).kind,
    ).toBe("reconnect");
    expect(
      decideAttachFailure(
        failure({ consecutiveFailures: MAX_CONSECUTIVE_RECONNECT_FAILURES }),
      ).kind,
    ).toBe("giveUp");
  });

  it("treats an abort as a cancellation however it arrives", () => {
    const abortError = Object.assign(new Error("stop"), { name: "AbortError" });
    expect(decideAttachFailure(failure({ aborted: true })).kind).toBe(
      "cancelled",
    );
    expect(decideAttachFailure(failure({ error: abortError })).kind).toBe(
      "cancelled",
    );
    expect(
      decideAttachFailure(failure({ classified: classified("aborted") })).kind,
    ).toBe("cancelled");
  });

  it("prefers cancellation over every other outcome", () => {
    // An abort during the reconnect wait must not be reported as a failure.
    expect(
      decideAttachFailure(
        failure({
          aborted: true,
          sawTerminalEvent: true,
          consecutiveFailures: MAX_CONSECUTIVE_RECONNECT_FAILURES,
        }),
      ).kind,
    ).toBe("cancelled");
  });

  it("treats a failure after a terminal event as already settled", () => {
    expect(
      decideAttachFailure(
        failure({
          sawTerminalEvent: true,
          classified: classified("http", 404),
        }),
      ).kind,
    ).toBe("settled");
  });

  it("only calls a stored run expired on a 404 before its first event", () => {
    const expired = failure({
      dropRecordOnNotFound: true,
      receivedAnyEvent: false,
      classified: classified("http", 404),
    });
    expect(decideAttachFailure(expired).kind).toBe("expired");
    // Mid-run, the same 404 is a real failure worth surfacing.
    expect(
      decideAttachFailure({ ...expired, receivedAnyEvent: true }).kind,
    ).toBe("giveUp");
    // And a live run's 404 is never silently dropped.
    expect(
      decideAttachFailure({ ...expired, dropRecordOnNotFound: false }).kind,
    ).toBe("giveUp");
  });
});
