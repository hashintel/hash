import { describe, expect, it } from "vitest";

import {
  firingIsVisible,
  type ViewportState,
} from "./firing-animation-visibility";

/** A 1000x600 pane showing the net at 1:1, panned to the origin. */
const viewport = (
  transform: [number, number, number] = [0, 0, 1],
): ViewportState => ({ transform, width: 1000, height: 600 });

describe("a node's firing", () => {
  it("animates a node in the pane", () => {
    expect(firingIsVisible(viewport(), { x: 500, y: 300 })).toBe(true);
  });

  it("skips a node well off the side", () => {
    expect(firingIsVisible(viewport(), { x: 5000, y: 300 })).toBe(false);
    expect(firingIsVisible(viewport(), { x: -5000, y: 300 })).toBe(false);
    expect(firingIsVisible(viewport(), { x: 500, y: -5000 })).toBe(false);
  });

  it("keeps a node just past the edge, whose body still shows", () => {
    // A node's coordinates are its top-left corner, so one sitting just off
    // the right edge is still partly in view.
    expect(firingIsVisible(viewport(), { x: 1050, y: 300 })).toBe(true);
  });

  it("follows the pan", () => {
    // Panned 2000px left, a node at x=2200 lands at x=200 on screen.
    expect(firingIsVisible(viewport([-2000, 0, 1]), { x: 2200, y: 300 })).toBe(
      true,
    );
    expect(firingIsVisible(viewport([-2000, 0, 1]), { x: 200, y: 300 })).toBe(
      false,
    );
  });

  it("skips everything once the net is drawn too small to read", () => {
    expect(firingIsVisible(viewport([0, 0, 0.1]), { x: 500, y: 300 })).toBe(
      false,
    );
    // Just above the threshold the same node animates.
    expect(firingIsVisible(viewport([0, 0, 0.3]), { x: 500, y: 300 })).toBe(
      true,
    );
  });
});

describe("an arc's firing", () => {
  it("animates an arc crossing the pane", () => {
    expect(
      firingIsVisible(viewport(), { x: -400, y: 300, width: 1800, height: 0 }),
    ).toBe(true);
  });

  it("skips an arc whose whole span is off screen", () => {
    expect(
      firingIsVisible(viewport(), { x: 3000, y: 300, width: 1000, height: 0 }),
    ).toBe(false);
  });
});
