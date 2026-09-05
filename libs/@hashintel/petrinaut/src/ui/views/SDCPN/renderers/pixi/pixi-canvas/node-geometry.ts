/**
 * Where a node's connection handles sit and what a point on the canvas hits.
 * Handles follow React Flow's placement: one target handle centred on the
 * left edge, one source handle on the right, and for component instances one
 * pair per port spread along the height.
 */

import type { CanvasNode, CanvasPoint } from "../../../canvas-scene";
import type { ArcEndpoints } from "./arc-paths";

export type HandleKind = "source" | "target";

export type CanvasHandle = {
  nodeId: string;
  kind: HandleKind;
  /** The port place id for component instance handles, null otherwise. */
  portId: string | null;
  position: CanvasPoint;
};

/** Diameter of a place or transition handle, as React Flow styles them. */
export const handleSize = 9;

/** Diameter of a component instance port handle. */
export const portHandleSize = 10;

/** How far from a handle's centre a press still grabs it. */
export const handleHitRadius = 8;

const portFraction = (index: number, count: number) =>
  count === 1 ? 0.5 : index / (count - 1);

export const handlesOf = (node: CanvasNode): CanvasHandle[] => {
  const left = node.position.x - node.width / 2;
  const right = node.position.x + node.width / 2;
  const top = node.position.y - node.height / 2;

  if (node.kind !== "componentInstance") {
    return [
      {
        nodeId: node.id,
        kind: "target",
        portId: null,
        position: { x: left, y: node.position.y },
      },
      {
        nodeId: node.id,
        kind: "source",
        portId: null,
        position: { x: right, y: node.position.y },
      },
    ];
  }

  return node.ports.flatMap((port, index) => {
    const y = top + portFraction(index, node.ports.length) * node.height;
    return [
      {
        nodeId: node.id,
        kind: "target",
        portId: port.id,
        position: { x: left, y },
      },
      {
        nodeId: node.id,
        kind: "source",
        portId: port.id,
        position: { x: right, y },
      },
    ];
  });
};

const handleAt = (
  node: CanvasNode,
  kind: HandleKind,
  portId: string | null,
): CanvasPoint => {
  const handle = handlesOf(node).find(
    (candidate) => candidate.kind === kind && candidate.portId === portId,
  );
  return handle?.position ?? node.position;
};

/** The handle centres an arc runs between. */
export const arcEndpointsOf = (
  source: CanvasNode,
  sourcePortId: string | null,
  target: CanvasNode,
  targetPortId: string | null,
): ArcEndpoints => ({
  source: handleAt(source, "source", sourcePortId),
  target: handleAt(target, "target", targetPortId),
});

/** Classic places are drawn as circles; every other node is a box. */
export const isRoundNode = (node: CanvasNode): boolean =>
  node.kind === "place" && node.width === node.height;

export const nodeContains = (node: CanvasNode, point: CanvasPoint): boolean => {
  const dx = point.x - node.position.x;
  const dy = point.y - node.position.y;
  if (isRoundNode(node)) {
    const radius = node.width / 2;
    return dx * dx + dy * dy <= radius * radius;
  }
  return Math.abs(dx) <= node.width / 2 && Math.abs(dy) <= node.height / 2;
};

export type CanvasRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export const nodeBounds = (node: CanvasNode): CanvasRect => ({
  x: node.position.x - node.width / 2,
  y: node.position.y - node.height / 2,
  width: node.width,
  height: node.height,
});

const intersects = (first: CanvasRect, second: CanvasRect): boolean =>
  first.x < second.x + second.width &&
  first.x + first.width > second.x &&
  first.y < second.y + second.height &&
  first.y + first.height > second.y;

const contains = (outer: CanvasRect, inner: CanvasRect): boolean =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.width <= outer.x + outer.width &&
  inner.y + inner.height <= outer.y + outer.height;

/** Nodes a selection box picks: touching it when partial, enclosed otherwise. */
export const nodesInSelectionBox = (
  nodes: CanvasNode[],
  box: CanvasRect,
  partial: boolean,
): CanvasNode[] =>
  nodes.filter((node) =>
    partial
      ? intersects(nodeBounds(node), box)
      : contains(box, nodeBounds(node)),
  );

/** The topmost node under a point; later nodes draw on top. */
export const nodeAt = (
  nodes: CanvasNode[],
  point: CanvasPoint,
): CanvasNode | null => {
  for (let index = nodes.length - 1; index >= 0; index--) {
    const node = nodes[index]!;
    if (nodeContains(node, point)) return node;
  }
  return null;
};

/** The handle within `radius` of a point, preferring the closest. */
export const handleAtPoint = (
  nodes: CanvasNode[],
  point: CanvasPoint,
  radius: number,
): CanvasHandle | null => {
  let best: CanvasHandle | null = null;
  let bestDistance = radius;
  for (const node of nodes) {
    for (const handle of handlesOf(node)) {
      const distance = Math.hypot(
        handle.position.x - point.x,
        handle.position.y - point.y,
      );
      if (distance <= bestDistance) {
        best = handle;
        bestDistance = distance;
      }
    }
  }
  return best;
};
