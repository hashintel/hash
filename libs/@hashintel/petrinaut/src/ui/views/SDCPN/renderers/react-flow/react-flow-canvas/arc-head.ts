/**
 * The arrowhead of a standard arc: a marker the canvas draws once, which
 * every arc of one colour and one focus role points at.
 *
 * An arc with no role points at the head the pane fades, so one rule on that
 * shape fades the head of every such arc. An arc at the focused item points
 * at the head of its role, which never fades. That head wears the colour of
 * the arc's casing while the canvas has a focus, and the arc's own colour
 * otherwise.
 */

import { arcHaloColor } from "../../../styles/focus";
import { pathPoint } from "./shared/outline-arcs";

import type { CanvasArcFocus } from "../../../canvas-focus";
import type { CanvasArc, CanvasPoint } from "../../../canvas-scene";

export type ArcHead = {
  /** The marker's id, unique in the document. */
  id: string;
  /** The colour of the arcs that point at it. */
  color: string;
  /**
   * The colour of the casing those arcs wear, for the head of a role. A head
   * without one is the head of the arcs with no role.
   */
  haloColor: string | undefined;
};

/**
 * The width of an arc's stroke. The head is drawn in units of it, so where a
 * faded line stops and how large its head is come from this one number.
 */
export const ARC_STROKE_WIDTH = 2;

/**
 * The shape of the head in units of the arc's stroke width, with the tip at
 * the origin and the arc arriving from the left. It is React Flow's closed
 * arrow, a triangle 5 long and 8 wide under a round stroke 1 wide, as the one
 * outline that fill and stroke cover together. Filled once, a faded head has
 * one strength all over. Filled and stroked, the inner half of the stroke
 * would lie on the fill and show as a darker rim.
 */
export const ARC_HEAD_OUTLINE =
  "M -4.6877,-4.3904 L 0.3123,-0.3904 A 0.5,0.5 0 0 1 0.3123,0.3904 L -4.6877,4.3904 A 0.5,0.5 0 0 1 -5.5,4 L -5.5,-4 A 0.5,0.5 0 0 1 -4.6877,-4.3904 Z";

/** How far the head reaches back from its tip, in stroke widths. */
export const ARC_HEAD_LENGTH = 5.5;

/**
 * The corners of that outline, in the order it is drawn: each is reached by
 * a line, or around a round corner of the stroke.
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

const arcFocuses: CanvasArcFocus[] = [
  "none",
  "focused",
  "incoming",
  "outgoing",
];

const arcHead = (
  canvasId: string,
  color: string,
  focus: CanvasArcFocus,
): ArcHead => ({
  id: `${canvasId}-arc-head-${focus}-${color}`,
  color,
  haloColor: arcHaloColor(focus),
});

/**
 * The head an arc points at. A cased arc runs into a head of the casing's
 * colour: the casing cannot wrap the head, and a head left in the arc's own
 * colour would end the casing short of the node.
 *
 * `canvasId` tells this canvas's markers from those of another canvas in the
 * same document, which fades its heads at other times.
 */
export const arcHeadOf = (
  canvasId: string,
  arc: Pick<CanvasArc, "color" | "focus">,
): ArcHead => arcHead(canvasId, arc.color, arc.focus);

/**
 * The heads a canvas draws: for each colour the standard arcs wear, the head
 * of every role, whether or not an arc has that role now. An arc points at
 * the head of a role for longer than it has the role: see `useArcHeadRoles`.
 */
export const arcHeadsOf = (canvasId: string, arcs: CanvasArc[]): ArcHead[] => {
  const colors = new Set<string>();
  for (const arc of arcs) {
    if (arc.kind === "standard") {
      colors.add(arc.color);
    }
  }
  return [...colors].flatMap((color) =>
    arcFocuses.map((focus) => arcHead(canvasId, color, focus)),
  );
};
