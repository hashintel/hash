import { describe, expect, it } from "vitest";

import { acceptsRunEnd, runEndOf } from "./run-end";

describe("the end of a run", () => {
  it("is the time asked for, or the first step at or past it", () => {
    expect(runEndOf("time", 2.5)).toBe(2.5);
    expect(runEndOf("steps", 2.5)).toBe(3);
    expect(runEndOf("steps", 3)).toBe(3);
  });

  it("is positive, and whole in steps", () => {
    expect(acceptsRunEnd("time", 0.5)).toBe(true);
    expect(acceptsRunEnd("time", 0)).toBe(false);
    expect(acceptsRunEnd("steps", 2)).toBe(true);
    expect(acceptsRunEnd("steps", 0.5)).toBe(false);
    expect(acceptsRunEnd("steps", 0)).toBe(false);
  });
});
