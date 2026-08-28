import { describe, expect, it } from "vitest";

import { placeFillColor } from "./type-colors";

describe("placeFillColor", () => {
  it("lightens a type colour by 30", () => {
    expect(placeFillColor("#f59e0b")).toBe("hsl(38, 92%, 80%)");
    expect(placeFillColor("#8b5cf6")).toBe("hsl(258, 90%, 96%)");
  });

  it("falls back to the untyped place fill without a type colour", () => {
    expect(placeFillColor(undefined)).toBe("var(--colors-neutral-s10)");
  });
});
