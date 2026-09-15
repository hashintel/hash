import { findRoute, segmentIsClear } from "./square-arcs/find-route";

import type { CanvasPoint } from "../../../../canvas-scene";
import type { OutlineArcPath, OutlineNode } from "./outline-arcs";
import type { RoutingBox, RoutingPort } from "./square-arcs/find-route";

const clearance = 16;
const directions = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
];

const boxOf = (node: OutlineNode): RoutingBox => ({
  left: node.position.x - node.width / 2 - clearance,
  right: node.position.x + node.width / 2 + clearance,
  top: node.position.y - node.height / 2 - clearance,
  bottom: node.position.y + node.height / 2 + clearance,
});

const portsOf = (node: OutlineNode, lane: number): RoutingPort[] =>
  directions.map((normal, direction) => {
    const halfWidth = Math.max(0, node.width / 2);
    const halfHeight = Math.max(0, node.height / 2);
    const radius = Math.max(
      0,
      Math.min(node.cornerRadius, halfWidth, halfHeight),
    );
    const halfSide = normal.x === 0 ? halfWidth : halfHeight;
    const halfDepth = normal.x === 0 ? halfHeight : halfWidth;
    const offset = lane * Math.min(10, halfSide / 3);
    const cornerOffset = Math.max(0, Math.abs(offset) - (halfSide - radius));
    const depth =
      cornerOffset > 0
        ? halfDepth -
          radius +
          Math.sqrt(Math.max(0, radius ** 2 - cornerOffset ** 2))
        : halfDepth;
    const anchor = {
      x: node.position.x + normal.x * depth - normal.y * offset,
      y: node.position.y + normal.y * depth + normal.x * offset,
    };
    return {
      anchor,
      direction,
      point: {
        x:
          node.position.x +
          normal.x * (halfDepth + clearance) -
          normal.y * offset,
        y:
          node.position.y +
          normal.y * (halfDepth + clearance) +
          normal.x * offset,
      },
    };
  });

const simplify = (points: readonly CanvasPoint[]): CanvasPoint[] => {
  const result: CanvasPoint[] = [];
  for (const point of points) {
    const last = result.at(-1);
    if (last?.x === point.x && last.y === point.y) continue;
    const before = result.at(-2);
    if (
      last &&
      before &&
      ((before.x === last.x && last.x === point.x) ||
        (before.y === last.y && last.y === point.y))
    )
      result.pop();
    result.push(point);
  }
  return result;
};

export type SquareArcRoute = {
  points: CanvasPoint[];
  obstacleAvoidance: "routed" | "fallback" | "off";
};

export const getSquareArcRoute = (
  source: OutlineNode,
  target: OutlineNode | CanvasPoint,
  {
    obstacles = [],
    avoidObstacles = true,
    hasReverseArc = false,
  }: {
    obstacles?: readonly OutlineNode[];
    avoidObstacles?: boolean;
    hasReverseArc?: boolean;
  } = {},
): SquareArcRoute => {
  const targetNode = "position" in target ? target : null;
  const targetCenter = targetNode
    ? targetNode.position
    : (target as CanvasPoint);
  const sourcePorts = portsOf(source, hasReverseArc ? 1 : 0);
  const targetPorts = targetNode
    ? portsOf(targetNode, hasReverseArc ? -1 : 0)
    : [{ point: targetCenter, anchor: targetCenter, direction: -1 }];
  const endpointBoxes = [
    boxOf(source),
    ...(targetNode ? [boxOf(targetNode)] : []),
  ];
  const boundsWithMargin = (margin: number): RoutingBox => ({
    left:
      Math.min(...endpointBoxes.map((box) => box.left), targetCenter.x) -
      margin,
    right:
      Math.max(...endpointBoxes.map((box) => box.right), targetCenter.x) +
      margin,
    top:
      Math.min(...endpointBoxes.map((box) => box.top), targetCenter.y) - margin,
    bottom:
      Math.max(...endpointBoxes.map((box) => box.bottom), targetCenter.y) +
      margin,
  });
  const outerBounds = boundsWithMargin(256);
  const obstacleBoxes = avoidObstacles
    ? obstacles
        .filter(
          (obstacle) =>
            obstacle.position.x - obstacle.width / 2 - clearance <
              outerBounds.right &&
            obstacle.position.x + obstacle.width / 2 + clearance >
              outerBounds.left &&
            obstacle.position.y - obstacle.height / 2 - clearance <
              outerBounds.bottom &&
            obstacle.position.y + obstacle.height / 2 + clearance >
              outerBounds.top,
        )
        .map(boxOf)
    : [];
  const sourceBlockedBy = [...obstacleBoxes, ...endpointBoxes.slice(1)];
  const targetBlockedBy = [...obstacleBoxes, endpointBoxes[0]!];
  const sources = sourcePorts.filter((port) =>
    segmentIsClear(port.anchor, port.point, sourceBlockedBy),
  );
  const targets = targetPorts.filter((port) =>
    segmentIsClear(port.anchor, port.point, targetBlockedBy),
  );
  const boxes = [...endpointBoxes, ...obstacleBoxes];
  for (const start of sources) {
    for (const end of targets) {
      const normal = directions[start.direction];
      if (
        !normal ||
        (end.direction >= 0 && end.direction !== (start.direction + 2) % 4)
      )
        continue;
      const horizontal =
        start.point.y === end.point.y &&
        normal.x * (end.point.x - start.point.x) > 0;
      const vertical =
        start.point.x === end.point.x &&
        normal.y * (end.point.y - start.point.y) > 0;
      if (
        (horizontal || vertical) &&
        segmentIsClear(start.point, end.point, boxes)
      ) {
        return {
          points: [start.anchor, end.anchor],
          obstacleAvoidance: avoidObstacles ? "routed" : "off",
        };
      }
    }
  }
  for (const margin of [64, 256]) {
    const bounds = boundsWithMargin(margin);
    const nearby = boxes.filter(
      (box) =>
        box.left < bounds.right &&
        box.right > bounds.left &&
        box.top < bounds.bottom &&
        box.bottom > bounds.top,
    );
    const points = findRoute(sources, targets, nearby, bounds);
    if (points)
      return {
        points: simplify(points),
        obstacleAvoidance: avoidObstacles ? "routed" : "off",
      };
  }
  if (avoidObstacles)
    return {
      ...getSquareArcRoute(source, target, {
        hasReverseArc,
        avoidObstacles: false,
      }),
      obstacleAvoidance: "fallback",
    };
  const direction =
    Math.abs(targetCenter.x - source.position.x) >=
    Math.abs(targetCenter.y - source.position.y)
      ? targetCenter.x >= source.position.x
        ? 0
        : 2
      : targetCenter.y >= source.position.y
        ? 1
        : 3;
  const start = sourcePorts[direction]!.anchor;
  const end = targetNode
    ? targetPorts[(direction + 2) % 4]!.anchor
    : targetCenter;
  return {
    points: simplify([start, { x: end.x, y: start.y }, end]),
    obstacleAvoidance: "off",
  };
};

export const getSquareArcPath = (route: SquareArcRoute): OutlineArcPath => {
  let longest = -1;
  let label = route.points[0] ?? { x: 0, y: 0 };
  for (let index = 1; index < route.points.length; index++) {
    const start = route.points[index - 1]!;
    const end = route.points[index]!;
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    if (length > longest) {
      longest = length;
      label = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    }
  }
  return [
    route.points
      .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x},${point.y}`)
      .join(" "),
    label.x,
    label.y,
  ];
};
