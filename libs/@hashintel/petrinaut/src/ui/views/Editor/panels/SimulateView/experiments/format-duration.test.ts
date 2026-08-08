import { describe, expect, it } from "vitest";

import { formatDurationMs } from "./format-duration";

describe("formatDurationMs", () => {
  it("keeps millisecond resolution below a second", () => {
    // The GPU backend finishes small nets in single-digit milliseconds, which is
    // the whole point of showing the number.
    expect(formatDurationMs(0)).toBe("0ms");
    expect(formatDurationMs(3.4)).toBe("3ms");
    expect(formatDurationMs(342)).toBe("342ms");
    expect(formatDurationMs(999.4)).toBe("999ms");
  });

  it("carries a rounding overflow into the next unit", () => {
    // Each of these rounds up past its unit's ceiling, and must not render
    // "1000ms", "10.00s", "60.0s" or "60m 00s".
    expect(formatDurationMs(999.6)).toBe("1.00s");
    expect(formatDurationMs(9_996)).toBe("10.0s");
    expect(formatDurationMs(59_999.9)).toBe("1m 00s");
    expect(formatDurationMs(3_599_800)).toBe("1h 00m");
  });

  it("switches to seconds at a second, not before", () => {
    expect(formatDurationMs(1_000)).toBe("1.00s");
    expect(formatDurationMs(9_999)).toBe("10.0s");
    expect(formatDurationMs(12_340)).toBe("12.3s");
    expect(formatDurationMs(59_940)).toBe("59.9s");
  });

  it("switches to minutes and pads the seconds", () => {
    expect(formatDurationMs(60_000)).toBe("1m 00s");
    expect(formatDurationMs(125_000)).toBe("2m 05s");
    expect(formatDurationMs(3_599_000)).toBe("59m 59s");
  });

  it("never renders sixty seconds", () => {
    // 119.6s rounds to 120s, which must carry into the minute rather than
    // reading "1m 60s".
    expect(formatDurationMs(119_600)).toBe("2m 00s");
  });

  it("switches to hours past an hour", () => {
    expect(formatDurationMs(3_600_000)).toBe("1h 00m");
    expect(formatDurationMs(4_020_000)).toBe("1h 07m");
  });

  it("clamps a negative duration rather than rendering a minus sign", () => {
    // Clock adjustments mid-run should not produce "-4ms".
    expect(formatDurationMs(-4)).toBe("0ms");
  });
});
