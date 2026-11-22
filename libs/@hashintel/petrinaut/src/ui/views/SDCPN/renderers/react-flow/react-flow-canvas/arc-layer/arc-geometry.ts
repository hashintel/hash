/**
 * The geometry of one arc, as numbers: everything that is drawn or decided
 * from the curve between its two ends.
 */

import { ARC_HEAD_LENGTH, ARC_STROKE_WIDTH } from "../arc-head";
import {
  type ArcCurve,
  type ArcEnd,
  getOutlineArcCurve,
} from "../shared/outline-arcs";

import type { CanvasPoint } from "../../../../canvas-scene";

export type ArcBox = { x: number; y: number; width: number; height: number };

export type ArcGeometry = {
  curve: ArcCurve;
  /**
   * The curve as far as the base of the arrowhead. A line and a head that
   * are both drawn faded must not lie on each other, or both would show.
   */
  shaft: ArcCurve;
  /** The direction the arc arrives in, as a unit vector. */
  arrival: CanvasPoint;
  /** The middle of the curve, where the weight is shown. */
  label: CanvasPoint;
  /** How long the curve is, to within a hundredth of it. */
  length: number;
  /** The box of the curve itself, which decides whether a firing is on screen. */
  box: ArcBox;
};

/** How far the arrowhead reaches back from the end of the curve. */
const headReach = ARC_HEAD_LENGTH * ARC_STROKE_WIDTH;

const coordinateAt = (
  start: number,
  first: number,
  last: number,
  end: number,
  along: number,
): number => {
  const back = 1 - along;
  return (
    back ** 3 * start +
    3 * back ** 2 * along * first +
    3 * back * along ** 2 * last +
    along ** 3 * end
  );
};

/**
 * The length of a stretch of the curve, as the chords of equal steps along
 * it. Every arc that moves is measured on every frame, so the loop keeps its
 * points in numbers and allocates nothing.
 */
const lengthBetween = (
  { start, firstControl, lastControl, end }: ArcCurve,
  from: number,
  to: number,
  steps: number,
): number => {
  let length = 0;
  let previousX = coordinateAt(
    start.x,
    firstControl.x,
    lastControl.x,
    end.x,
    from,
  );
  let previousY = coordinateAt(
    start.y,
    firstControl.y,
    lastControl.y,
    end.y,
    from,
  );
  for (let step = 1; step <= steps; step++) {
    const along = from + ((to - from) * step) / steps;
    const x = coordinateAt(
      start.x,
      firstControl.x,
      lastControl.x,
      end.x,
      along,
    );
    const y = coordinateAt(
      start.y,
      firstControl.y,
      lastControl.y,
      end.y,
      along,
    );
    length += Math.hypot(x - previousX, y - previousY);
    previousX = x;
    previousY = y;
  }
  return length;
};

/**
 * How far along the curve the arrowhead begins, from 0 to 1. A first guess
 * takes the curve at one speed, and each pass corrects it by the length of
 * the stretch it leaves: that stretch is short and close to straight, so
 * three passes are within a thousandth of a unit.
 */
const headStart = (curve: ArcCurve, length: number): number => {
  if (length <= headReach) {
    return 0;
  }
  let from = 1 - headReach / length;
  for (let pass = 0; pass < 3; pass++) {
    const left = lengthBetween(curve, from, 1, 8);
    from = Math.max(0, 1 - ((1 - from) * headReach) / left);
  }
  return from;
};

const mix = (
  from: CanvasPoint,
  to: CanvasPoint,
  along: number,
): CanvasPoint => ({
  x: from.x + (to.x - from.x) * along,
  y: from.y + (to.y - from.y) * along,
});

/** The first part of a curve, as a curve of its own. */
const curveBefore = (
  { start, firstControl, lastControl, end }: ArcCurve,
  along: number,
): ArcCurve => {
  const first = mix(start, firstControl, along);
  const middle = mix(firstControl, lastControl, along);
  const last = mix(lastControl, end, along);
  const firstHalf = mix(first, middle, along);
  const lastHalf = mix(middle, last, along);
  return {
    start,
    firstControl: first,
    lastControl: firstHalf,
    end: mix(firstHalf, lastHalf, along),
  };
};

/**
 * The direction a curve ends in. A control point that lies on the end says
 * nothing, so the next point back does.
 */
const arrivalOf = ({
  start,
  firstControl,
  lastControl,
  end,
}: ArcCurve): CanvasPoint => {
  for (const from of [lastControl, firstControl, start]) {
    const length = Math.hypot(end.x - from.x, end.y - from.y);
    if (length > 0) {
      return { x: (end.x - from.x) / length, y: (end.y - from.y) / length };
    }
  }
  return { x: 1, y: 0 };
};

/** Where a·t² + b·t + c is zero. */
const rootsOf = (a: number, b: number, c: number): number[] => {
  if (Math.abs(a) < 1e-9) {
    return Math.abs(b) < 1e-9 ? [] : [-c / b];
  }
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) {
    return [];
  }
  const root = Math.sqrt(discriminant);
  return [(-b + root) / (2 * a), (-b - root) / (2 * a)];
};

/**
 * The least and the greatest value one coordinate takes along the curve: at
 * its ends, or where it turns, which is where its derivative is zero.
 */
const extentOf = (
  start: number,
  first: number,
  last: number,
  end: number,
): [least: number, greatest: number] => {
  let least = Math.min(start, end);
  let greatest = Math.max(start, end);
  const turns = rootsOf(
    -start + 3 * first - 3 * last + end,
    2 * (start - 2 * first + last),
    first - start,
  );
  for (const along of turns) {
    if (along > 0 && along < 1) {
      const value = coordinateAt(start, first, last, end, along);
      least = Math.min(least, value);
      greatest = Math.max(greatest, value);
    }
  }
  return [least, greatest];
};

const boxOf = ({ start, firstControl, lastControl, end }: ArcCurve): ArcBox => {
  const [left, right] = extentOf(start.x, firstControl.x, lastControl.x, end.x);
  const [top, bottom] = extentOf(start.y, firstControl.y, lastControl.y, end.y);
  return { x: left, y: top, width: right - left, height: bottom - top };
};

/** The number of chords the whole curve is measured in. */
const lengthSteps = 24;

export const arcGeometry = (
  source: ArcEnd,
  target: ArcEnd,
  hasReverseArc: boolean,
): ArcGeometry => {
  const curve = getOutlineArcCurve(source, target, hasReverseArc);
  const { start, firstControl, lastControl, end } = curve;
  const length = lengthBetween(curve, 0, 1, lengthSteps);
  return {
    curve,
    shaft: curveBefore(curve, headStart(curve, length)),
    arrival: arrivalOf(curve),
    label: {
      x: (start.x + 3 * firstControl.x + 3 * lastControl.x + end.x) / 8,
      y: (start.y + 3 * firstControl.y + 3 * lastControl.y + end.y) / 8,
    },
    length,
    box: boxOf(curve),
  };
};
