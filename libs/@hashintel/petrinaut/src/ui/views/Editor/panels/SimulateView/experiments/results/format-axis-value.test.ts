import { describe, expect, it } from "vitest";

import { formatAxisValue } from "./format-axis-value";

describe("formatAxisValue", () => {
  it("keeps four significant digits without a step", () => {
    expect(formatAxisValue(0.123456)).toBe("0.1235");
    expect(formatAxisValue(3)).toBe("3");
  });

  it("keeps adjacent positions of a narrow axis distinct", () => {
    // An axis over [100, 100.1] in 50 steps: positions 0 and 10.
    expect(formatAxisValue(100.02, 0.002)).toBe("100.02");
    expect(formatAxisValue(100.002, 0.002)).toBe("100.002");
  });
});
