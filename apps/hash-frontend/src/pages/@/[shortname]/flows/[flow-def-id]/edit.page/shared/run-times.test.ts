import { describe, expect, it } from "vitest";

import { formatDuration, formatEndTime, formatRunTime } from "./run-times";

/* Local times, so the expectations hold in any time zone. */
const now = new Date(2026, 10, 9, 14, 30);

describe("formatRunTime", () => {
  it("names today and yesterday, and gives other days' dates", () => {
    expect(formatRunTime(new Date(2026, 10, 9, 0, 5), now)).toBe(
      "Today, 00:05",
    );
    expect(formatRunTime(new Date(2026, 10, 8, 23, 59), now)).toBe(
      "Yesterday, 23:59",
    );
    expect(formatRunTime(new Date(2026, 10, 7, 23, 59), now)).toBe(
      "7 Nov, 23:59",
    );
  });

  it("adds the year to a date in another year", () => {
    expect(formatRunTime(new Date(2025, 10, 18, 9, 0), now)).toBe(
      "18 Nov 2025, 09:00",
    );
  });
});

describe("formatEndTime", () => {
  it("gives only the time when the run ended on the day it started", () => {
    expect(
      formatEndTime(
        new Date(2026, 10, 5, 16, 42),
        new Date(2026, 10, 5, 16, 20),
        now,
      ),
    ).toBe("16:42");
  });

  it("gives the day too when the run ended on a later day", () => {
    expect(
      formatEndTime(
        new Date(2026, 10, 9, 0, 10),
        new Date(2026, 10, 8, 23, 50),
        now,
      ),
    ).toBe("Today, 00:10");
  });
});

describe("formatDuration", () => {
  it("gives seconds, then minutes and seconds, then hours and minutes", () => {
    expect(formatDuration(59_999)).toBe("59s");
    expect(formatDuration(65_000)).toBe("1m 05s");
    expect(formatDuration(3_599_000)).toBe("59m 59s");
    expect(formatDuration((48 * 60 + 2) * 60_000 + 30_000)).toBe("48h 02m");
  });
});
