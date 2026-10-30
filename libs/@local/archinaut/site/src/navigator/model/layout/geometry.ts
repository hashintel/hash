/**
 * Edge geometry: a curve from the border of one box to the border of
 * another, bent so opposite edges between the same pair do not overlap.
 */

import { centerOf, type Box, type Point } from "./types";

/** The point on `rect`'s border where a line from its centre toward `target` leaves it. */
const clipToRect = (rect: Box, target: Point): Point => {
  const center = centerOf(rect);
  const dx = target.x - center.x;
  const dy = target.y - center.y;
  if (dx === 0 && dy === 0) {
    return center;
  }
  const scaleX = dx === 0 ? Infinity : rect.width / 2 / Math.abs(dx);
  const scaleY = dy === 0 ? Infinity : rect.height / 2 / Math.abs(dy);
  const scale = Math.min(scaleX, scaleY);
  return { x: center.x + dx * scale, y: center.y + dy * scale };
};

export interface EdgeGeometry {
  d: string;
  /** Where a label sits: the curve's midpoint. */
  mid: Point;
  /** Where the curve ends, on the target's border. */
  end: Point;
  /** The unit direction the curve arrives in, for an arrow head. */
  direction: Point;
}

export const edgeGeometry = (
  from: Box,
  to: Box,
  bend: number,
): EdgeGeometry => {
  const start = centerOf(from);
  const end = centerOf(to);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy) || 1;
  const normal = { x: -dy / length, y: dx / length };
  const control = {
    x: (start.x + end.x) / 2 + normal.x * bend * length,
    y: (start.y + end.y) / 2 + normal.y * bend * length,
  };
  const clippedStart = clipToRect(from, control);
  const clippedEnd = clipToRect(to, control);
  const mid = {
    x: 0.25 * clippedStart.x + 0.5 * control.x + 0.25 * clippedEnd.x,
    y: 0.25 * clippedStart.y + 0.5 * control.y + 0.25 * clippedEnd.y,
  };
  const arrival =
    Math.hypot(clippedEnd.x - control.x, clippedEnd.y - control.y) || 1;
  return {
    d: `M ${clippedStart.x.toFixed(1)} ${clippedStart.y.toFixed(1)} Q ${control.x.toFixed(1)} ${control.y.toFixed(1)} ${clippedEnd.x.toFixed(1)} ${clippedEnd.y.toFixed(1)}`,
    mid,
    end: clippedEnd,
    direction: {
      x: (clippedEnd.x - control.x) / arrival,
      y: (clippedEnd.y - control.y) / arrival,
    },
  };
};
