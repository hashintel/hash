import { describe, expect, it } from "vitest";

import { contains, overflowOf, scrolls, spillOf } from "./overflow";

const box = (
  width: number,
  height: number,
  contentWidth = width,
  contentHeight = height,
) => ({
  clientWidth: width,
  clientHeight: height,
  scrollWidth: contentWidth,
  scrollHeight: contentHeight,
});

const rect = (left: number, top: number, width: number, height: number) => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
});

describe("scrolling boxes", () => {
  it("is zero when every box holds its content", () => {
    expect(overflowOf([box(1600, 900), box(400, 300)])).toBe(0);
  });

  it("ignores a one-pixel rounding difference", () => {
    expect(overflowOf([box(1600, 900, 1601, 900.5)])).toBe(0);
  });

  it("reports the furthest overrun across boxes and axes", () => {
    expect(
      overflowOf([box(1600, 900, 1600, 984), box(400, 300, 520, 300)]),
    ).toBe(120);
  });

  it("counts only boxes that scroll", () => {
    expect(scrolls("visible", "auto")).toBe(true);
    expect(scrolls("scroll", "hidden")).toBe(true);
    expect(scrolls("hidden", "hidden")).toBe(false);
    expect(scrolls("visible", "clip")).toBe(false);
  });
});

describe("boxes drawn past the slide", () => {
  const slide = rect(100, 50, 1280, 720);

  it("is zero when every box lies inside the slide", () => {
    expect(spillOf(slide, [rect(140, 90, 600, 400)], 0.8)).toBe(0);
  });

  it("reports the overrun in the slide's own pixels", () => {
    // 80 screen pixels past the bottom at a 0.8 scale is 100 slide pixels.
    expect(spillOf(slide, [rect(140, 600, 600, 250)], 0.8)).toBe(100);
  });

  it("reports an overrun past any edge", () => {
    expect(spillOf(slide, [rect(60, 90, 100, 100)], 1)).toBe(40);
    expect(spillOf(slide, [rect(140, 20, 100, 100)], 1)).toBe(30);
  });

  it("skips a box that is not drawn", () => {
    expect(spillOf(slide, [rect(0, 0, 0, 0)], 1)).toBe(0);
  });

  it("treats every overflow but `visible` as keeping content inside", () => {
    expect(contains("visible", "visible")).toBe(false);
    expect(contains("hidden", "visible")).toBe(true);
    expect(contains("clip", "clip")).toBe(true);
  });
});
