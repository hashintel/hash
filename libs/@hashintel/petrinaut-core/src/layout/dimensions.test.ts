import { describe, expect, it } from "vitest";

import {
  classicNodeDimensions,
  compactNodeDimensions,
  getComponentInstanceHeight,
  layoutNodeDimensions,
} from "./dimensions";

describe("getComponentInstanceHeight", () => {
  it("uses the base height for few ports", () => {
    expect(getComponentInstanceHeight(compactNodeDimensions, 0)).toBe(96);
    expect(getComponentInstanceHeight(compactNodeDimensions, 2)).toBe(96);
  });

  it("grows with the port count", () => {
    expect(getComponentInstanceHeight(compactNodeDimensions, 3)).toBe(112);
    expect(getComponentInstanceHeight(compactNodeDimensions, 10)).toBe(308);
  });
});

describe("layoutNodeDimensions", () => {
  it("is the per-axis maximum of the compact and classic dimensions", () => {
    for (const kind of ["place", "transition", "componentInstance"] as const) {
      expect(layoutNodeDimensions[kind]).toEqual({
        width: Math.max(
          compactNodeDimensions[kind].width,
          classicNodeDimensions[kind].width,
        ),
        height: Math.max(
          compactNodeDimensions[kind].height,
          classicNodeDimensions[kind].height,
        ),
      });
    }
  });
});
