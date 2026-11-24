import { Position } from "@xyflow/react";
import { describe, expect, it } from "vitest";

import {
  curvePath,
  fixedEndpoint,
  getOutlineArcCurve,
  getOutlineAttachment,
  type OutlineNode,
} from "./outline-arcs";

const circle: OutlineNode = {
  position: { x: 40, y: 60 },
  width: 100,
  height: 100,
  cornerRadius: 50,
};

describe("outline attachments", () => {
  it.each([0, 30, 45, 90, 135, 180, 225, 270, 315])(
    "intersects a circle at %s degrees with an outward unit normal",
    (degrees) => {
      const angle = (degrees * Math.PI) / 180;
      const direction = { x: Math.cos(angle), y: Math.sin(angle) };
      const { point, normal } = getOutlineAttachment(circle, direction);
      expect(point.x).toBeCloseTo(circle.position.x + 50 * direction.x);
      expect(point.y).toBeCloseTo(circle.position.y + 50 * direction.y);
      expect(normal.x).toBeCloseTo(direction.x);
      expect(normal.y).toBeCloseTo(direction.y);
    },
  );

  it("uses the top of a wide capsule and the curve at its end", () => {
    const capsule = { ...circle, width: 200, height: 40, cornerRadius: 20 };
    const top = getOutlineAttachment(capsule, { x: 1, y: -1 });
    expect(top.point).toEqual({ x: 60, y: 40 });
    expect(top.normal).toEqual({ x: 0, y: -1 });

    const end = getOutlineAttachment(capsule, { x: 10, y: 1 });
    expect(Math.hypot(end.point.x - 120, end.point.y - 60)).toBeCloseTo(20);
    expect(Math.hypot(end.normal.x, end.normal.y)).toBeCloseTo(1);
    expect(end.normal.x).toBeGreaterThan(0);
    expect(end.normal.y).toBeGreaterThan(0);
  });

  it("clips a diagonal to a rounded corner rather than its bounding box", () => {
    const rounded = { ...circle, cornerRadius: 12 };
    const { point, normal } = getOutlineAttachment(rounded, { x: 1, y: 1 });
    expect(point.x).toBeCloseTo(40 + 38 + 12 / Math.sqrt(2));
    expect(point.y).toBeCloseTo(60 + 38 + 12 / Math.sqrt(2));
    expect(normal.x).toBeCloseTo(1 / Math.sqrt(2));
    expect(normal.y).toBeCloseTo(1 / Math.sqrt(2));
  });

  it("keeps rectangular transitions on their boundary", () => {
    const rectangle = { ...circle, width: 160, height: 40, cornerRadius: 0 };
    expect(getOutlineAttachment(rectangle, { x: -1, y: 0 })).toEqual({
      point: { x: -40, y: 60 },
      normal: { x: -1, y: 0 },
    });
    expect(getOutlineAttachment(rectangle, { x: 1, y: 1 })).toEqual({
      point: { x: 60, y: 80 },
      normal: { x: 0, y: 1 },
    });
  });
});

describe("outline arc curves", () => {
  const source = { ...circle, position: { x: 0, y: 0 } };
  const target = { ...circle, position: { x: 300, y: 0 } };

  it("runs from the outline of the source to the outline of the target", () => {
    const { start, end } = getOutlineArcCurve(source, target);
    expect(start).toEqual({ x: 50, y: 0 });
    expect(end).toEqual({ x: 250, y: 0 });
  });

  it("separates both directions onto opposite sides", () => {
    const forward = getOutlineArcCurve(source, target, true);
    const reverse = getOutlineArcCurve(target, source, true);
    expect(forward.start.y).toBeGreaterThan(0);
    expect(forward.end.y).toBeGreaterThan(0);
    expect(reverse.end.x).toBeCloseTo(forward.start.x);
    expect(reverse.end.y).toBeCloseTo(-forward.start.y);
    expect(reverse.start.y).toBeCloseTo(-forward.end.y);
  });

  it("ends an unsnapped preview at the pointer", () => {
    const { end } = getOutlineArcCurve(source, fixedEndpoint(75, 200));
    expect(end).toEqual({ x: 75, y: 200 });
  });

  it("leaves a component port along the side its handle sits on", () => {
    const { start, firstControl } = getOutlineArcCurve(
      fixedEndpoint(-200, 100, Position.Right),
      target,
    );
    expect(start).toEqual({ x: -200, y: 100 });
    expect(firstControl.x).toBeGreaterThan(-200);
    expect(firstControl.y).toBe(100);
  });

  it("arrives at a component port from the side its handle sits on", () => {
    const { lastControl, end } = getOutlineArcCurve(
      source,
      fixedEndpoint(300, 100, Position.Left),
    );
    expect(end).toEqual({ x: 300, y: 100 });
    expect(lastControl.x).toBeLessThan(300);
  });

  it("separates arcs into and out of one component at the transition", () => {
    const transition = { ...circle, width: 160, height: 80, cornerRadius: 0 };
    const intoPort = fixedEndpoint(400, 110, Position.Left);
    const outOfPort = fixedEndpoint(600, 110, Position.Right);

    const together = getOutlineArcCurve(transition, intoPort);
    const back = getOutlineArcCurve(outOfPort, transition);
    expect(Math.abs(together.start.y - back.end.y)).toBeLessThan(10);

    const into = getOutlineArcCurve(transition, intoPort, true);
    const outOf = getOutlineArcCurve(outOfPort, transition, true);
    expect(Math.abs(into.start.y - outOf.end.y)).toBeGreaterThan(30);
  });

  it.each([0, 1, 50, 100])(
    "stays finite with %s pixels between centers",
    (distance) => {
      const curve = getOutlineArcCurve(
        source,
        { ...target, position: { x: distance, y: 0 } },
        true,
      );
      expect(curvePath(curve)).not.toMatch(/NaN|Infinity/);
    },
  );
});

describe("path data", () => {
  it("writes a curve to a hundredth of a unit", () => {
    expect(
      curvePath({
        start: { x: 0.004, y: 1 / 3 },
        firstControl: { x: 10, y: -20.129 },
        lastControl: { x: 30.5, y: 40 },
        end: { x: 50, y: 60 },
      }),
    ).toBe("M0,0.33C10,-20.13 30.5,40 50,60");
  });
});
