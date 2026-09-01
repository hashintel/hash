import { describe, expect, it } from "vitest";

import { clearanceDelta } from "./use-focus-clearance";

const CONTAINER = { top: 100, bottom: 500, left: 0, right: 800 };

const rect = (top: number, bottom: number, left = 100, right = 200) => ({
  top,
  bottom,
  left,
  right,
});

describe("clearanceDelta", () => {
  it("leaves an element with clearance untouched", () => {
    expect(clearanceDelta(rect(200, 230), CONTAINER, 25)).toEqual({
      top: 0,
      left: 0,
    });
  });

  it("scrolls up for an element inside the top band", () => {
    // Top edge 10px under the container top: 15px short of the margin.
    expect(clearanceDelta(rect(110, 140), CONTAINER, 25).top).toBe(-15);
  });

  it("scrolls down for an element inside the bottom band", () => {
    expect(clearanceDelta(rect(460, 490), CONTAINER, 25).top).toBe(15);
  });

  it("treats an element exactly on the margin as clear", () => {
    expect(clearanceDelta(rect(125, 475), CONTAINER, 25)).toEqual({
      top: 0,
      left: 0,
    });
  });

  it("never pushes the top edge past its margin for tall elements", () => {
    // 30px of headroom above, 100px of overshoot below: the correction
    // clamps to the headroom so the top lands exactly at the margin.
    expect(clearanceDelta(rect(155, 575), CONTAINER, 25).top).toBe(30);
  });

  it("handles the horizontal axis the same way", () => {
    expect(clearanceDelta(rect(200, 230, 10, 60), CONTAINER, 25).left).toBe(
      -15,
    );
    expect(clearanceDelta(rect(200, 230, 760, 795), CONTAINER, 25).left).toBe(
      20,
    );
  });
});
