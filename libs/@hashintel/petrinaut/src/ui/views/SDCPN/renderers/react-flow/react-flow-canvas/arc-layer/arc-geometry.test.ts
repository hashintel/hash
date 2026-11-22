import { Position } from "@xyflow/react";
import { describe, expect, it } from "vitest";

import {
  type ArcCurve,
  fixedEndpoint,
  type OutlineNode,
} from "../shared/outline-arcs";
import { arcGeometry } from "./arc-geometry";

import type { CanvasPoint } from "../../../../canvas-scene";

const circle: OutlineNode = {
  position: { x: 0, y: 0 },
  width: 100,
  height: 100,
  cornerRadius: 50,
};
const source = circle;
const target = { ...circle, position: { x: 300, y: 0 } };

const pointAt = (
  { start, firstControl, lastControl, end }: ArcCurve,
  along: number,
): CanvasPoint => {
  const back = 1 - along;
  const at = (a: number, b: number, c: number, d: number) =>
    back ** 3 * a +
    3 * back ** 2 * along * b +
    3 * back * along ** 2 * c +
    along ** 3 * d;
  return {
    x: at(start.x, firstControl.x, lastControl.x, end.x),
    y: at(start.y, firstControl.y, lastControl.y, end.y),
  };
};

/** The curve in two thousand steps. */
const finePoints = (curve: ArcCurve): CanvasPoint[] =>
  Array.from({ length: 2001 }, (_, step) => pointAt(curve, step / 2000));

const lengthOf = (points: CanvasPoint[]): number =>
  points.reduce(
    (length, point, index) =>
      index === 0
        ? 0
        : length +
          Math.hypot(
            point.x - (points[index - 1]?.x ?? 0),
            point.y - (points[index - 1]?.y ?? 0),
          ),
    0,
  );

// Leaves along x and arrives along y, a quarter turn.
const bent = () =>
  arcGeometry(
    fixedEndpoint(0, 0, Position.Right),
    fixedEndpoint(100, 100, Position.Top),
    false,
  );

describe("the geometry of an arc", () => {
  it("places the label halfway along a symmetric connection", () => {
    expect(arcGeometry(source, target, false).label).toEqual({ x: 150, y: 0 });
  });

  it("measures a straight connection as the distance between its ends", () => {
    expect(arcGeometry(source, target, false).length).toBeCloseTo(200);
  });

  it("measures a bent connection to within a hundredth", () => {
    const { curve, length } = bent();
    const fine = lengthOf(finePoints(curve));

    expect(fine).toBeGreaterThan(Math.hypot(100, 100));
    expect(Math.abs(length - fine) / fine).toBeLessThan(0.01);
  });

  it("arrives in the direction the curve ends in", () => {
    expect(arcGeometry(source, target, false).arrival).toEqual({ x: 1, y: 0 });

    const { arrival } = bent();
    expect(arrival.x).toBeCloseTo(0);
    expect(arrival.y).toBeCloseTo(1);
  });

  it("still arrives somewhere when the last control point lies on the end", () => {
    const { arrival } = arcGeometry(
      fixedEndpoint(0, 0, Position.Right),
      fixedEndpoint(0, 100),
      false,
    );
    expect(Math.hypot(arrival.x, arrival.y)).toBeCloseTo(1);
    expect(arrival.y).toBeGreaterThan(0);
  });
});

describe("the shaft of an arc", () => {
  it("is the curve less the length of the head", () => {
    const { shaft } = arcGeometry(source, target, false);
    expect(shaft.start).toEqual({ x: 50, y: 0 });
    // The head is 5.5 stroke widths of 2 long.
    expect(shaft.end.x).toBeCloseTo(250 - 11, 2);
    expect(shaft.end.y).toBeCloseTo(0);
  });

  it("stops the same length short of the end along a bent curve", () => {
    const { curve, shaft, length } = bent();
    const whole = finePoints(curve);
    const fine = lengthOf(whole);

    expect(lengthOf(finePoints(shaft))).toBeCloseTo(fine - 11, 1);
    // It follows the curve: its end is a point of it.
    const nearest = Math.min(
      ...whole.map((point) =>
        Math.hypot(point.x - shaft.end.x, point.y - shaft.end.y),
      ),
    );
    expect(nearest).toBeLessThan(0.05);
    expect(length).toBeGreaterThan(11);
  });

  it("is empty for a curve shorter than the head", () => {
    const { shaft } = arcGeometry(
      fixedEndpoint(0, 0, Position.Right),
      fixedEndpoint(6, 0, Position.Left),
      false,
    );
    expect(shaft.end).toEqual(shaft.start);
  });
});

describe("the box of an arc", () => {
  it("is the box of a straight curve's ends", () => {
    expect(arcGeometry(source, target, false).box).toEqual({
      x: 50,
      y: 0,
      width: 200,
      height: 0,
    });
  });

  it("holds a curve that sweeps past its ends", () => {
    // Out to the right and back in from the right: the curve bulges past both
    // ends.
    const { curve, box } = arcGeometry(
      fixedEndpoint(0, 0, Position.Right),
      fixedEndpoint(0, 100, Position.Right),
      false,
    );
    const points = finePoints(curve);
    const right = Math.max(...points.map((point) => point.x));

    expect(right).toBeGreaterThan(10);
    expect(box.x).toBeCloseTo(0);
    expect(box.x + box.width).toBeCloseTo(right, 3);
    expect(box.y).toBeCloseTo(0);
    expect(box.height).toBeCloseTo(100);
  });
});
