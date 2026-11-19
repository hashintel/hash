import { describe, expect, it } from "vitest";

import {
  FLUSH_EVENTS,
  FLUSH_INTERVAL_MS,
  FLUSH_ADVANCES,
  shouldFlush,
} from "./flush-policy";

describe("shouldFlush", () => {
  const quiet = {
    advancesPending: 10,
    eventsPending: 1,
    msSinceFlush: 5,
    stopping: false,
  };

  it("holds a small, young batch", () => {
    expect(shouldFlush(quiet)).toBe(false);
    expect(
      shouldFlush({ ...quiet, advancesPending: 0, msSinceFlush: 10_000 }),
    ).toBe(false);
  });

  it("flushes a full batch, a burst of events, or a stop", () => {
    expect(shouldFlush({ ...quiet, advancesPending: FLUSH_ADVANCES })).toBe(
      true,
    );
    expect(shouldFlush({ ...quiet, eventsPending: FLUSH_EVENTS })).toBe(true);
    expect(shouldFlush({ ...quiet, stopping: true })).toBe(true);
  });

  it("flushes a pending batch on the interval", () => {
    expect(shouldFlush({ ...quiet, msSinceFlush: FLUSH_INTERVAL_MS - 1 })).toBe(
      false,
    );
    expect(shouldFlush({ ...quiet, msSinceFlush: FLUSH_INTERVAL_MS })).toBe(
      true,
    );
  });
});
