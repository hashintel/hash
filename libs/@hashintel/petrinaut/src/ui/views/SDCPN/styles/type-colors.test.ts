import { describe, expect, it } from "vitest";

import { placeFillColor } from "./type-colors";

describe("placeFillColor", () => {
  it("caps a light type colour short of white", () => {
    expect(placeFillColor("#8b5cf6")).toBe("hsl(258, 90%, 85%)");
  });

  it("applies the full delta to a type colour that stays below the cap", () => {
    expect(placeFillColor("#f59e0b")).toBe("hsl(38, 92%, 80%)");
  });

  it("falls back to white without a type colour", () => {
    expect(placeFillColor(undefined)).toBe("#FFFFFF");
  });
});
