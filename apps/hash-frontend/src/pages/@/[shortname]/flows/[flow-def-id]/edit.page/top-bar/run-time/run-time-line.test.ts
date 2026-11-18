import { describe, expect, it } from "vitest";

import { formatRunTimeLine } from "./run-time-line";

/* Local times, so the expectations hold in any time zone. */
const now = new Date(2026, 10, 9, 10, 46, 2);

describe("formatRunTimeLine", () => {
  it("gives an ended run's duration, then when it started", () => {
    expect(
      formatRunTimeLine(
        {
          state: "failed",
          startedAt: new Date(2026, 10, 9, 8, 15, 0),
          endedAt: new Date(2026, 10, 9, 8, 16, 52),
        },
        now,
      ),
    ).toBe("1m 52s · Today, 08:15");
  });

  it("counts a running run's duration up to now", () => {
    expect(
      formatRunTimeLine(
        {
          state: "running",
          startedAt: new Date(2026, 10, 9, 10, 45, 50),
          endedAt: null,
        },
        now,
      ),
    ).toBe("12s · Today, 10:45");
  });

  it("says first that a run waits on a person", () => {
    expect(
      formatRunTimeLine(
        {
          state: "needsReview",
          startedAt: new Date(2026, 10, 9, 10, 42, 42),
          endedAt: null,
        },
        now,
      ),
    ).toBe("Needs review · 3m 20s · Today, 10:42");
  });

  it("gives only when a run started if it stopped with no end recorded", () => {
    expect(
      formatRunTimeLine(
        {
          state: "unknown",
          startedAt: new Date(2026, 10, 8, 23, 50),
          endedAt: null,
        },
        now,
      ),
    ).toBe("Yesterday, 23:50");
  });
});
