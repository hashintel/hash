import { describe, expect, it } from "vitest";

import { describeRunPosition, formatRunPosition } from "./run-position";

describe("formatRunPosition", () => {
  it("prints a time to the millisecond", () => {
    expect(formatRunPosition("time", 1.23456)).toBe("1.235");
    expect(formatRunPosition("time", 0)).toBe("0.000");
  });

  it("prints the step a position has reached", () => {
    expect(formatRunPosition("steps", 0)).toBe("0");
    expect(formatRunPosition("steps", 2.7)).toBe("2");
    expect(formatRunPosition("steps", 3)).toBe("3");
    // Three steps, a rounding short.
    expect(formatRunPosition("steps", 0.1 * 30 - 4e-16)).toBe("3");
  });
});

describe("describeRunPosition", () => {
  it("names the unit", () => {
    expect(describeRunPosition("time", 1.5)).toBe("1.500 seconds");
    expect(describeRunPosition("steps", 4.2)).toBe("step 4");
  });
});
