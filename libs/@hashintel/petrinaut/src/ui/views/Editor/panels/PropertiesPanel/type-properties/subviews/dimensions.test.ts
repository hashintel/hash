import { describe, expect, it } from "vitest";

import {
  dimensionNameError,
  nextDimensionName,
  slugifyToIdentifier,
} from "./dimensions";

describe("slugifyToIdentifier", () => {
  it("lowers, collapses and trims punctuation into one underscore", () => {
    expect(slugifyToIdentifier("  Position X ")).toBe("position_x");
    expect(slugifyToIdentifier("a--b__c")).toBe("a_b_c");
    expect(slugifyToIdentifier("__x__")).toBe("x");
  });

  it("prefixes a leading digit and keeps empty text empty", () => {
    expect(slugifyToIdentifier("2d")).toBe("_2d");
    expect(slugifyToIdentifier("   ")).toBe("");
  });
});

describe("nextDimensionName", () => {
  it("counts past the highest generated name, ignoring other names", () => {
    expect(nextDimensionName([])).toBe("dimension_1");
    expect(
      nextDimensionName([
        { name: "x" },
        { name: "dimension_3" },
        { name: "dimension_10_extra" },
      ]),
    ).toBe("dimension_4");
  });
});

describe("dimensionNameError", () => {
  const elements = [
    { elementId: "a", name: "x" },
    { elementId: "b", name: "velocity" },
  ];

  it("refuses an empty name", () => {
    expect(dimensionNameError(elements, "a", " ")).toBe(
      "A dimension needs a name",
    );
  });

  it("refuses a name another dimension already has, after slugifying", () => {
    expect(dimensionNameError(elements, "a", "Velocity")).toBe(
      "Another dimension is already named velocity",
    );
  });

  it("accepts the element's own name and any free name", () => {
    expect(dimensionNameError(elements, "a", "x")).toBeNull();
    expect(dimensionNameError(elements, "a", "mass")).toBeNull();
  });
});
