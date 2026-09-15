import { describe, expect, it } from "vitest";

import {
  getOutlineArcPath,
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

describe("outline arc paths", () => {
  const source = { ...circle, position: { x: 0, y: 0 } };
  const target = { ...circle, position: { x: 300, y: 0 } };

  it("places the label halfway along a symmetric connection", () => {
    const [path, labelX, labelY] = getOutlineArcPath(source, target);
    expect(path).toMatch(/^M 50,0 C /);
    expect(path).toMatch(/ 250,0$/);
    expect(labelX).toBe(150);
    expect(labelY).toBe(0);
  });

  it("separates both directions onto opposite sides", () => {
    const [forward, forwardX, forwardY] = getOutlineArcPath(
      source,
      target,
      true,
    );
    const [reverse, reverseX, reverseY] = getOutlineArcPath(
      target,
      source,
      true,
    );
    expect(forward).not.toBe(reverse);
    expect(forwardX).toBeCloseTo(reverseX);
    expect(forwardY).toBeGreaterThan(0);
    expect(reverseY).toBeCloseTo(-forwardY);
  });

  it("ends an unsnapped preview at the pointer", () => {
    const [path] = getOutlineArcPath(source, { x: 75, y: 200 });
    expect(path).toMatch(/ 75,200$/);
  });

  it.each([0, 1, 50, 100])(
    "stays finite with %s pixels between centers",
    (distance) => {
      const result = getOutlineArcPath(
        source,
        { ...target, position: { x: distance, y: 0 } },
        true,
      );
      expect(result[0]).not.toMatch(/NaN|Infinity/);
      expect(Number.isFinite(result[1])).toBe(true);
      expect(Number.isFinite(result[2])).toBe(true);
    },
  );
});
