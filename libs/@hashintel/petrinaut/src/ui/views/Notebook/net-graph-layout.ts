/**
 * Layered layout for the whole-net graph, computed from the arc structure
 * alone — the net's stored x/y positions are deliberately ignored.
 *
 * A cut-down Sugiyama pipeline: break cycles with a depth-first sweep, assign
 * layers by longest path, reduce crossings with barycentre ordering, then
 * place coordinates.
 */

import type { NetGraph, NetGraphEdge, NetGraphNode } from "./notebook-model";

export const NET_NODE_WIDTH = 86;
export const NET_NODE_HEIGHT = 22;

const PADDING = 10;
const COLUMN_GAP = 10;
const ROW_GAP = 34;
/** How far a return edge bows clear of the nodes it connects. */
const BACK_EDGE_BOW = 18;
/** Barycentre sweeps; two is plenty for nets of this size. */
const ORDERING_PASSES = 2;

export type PositionedNetNode = NetGraphNode & {
  x: number;
  y: number;
  layer: number;
};

export type LaidOutEdge = NetGraphEdge & {
  key: string;
  /**
   * True when the edge does not travel downwards through the layers; drawn
   * as a bowed return path instead of a straight drop.
   */
  isBackEdge: boolean;
};

export type NetGraphLayout = {
  width: number;
  height: number;
  nodes: PositionedNetNode[];
  edges: LaidOutEdge[];
};

const edgeKey = (edge: NetGraphEdge) => `${edge.from} ${edge.to}`;

const groupTargets = (edges: NetGraphEdge[]): Map<string, string[]> => {
  const byFrom = new Map<string, string[]>();
  for (const edge of edges) {
    const existing = byFrom.get(edge.from);
    if (existing === undefined) {
      byFrom.set(edge.from, [edge.to]);
    } else {
      existing.push(edge.to);
    }
  }
  return byFrom;
};

const groupSources = (edges: NetGraphEdge[]): Map<string, string[]> => {
  const byTo = new Map<string, string[]>();
  for (const edge of edges) {
    const existing = byTo.get(edge.to);
    if (existing === undefined) {
      byTo.set(edge.to, [edge.from]);
    } else {
      existing.push(edge.from);
    }
  }
  return byTo;
};

/**
 * Find the edges that close a cycle, using an iterative depth-first search.
 * Removing them leaves a DAG, which is what the layering step needs.
 */
function findBackEdges(graph: NetGraph): Set<string> {
  const targetsByNode = groupTargets(graph.edges);
  const backEdges = new Set<string>();
  /** 0 = unvisited, 1 = on the current path, 2 = finished. */
  const state = new Map<string, 0 | 1 | 2>();

  for (const root of graph.nodes) {
    if ((state.get(root.id) ?? 0) !== 0) {
      continue;
    }
    state.set(root.id, 1);
    const stack: { id: string; nextTarget: number }[] = [
      { id: root.id, nextTarget: 0 },
    ];

    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      const targets = targetsByNode.get(frame.id) ?? [];

      if (frame.nextTarget >= targets.length) {
        state.set(frame.id, 2);
        stack.pop();
        continue;
      }

      const target = targets[frame.nextTarget]!;
      frame.nextTarget += 1;
      const targetState = state.get(target) ?? 0;

      if (targetState === 1) {
        backEdges.add(edgeKey({ from: frame.id, to: target }));
      } else if (targetState === 0) {
        state.set(target, 1);
        stack.push({ id: target, nextTarget: 0 });
      }
    }
  }

  return backEdges;
}

/** Longest-path layering over the acyclic edge set. */
function assignLayers(
  nodes: NetGraphNode[],
  dagEdges: NetGraphEdge[],
): Map<string, number> {
  const layer = new Map<string, number>(nodes.map(({ id }) => [id, 0]));
  const remainingInDegree = new Map<string, number>(
    nodes.map(({ id }) => [id, 0]),
  );
  for (const edge of dagEdges) {
    remainingInDegree.set(edge.to, (remainingInDegree.get(edge.to) ?? 0) + 1);
  }

  const targetsByNode = groupTargets(dagEdges);
  const queue = nodes
    .filter(({ id }) => remainingInDegree.get(id) === 0)
    .map(({ id }) => id);

  for (let head = 0; head < queue.length; head++) {
    const id = queue[head]!;
    for (const target of targetsByNode.get(id) ?? []) {
      layer.set(target, Math.max(layer.get(target)!, layer.get(id)! + 1));
      const remaining = (remainingInDegree.get(target) ?? 0) - 1;
      remainingInDegree.set(target, remaining);
      if (remaining === 0) {
        queue.push(target);
      }
    }
  }

  return layer;
}

/** Mean position of a node's neighbours in the adjacent layer. */
const barycentre = (
  neighbours: string[],
  positions: Map<string, number>,
  fallback: number,
): number => {
  const known = neighbours
    .map((id) => positions.get(id))
    .filter((position): position is number => position !== undefined);
  return known.length === 0
    ? fallback
    : known.reduce((total, position) => total + position, 0) / known.length;
};

const positionsOf = (layerIds: string[]): Map<string, number> =>
  new Map(layerIds.map((id, index) => [id, index]));

/**
 * Layer nodes by hop distance from one node: the focus sits in the middle,
 * everything upstream of it above (negative distance), everything downstream
 * below. Nodes the focus can't reach either way keep the graph's context by
 * being parked in a band underneath.
 *
 * A node reachable both ways — a cycle through the focus — takes whichever
 * side is nearer, and the cycle badge and return edge carry the loop.
 */
function assignFocusLayers(
  graph: NetGraph,
  focusId: string,
  dagEdges: NetGraphEdge[],
): Map<string, number> {
  const targetsByNode = groupTargets(graph.edges);
  const sourcesByNode = groupSources(graph.edges);

  const walk = (
    adjacency: Map<string, string[]>,
    sign: 1 | -1,
  ): Map<string, number> => {
    const distances = new Map<string, number>();
    let frontier = [focusId];
    let distance = 0;
    const seen = new Set<string>([focusId]);

    while (frontier.length > 0) {
      distance += 1;
      const next: string[] = [];
      for (const id of frontier) {
        for (const neighbour of adjacency.get(id) ?? []) {
          if (seen.has(neighbour)) {
            continue;
          }
          seen.add(neighbour);
          distances.set(neighbour, sign * distance);
          next.push(neighbour);
        }
      }
      frontier = next;
    }

    return distances;
  };

  const downstream = walk(targetsByNode, 1);
  const upstream = walk(sourcesByNode, -1);

  const distances = new Map<string, number>([[focusId, 0]]);
  for (const node of graph.nodes) {
    if (node.id === focusId) {
      continue;
    }
    const below = downstream.get(node.id);
    const above = upstream.get(node.id);
    if (below !== undefined && above !== undefined) {
      distances.set(node.id, Math.abs(above) <= below ? above : below);
    } else if (below !== undefined) {
      distances.set(node.id, below);
    } else if (above !== undefined) {
      distances.set(node.id, above);
    }
  }

  // Unreachable nodes sit below everything else rather than vanishing. They
  // keep their own longest-path layering — collapsing them into a single band
  // would put whole disconnected components on one row, leaving their edges
  // as degenerate same-row curves.
  const unreachable = graph.nodes.filter((node) => !distances.has(node.id));
  if (unreachable.length > 0) {
    const unreachableIds = new Set(unreachable.map(({ id }) => id));
    const unreachableEdges = dagEdges.filter(
      (edge) => unreachableIds.has(edge.from) && unreachableIds.has(edge.to),
    );
    const subLayers = assignLayers(unreachable, unreachableEdges);
    const deepest = Math.max(0, ...distances.values());
    for (const [id, subLayer] of subLayers) {
      distances.set(id, deepest + 2 + subLayer);
    }
  }

  // Collapse the signed distances to dense layer indices.
  const usedDistances = [...new Set(distances.values())].sort(
    (left, right) => left - right,
  );
  const layerByDistance = new Map(
    usedDistances.map((value, index) => [value, index]),
  );

  return new Map(
    [...distances].map(([id, value]) => [id, layerByDistance.get(value)!]),
  );
}

/**
 * Order nodes within each layer to reduce edge crossings, sweeping down then
 * up. `Array.prototype.sort` is stable, so equal barycentres keep their
 * relative order and the result is deterministic.
 */
function orderLayers(
  initialLayers: string[][],
  dagEdges: NetGraphEdge[],
): string[][] {
  const sourcesByNode = groupSources(dagEdges);
  const targetsByNode = groupTargets(dagEdges);

  const sortByAdjacent = (
    layers: string[][],
    index: number,
    adjacentLayer: string[],
    neighboursByNode: Map<string, string[]>,
  ): string[] => {
    const adjacentPositions = positionsOf(adjacentLayer);
    const current = layers[index]!;
    const scores = new Map(
      current.map((id, position) => [
        id,
        barycentre(neighboursByNode.get(id) ?? [], adjacentPositions, position),
      ]),
    );
    return [...current].sort(
      (left, right) => scores.get(left)! - scores.get(right)!,
    );
  };

  let layers = initialLayers.map((ids) => [...ids]);

  for (let pass = 0; pass < ORDERING_PASSES; pass++) {
    const downward = layers.map((ids) => [...ids]);
    for (let index = 1; index < downward.length; index++) {
      downward[index] = sortByAdjacent(
        downward,
        index,
        downward[index - 1]!,
        sourcesByNode,
      );
    }

    const upward = downward.map((ids) => [...ids]);
    for (let index = upward.length - 2; index >= 0; index--) {
      upward[index] = sortByAdjacent(
        upward,
        index,
        upward[index + 1]!,
        targetsByNode,
      );
    }

    layers = upward;
  }

  return layers;
}

export interface LayoutOptions {
  /**
   * Re-layer around this node instead of by longest path: it takes the middle
   * row, its dependencies stack above and its dependents below.
   */
  focusId?: string | null;
}

export function layoutNetGraph(
  graph: NetGraph,
  options: LayoutOptions = {},
): NetGraphLayout {
  if (graph.nodes.length === 0) {
    return { width: 0, height: 0, nodes: [], edges: [] };
  }

  const backEdges = findBackEdges(graph);
  const dagEdges = graph.edges.filter((edge) => !backEdges.has(edgeKey(edge)));

  const focusId =
    options.focusId != null &&
    graph.nodes.some((node) => node.id === options.focusId)
      ? options.focusId
      : null;

  const layerByNode =
    focusId === null
      ? assignLayers(graph.nodes, dagEdges)
      : assignFocusLayers(graph, focusId, dagEdges);

  const layers: string[][] = [];
  for (const node of graph.nodes) {
    const index = layerByNode.get(node.id)!;
    while (layers.length <= index) {
      layers.push([]);
    }
    layers[index]!.push(node.id);
  }

  const orderedLayers = orderLayers(layers, dagEdges);

  const layerWidths = orderedLayers.map(
    (ids) => ids.length * NET_NODE_WIDTH + (ids.length - 1) * COLUMN_GAP,
  );
  const contentWidth = Math.max(...layerWidths);
  // Return edges bow out past the rightmost node, so they get their own lane;
  // without it the SVG viewport clips the curve's peak.
  const hasBackEdge = graph.edges.some(
    (edge) =>
      (layerByNode.get(edge.to) ?? 0) <= (layerByNode.get(edge.from) ?? 0),
  );
  const width = contentWidth + PADDING * 2 + (hasBackEdge ? BACK_EDGE_BOW : 0);
  const height =
    PADDING * 2 +
    orderedLayers.length * NET_NODE_HEIGHT +
    (orderedLayers.length - 1) * ROW_GAP;

  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const nodes: PositionedNetNode[] = [];

  orderedLayers.forEach((ids, layer) => {
    const startX = PADDING + (contentWidth - layerWidths[layer]!) / 2;
    ids.forEach((id, position) => {
      const node = nodesById.get(id)!;
      nodes.push({
        ...node,
        layer,
        x: startX + position * (NET_NODE_WIDTH + COLUMN_GAP),
        y: PADDING + layer * (NET_NODE_HEIGHT + ROW_GAP),
      });
    });
  });

  // Classified by geometry rather than by the layering pass, so an edge is
  // drawn as a return path exactly when it doesn't travel downwards — true in
  // both the default and the focused layering.
  const edges: LaidOutEdge[] = graph.edges.map((edge) => ({
    ...edge,
    key: edgeKey(edge),
    isBackEdge:
      (layerByNode.get(edge.to) ?? 0) <= (layerByNode.get(edge.from) ?? 0),
  }));

  return { width, height, nodes, edges };
}

/** A node's top-left corner, which is all the edge geometry needs. */
export type Point = { x: number; y: number };

const anchorsOf = (point: Point) => ({
  centreX: point.x + NET_NODE_WIDTH / 2,
  centreY: point.y + NET_NODE_HEIGHT / 2,
  top: point.y,
  bottom: point.y + NET_NODE_HEIGHT,
  right: point.x + NET_NODE_WIDTH,
});

/**
 * Forward edges drop from one layer to the next; a cycle-closing edge bows out
 * to the right of both endpoints so it never runs through the layers.
 *
 * Takes plain points rather than laid-out nodes so the animation can call it
 * with interpolated positions mid-flight.
 */
export function edgePath(from: Point, to: Point, isBackEdge: boolean): string {
  const source = anchorsOf(from);
  const target = anchorsOf(to);

  if (isBackEdge) {
    const bowX = Math.max(source.right, target.right) + BACK_EDGE_BOW;
    // A same-row return (both ends focused to the same layer) has no vertical
    // span to curve through, so dip the control points below the row — a flat
    // bow would degenerate into an invisible horizontal line.
    const dip =
      Math.abs(source.centreY - target.centreY) < NET_NODE_HEIGHT
        ? NET_NODE_HEIGHT
        : 0;
    return `M ${source.right} ${source.centreY} C ${bowX} ${source.centreY + dip}, ${bowX} ${target.centreY + dip}, ${target.right} ${target.centreY}`;
  }

  const midY = (source.bottom + target.top) / 2;
  return `M ${source.centreX} ${source.bottom} C ${source.centreX} ${midY}, ${target.centreX} ${midY}, ${target.centreX} ${target.top}`;
}
