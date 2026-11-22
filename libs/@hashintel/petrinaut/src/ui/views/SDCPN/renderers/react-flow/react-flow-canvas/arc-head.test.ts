import { describe, expect, it } from "vitest";

import { arcHeadPath } from "./arc-head";

import type { CanvasPoint } from "../../../canvas-scene";

describe("the head of an arc as a path", () => {
  const numbersOf = (path: string) =>
    [...path.matchAll(/-?\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
  /** The corners of a head: each command's last two numbers. */
  const cornersOf = (path: string): CanvasPoint[] =>
    path
      .split(/(?=[MLA])/)
      .map(numbersOf)
      .map((numbers) => ({ x: numbers.at(-2) ?? 0, y: numbers.at(-1) ?? 0 }));

  it("reaches back 11 units from a tip at the end of the arc", () => {
    const corners = cornersOf(arcHeadPath({ x: 100, y: 50 }, { x: 1, y: 0 }));

    expect(Math.min(...corners.map((corner) => corner.x))).toBeCloseTo(89);
    // The round corner at the tip is centred on the end of the arc.
    expect(Math.max(...corners.map((corner) => corner.x))).toBeCloseTo(100.62);
    expect(Math.max(...corners.map((corner) => corner.y))).toBeCloseTo(58.78);
    expect(Math.min(...corners.map((corner) => corner.y))).toBeCloseTo(41.22);
  });

  it("turns with the arc", () => {
    const along = cornersOf(arcHeadPath({ x: 0, y: 0 }, { x: 1, y: 0 }));
    const down = cornersOf(arcHeadPath({ x: 0, y: 0 }, { x: 0, y: 1 }));

    expect(down).toHaveLength(along.length);
    for (const [index, corner] of along.entries()) {
      // A quarter turn clockwise on screen takes (x, y) to (-y, x).
      expect(down[index]?.x).toBeCloseTo(-corner.y);
      expect(down[index]?.y).toBeCloseTo(corner.x);
    }
  });

  it("is one closed outline, so that a fill covers it once", () => {
    const path = arcHeadPath({ x: 0, y: 0 }, { x: 1, y: 0 });
    expect(path.match(/M/g)).toHaveLength(1);
    expect(path.endsWith("Z")).toBe(true);
  });
});
