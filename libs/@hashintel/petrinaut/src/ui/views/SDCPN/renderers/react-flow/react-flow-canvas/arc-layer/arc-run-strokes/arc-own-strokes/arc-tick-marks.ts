import { ARC_STROKE_WIDTH } from "../../../arc-head";

/** The circle an inhibitor arc ends in. */
export const INHIBITOR_CIRCLE_RADIUS = 10;

const tickSpacing = 13;
const tickHalfLength = 5;

export type TickMark = { x1: number; y1: number; x2: number; y2: number };

/**
 * Evenly spaced marks across an SVG path, each perpendicular to it: the
 * crossed "barrier" line of an inhibitor arc.
 *
 * The geometry comes from the path as the browser draws it, by walking a
 * detached path element with `getPointAtLength`, so the marks follow the
 * curve. A margin at the far end keeps them off the circle the arc ends in.
 *
 * This is a pure computation (the path element is never attached to the
 * document) and is safe to run during render.
 */
export const computeArcTickMarks = (path: string): TickMark[] => {
  if (typeof document === "undefined") {
    return [];
  }

  const pathElement = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "path",
  );
  pathElement.setAttribute("d", path);

  let totalLength: number;
  try {
    totalLength = pathElement.getTotalLength();
  } catch {
    // `getTotalLength`/`getPointAtLength` are unavailable in some non-browser
    // environments (e.g. jsdom); fall back to no ticks rather than throwing.
    return [];
  }

  if (!Number.isFinite(totalLength) || totalLength <= 0) {
    return [];
  }

  // Keep ticks clear of the source node and of the circle at the target.
  const startMargin = tickSpacing;
  const endMargin = INHIBITOR_CIRCLE_RADIUS + ARC_STROKE_WIDTH + tickSpacing;
  const usableLength = totalLength - startMargin - endMargin;

  if (usableLength <= 0) {
    return [];
  }

  const tickCount = Math.floor(usableLength / tickSpacing);
  const ticks: TickMark[] = [];

  for (let index = 0; index <= tickCount; index++) {
    const distance = startMargin + index * tickSpacing;

    let point: DOMPoint;
    let ahead: DOMPoint;
    try {
      point = pathElement.getPointAtLength(distance);
      ahead = pathElement.getPointAtLength(Math.min(distance + 1, totalLength));
    } catch {
      return [];
    }

    const dx = ahead.x - point.x;
    const dy = ahead.y - point.y;
    const length = Math.hypot(dx, dy) || 1;

    // Unit vector perpendicular to the path tangent.
    const nx = -dy / length;
    const ny = dx / length;

    ticks.push({
      x1: point.x - nx * tickHalfLength,
      y1: point.y - ny * tickHalfLength,
      x2: point.x + nx * tickHalfLength,
      y2: point.y + ny * tickHalfLength,
    });
  }

  return ticks;
};
