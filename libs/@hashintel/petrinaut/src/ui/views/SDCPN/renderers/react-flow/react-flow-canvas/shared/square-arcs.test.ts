import { describe, expect, it } from "vitest";

import { getSquareArcPath, getSquareArcRoute } from "./square-arcs";

import type { OutlineNode } from "./outline-arcs";
import type { SquareArcRoute } from "./square-arcs";

const node = (
  x: number,
  y: number,
  width = 100,
  height = 100,
  cornerRadius = 50,
): OutlineNode => ({ position: { x, y }, width, height, cornerRadius });

const expectOrthogonal = (route: SquareArcRoute) => {
  expect(route.points.length).toBeGreaterThan(1);
  for (const [index, point] of route.points.entries()) {
    expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true);
    const previous = route.points[index - 1];
    if (previous)
      expect(point.x === previous.x || point.y === previous.y).toBe(true);
  }
};

const expectClear = (route: SquareArcRoute, obstacles: OutlineNode[]) => {
  for (const [index, point] of route.points.entries()) {
    const previous = route.points[index - 1];
    if (!previous) continue;
    for (const obstacle of obstacles) {
      const left = obstacle.position.x - obstacle.width / 2 - 8;
      const right = obstacle.position.x + obstacle.width / 2 + 8;
      const top = obstacle.position.y - obstacle.height / 2 - 8;
      const bottom = obstacle.position.y + obstacle.height / 2 + 8;
      const intersects =
        point.x === previous.x
          ? point.x > left &&
            point.x < right &&
            Math.min(point.y, previous.y) < bottom &&
            Math.max(point.y, previous.y) > top
          : point.y > top &&
            point.y < bottom &&
            Math.min(point.x, previous.x) < right &&
            Math.max(point.x, previous.x) > left;
      expect(intersects, JSON.stringify({ previous, point, obstacle })).toBe(
        false,
      );
    }
  }
};

describe("square automatic arcs", () => {
  it.each([
    [400, 0],
    [-400, 0],
    [0, 400],
    [0, -400],
    [400, 250],
    [-400, -250],
  ])("attaches orthogonally toward (%s, %s)", (x, y) => {
    const source = node(0, 0);
    const target = node(x, y, 160, 80, 12);
    const route = getSquareArcRoute(source, target);
    expect(route.obstacleAvoidance).toBe("routed");
    expectOrthogonal(route);
    const first = route.points[0]!;
    expect(Math.hypot(first.x, first.y)).toBeCloseTo(50);
    const last = route.points.at(-1)!;
    expect(
      Math.max(Math.abs(last.x - x) / 80, Math.abs(last.y - y) / 40),
    ).toBeCloseTo(1);
  });

  it("detours around intervening nodes with clearance", () => {
    const obstacles = [node(200, 0), node(340, -90, 100, 200, 0)];
    const route = getSquareArcRoute(node(0, 0), node(550, 0), { obstacles });
    expect(route.obstacleAvoidance).toBe("routed");
    expectOrthogonal(route);
    expectClear(route, obstacles);
    expect(route.points.some((point) => Math.abs(point.y) >= 66)).toBe(true);
  });

  it("chooses another face when the nearest attachment is blocked", () => {
    const obstacles = [node(105, 0, 80, 100, 0)];
    const route = getSquareArcRoute(node(0, 0), node(400, 0), { obstacles });
    expect(route.obstacleAvoidance).toBe("routed");
    expectOrthogonal(route);
    expectClear(route, obstacles);
    expect(route.points[0]!.x).not.toBe(50);
  });

  it("keeps reciprocal arcs on distinct attachment lanes", () => {
    const source = node(0, 0);
    const target = node(400, 0, 160, 80, 12);
    const forward = getSquareArcRoute(source, target, { hasReverseArc: true });
    const reverse = getSquareArcRoute(target, source, { hasReverseArc: true });
    expectOrthogonal(forward);
    expectOrthogonal(reverse);
    expect(forward.points[0]).not.toEqual(reverse.points.at(-1));
    expect(forward.points.at(-1)).not.toEqual(reverse.points[0]);
    expect(Math.hypot(forward.points[0]!.x, forward.points[0]!.y)).toBeCloseTo(
      50,
    );
  });

  it("recomputes a route when an obstacle enters its path", () => {
    const source = node(0, 0);
    const target = node(400, 0);
    const clear = getSquareArcRoute(source, target, {
      obstacles: [node(200, 200)],
    });
    const moved = getSquareArcRoute(source, target, {
      obstacles: [node(200, 0)],
    });
    expect(moved.points).not.toEqual(clear.points);
    expectClear(moved, [node(200, 0)]);
  });

  it("routes a drag preview all the way to the pointer", () => {
    const pointer = { x: 400, y: 30 };
    const obstacles = [node(200, 0)];
    const route = getSquareArcRoute(node(0, 0), pointer, { obstacles });
    expect(route.obstacleAvoidance).toBe("routed");
    expectOrthogonal(route);
    expectClear(route, obstacles);
    expect(route.points.at(-1)).toEqual(pointer);
  });

  it("reports a fallback when another node covers the source", () => {
    const route = getSquareArcRoute(node(0, 0), node(400, 0), {
      obstacles: [node(0, 0, 300, 300)],
    });
    expect(route.obstacleAvoidance).toBe("fallback");
    expectOrthogonal(route);
  });

  it("can turn avoidance off without changing to curves", () => {
    const source = node(0, 0);
    const target = node(400, 0);
    const route = getSquareArcRoute(source, target, {
      obstacles: [node(200, 0)],
      avoidObstacles: false,
    });
    expect(route.obstacleAvoidance).toBe("off");
    expect(route.points).toEqual([
      { x: 50, y: 0 },
      { x: 350, y: 0 },
    ]);
    expect(getSquareArcPath(route)).toEqual(["M 50,0 L 350,0", 200, 0]);
  });

  it("ignores distant nodes when searching the local corridor", () => {
    const obstacles = Array.from({ length: 1000 }, (_, index) =>
      node(2000 + index * 140, 2000 + index * 120),
    );
    obstacles.push(node(200, 0));
    const route = getSquareArcRoute(node(0, 0), node(400, 0), { obstacles });
    expect(route.obstacleAvoidance).toBe("routed");
    expectClear(route, obstacles);
  });

  it("keeps blocked and overlapping endpoints finite", () => {
    for (const target of [node(0, 0), node(20, 10), node(100, 0)]) {
      expectOrthogonal(getSquareArcRoute(node(0, 0), target));
    }
  });
});
