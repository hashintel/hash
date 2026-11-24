import { describe, expect, it } from "vitest";

import { fusionLoopPath } from "./fusion-loop-path";

type Point = { x: number; y: number };

/** A point of a cubic curve, at `progress` from 0 to 1 along it. */
const pointAt = (
  [from, first, second, end]: [Point, Point, Point, Point],
  progress: number,
): Point => {
  const left = 1 - progress;
  const along = (axis: "x" | "y") =>
    left ** 3 * from[axis] +
    3 * left ** 2 * progress * first[axis] +
    3 * left * progress ** 2 * second[axis] +
    progress ** 3 * end[axis];
  return { x: along("x"), y: along("y") };
};

/** The points of a path made of one `M` and its `C` commands, sampled along each curve. */
const sample = (path: string): Point[] => {
  const numbers = (path.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  const points = numbers.flatMap((x, index) => {
    const y = numbers[index + 1];
    return index % 2 === 0 && y !== undefined ? [{ x, y }] : [];
  });
  const sampled = points.slice(0, 1);
  for (let index = 0; index + 3 < points.length; index += 3) {
    const [from, first, second, end] = points.slice(index, index + 4);
    if (!from || !first || !second || !end) {
      break;
    }
    for (let step = 1; step <= 100; step++) {
      sampled.push(pointAt([from, first, second, end], step / 100));
    }
  }
  return sampled;
};

// A card from x 0 to 160 whose top is at y 0, with a pin on each side.
const card = { left: 0, right: 160, top: 0 };

describe("fusionLoopPath", () => {
  it("runs from the right-hand pin to the left-hand pin", () => {
    const [path] = fusionLoopPath({
      sourceX: card.right,
      sourceY: 60,
      targetX: card.left,
      targetY: 90,
      cardTop: card.top,
    });
    const points = sample(path);

    expect(points[0]).toEqual({ x: 160, y: 60 });
    expect(points.at(-1)).toEqual({ x: 0, y: 90 });
  });

  it("puts the knot above the middle of the card", () => {
    const [, labelX, labelY] = fusionLoopPath({
      sourceX: card.right,
      sourceY: 60,
      targetX: card.left,
      targetY: 90,
      cardTop: card.top,
    });

    expect(labelX).toBe(80);
    expect(labelY).toBeLessThan(card.top);
  });

  it.each([
    { sourceY: 20, targetY: 20 },
    { sourceY: 60, targetY: 90 },
    { sourceY: 300, targetY: 40 },
    { sourceY: 40, targetY: 600 },
  ])(
    "keeps clear of the card with pins at $sourceY and $targetY",
    ({ sourceY, targetY }) => {
      const [path] = fusionLoopPath({
        sourceX: card.right,
        sourceY,
        targetX: card.left,
        targetY,
        cardTop: card.top,
      });
      const overCard = sample(path).filter(
        ({ x }) => x > card.left && x < card.right,
      );

      expect(overCard.length).toBeGreaterThan(0);
      for (const point of overCard) {
        expect(point.y).toBeLessThan(card.top);
      }
    },
  );
});
