/**
 * The stroke of an arc and the arrowhead of a standard arc.
 *
 * The head is one filled outline. React Flow's closed arrow is a triangle 5
 * long and 8 wide under a round stroke 1 wide, in units of the arc's stroke
 * width. The outline here is what that fill and stroke cover together, so a
 * faded head, filled once, has one strength all over. Filled and stroked,
 * the inner half of the stroke would lie on the fill and show as a darker
 * rim.
 */

import { pathPoint } from "./shared/outline-arcs";

import type { CanvasPoint } from "../../../canvas-scene";

/**
 * The width of an arc's stroke. The head is drawn in units of it, so where a
 * faded line stops and how large its head is come from this one number.
 */
export const ARC_STROKE_WIDTH = 2;

/** The dots of a read arc's line: its dashes, under round caps. */
export const READ_ARC_DASH = "2 6";

/** How far the head reaches back from its tip, in stroke widths. */
export const ARC_HEAD_LENGTH = 5.5;

/**
 * The corners of the outline in stroke widths, with the tip at the origin
 * and the arc arriving from the left, in the order they are drawn: each is
 * reached by a line, or around a round corner of the stroke.
 */
const headCorners = [
  ["M", -4.6877, -4.3904],
  ["L", 0.3123, -0.3904],
  ["A", 0.3123, 0.3904],
  ["L", -4.6877, 4.3904],
  ["A", -5.5, 4],
  ["L", -5.5, -4],
  ["A", -4.6877, -4.3904],
] as const;

const cornerRadius = 0.5 * ARC_STROKE_WIDTH;

/**
 * The head of one arc as path data: the outline at the size of the arc's
 * stroke, with its tip where the arc ends, turned the way the arc arrives.
 * `arrival` is a unit vector.
 */
export const arcHeadPath = (tip: CanvasPoint, arrival: CanvasPoint): string => {
  const place = (x: number, y: number) =>
    pathPoint({
      x: tip.x + (x * arrival.x - y * arrival.y) * ARC_STROKE_WIDTH,
      y: tip.y + (x * arrival.y + y * arrival.x) * ARC_STROKE_WIDTH,
    });
  return `${headCorners
    .map(([command, x, y]) =>
      command === "A"
        ? `A${cornerRadius},${cornerRadius} 0 0 1 ${place(x, y)}`
        : `${command}${place(x, y)}`,
    )
    .join("")}Z`;
};
