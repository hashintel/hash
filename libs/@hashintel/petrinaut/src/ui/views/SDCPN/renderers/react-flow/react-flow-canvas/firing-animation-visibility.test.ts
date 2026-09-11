import { describe, expect, it } from "vitest";

import {
  arcFiringIsVisible,
  nodeFiringIsVisible,
  type ViewportState,
} from "./firing-animation-visibility";

/** A 1000x600 pane showing the net at 1:1, panned to the origin. */
const viewport = (
  transform: [number, number, number] = [0, 0, 1],
): ViewportState => ({ transform, width: 1000, height: 600 });

describe("nodeFiringIsVisible", () => {
  it("animates a node in the pane", () => {
    expect(nodeFiringIsVisible(viewport(), 500, 300)).toBe(true);
  });

  it("skips a node well off the side", () => {
    expect(nodeFiringIsVisible(viewport(), 5000, 300)).toBe(false);
    expect(nodeFiringIsVisible(viewport(), -5000, 300)).toBe(false);
    expect(nodeFiringIsVisible(viewport(), 500, -5000)).toBe(false);
  });

  it("keeps a node just past the edge, whose body still shows", () => {
    // A node's coordinates are its top-left corner, so one sitting just off
    // the right edge is still partly in view.
    expect(nodeFiringIsVisible(viewport(), 1050, 300)).toBe(true);
  });

  it("follows the pan", () => {
    // Panned 2000px left, a node at x=2200 lands at x=200 on screen.
    expect(nodeFiringIsVisible(viewport([-2000, 0, 1]), 2200, 300)).toBe(true);
    expect(nodeFiringIsVisible(viewport([-2000, 0, 1]), 200, 300)).toBe(false);
  });

  it("skips everything once the net is drawn too small to read", () => {
    expect(nodeFiringIsVisible(viewport([0, 0, 0.1]), 500, 300)).toBe(false);
    // Just above the threshold the same node animates.
    expect(nodeFiringIsVisible(viewport([0, 0, 0.3]), 500, 300)).toBe(true);
  });
});

describe("arcFiringIsVisible", () => {
  it("animates an arc crossing the pane, whichever way it runs", () => {
    expect(arcFiringIsVisible(viewport(), -400, 300, 1400, 300)).toBe(true);
    expect(arcFiringIsVisible(viewport(), 1400, 300, -400, 300)).toBe(true);
  });

  it("skips an arc whose whole span is off screen", () => {
    expect(arcFiringIsVisible(viewport(), 3000, 300, 4000, 300)).toBe(false);
  });

  it("skips an arc when the net is drawn too small to read", () => {
    expect(arcFiringIsVisible(viewport([0, 0, 0.1]), 0, 0, 500, 300)).toBe(
      false,
    );
  });
});
