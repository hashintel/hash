/**
 * The arrowhead of a standard arc: a marker the canvas draws once per colour
 * and every arc of that colour points at.
 *
 * The arcs at the focused item wear the colour of their casing and share
 * markers of their own. The markers left to the other arcs are then the heads
 * of the arcs that fade, so the pane fades those heads by one rule on their
 * shape.
 */

import { arcHaloColor } from "../../../styles/focus";

import type { CanvasArc } from "../../../canvas-scene";

export type ArcHead = {
  /** The marker's id, unique in the document. */
  id: string;
  color: string;
  /** Whether the arcs that wear this head stand at the focused item. */
  inFocus: boolean;
};

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
 * The head an arc wears. A cased arc runs into a head of the casing's colour:
 * the casing cannot wrap the head, and a head left in the arc's own colour
 * would end the casing short of the node.
 *
 * `canvasId` tells this canvas's markers from those of another canvas in the
 * same document, which fades its heads at other times.
 */
export const arcHeadOf = (
  canvasId: string,
  arc: Pick<CanvasArc, "color" | "focus">,
): ArcHead => {
  const haloColor = arcHaloColor(arc.focus);
  const inFocus = haloColor !== undefined;
  const color = haloColor ?? arc.color;
  return {
    id: `${canvasId}-arc-head-${inFocus ? "focus" : "plain"}-${color}`,
    color,
    inFocus,
  };
};

/** One head for each colour the standard arcs wear, in a stable order. */
export const arcHeadsOf = (canvasId: string, arcs: CanvasArc[]): ArcHead[] => {
  const heads = new Map<string, ArcHead>();
  for (const arc of arcs) {
    if (arc.kind === "standard") {
      const head = arcHeadOf(canvasId, arc);
      heads.set(head.id, head);
    }
  }
  return [...heads.values()].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
};
