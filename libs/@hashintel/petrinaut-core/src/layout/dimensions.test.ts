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
    expect(getComponentInstanceHeight(compactNodeDimensions, 1)).toBe(96);
  });

  it("grows by a row per port under the header", () => {
    expect(getComponentInstanceHeight(compactNodeDimensions, 2)).toBe(106);
    expect(getComponentInstanceHeight(compactNodeDimensions, 3)).toBe(132);
    expect(getComponentInstanceHeight(compactNodeDimensions, 10)).toBe(314);
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
