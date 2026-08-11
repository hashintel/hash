/**
 * Positions for every fold state, computed once at build time.
 *
 * ELK runs here, in Node, not in the browser. The reachable fold states are
 * enumerable (30 for the current model), so laying all of them out during the
 * build and shipping coordinates costs a few hundred kilobytes and buys three
 * things: the client never loads ELK's 1.6 MB worker, the server render is a
 * real diagram rather than an empty box waiting for layout, and the positions
 * are build output that CI can check like any other.
 *
 * This is also what keeps `elkjs` a devDependency. It is EPL-2.0 rather than
 * MIT/Apache, and coordinates computed by a build tool are not a derivative of
 * it, so nothing EPL-licensed reaches a consumer of the bundle.
 */

import ELK from "elkjs/lib/elk.bundled.js";

import {
  enumerateCollapseStates,
  visibleGraph,
  type VisibleEdge,
  type VisibleNode,
} from "./collapse";

import type { Edge, Layer } from "../model";
import type { ElkNode } from "elkjs/lib/elk-api";

/**
 * Node geometry, in the coordinate space of its parent.
 *
 * Parent-relative is what ELK returns and what React Flow expects for a child
 * node, so neither side has to convert. The server-rendered SVG accumulates them
 * into absolute positions itself.
 */
export interface LayoutNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/**
 * A drawn edge, with the polyline ELK routed for it in root coordinates.
 *
 * The interactive renderer routes edges itself and ignores `points`; the
 * server-rendered SVG has no layout engine and would otherwise have to draw
 * straight lines through the middle of containers.
 */
export interface LayoutEdge extends VisibleEdge {
  points: Point[];
}

export interface LayoutState {
  key: string;
  collapsed: string[];
  width: number;
  height: number;
  /**
   * Ordered parents-before-children.
   *
   * React Flow requires this and fails confusingly when it is violated, so the
   * order is a property of the emitted data rather than something every consumer
   * has to remember to arrange.
   */
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  /** Per-node facts that vary with the fold state. */
  facts: Record<
    string,
    {
      collapsed: boolean;
      fileCount: number;
      foldedLayers: number;
      internal: number;
    }
  >;
}

/** Facts about a layer that do not change with the fold state, stored once. */
export interface LayoutLayer {
  id: string;
  name: string;
  role: string;
  package: string;
  /** Bundle-relative page slug, so a node can link to its own documentation. */
  slug: string;
  /** Whether this layer can be folded at all. */
  expandable: boolean;
}

export interface ArchitectureLayouts {
  /** Key of the state shown before a reader touches anything. */
  initialState: string;
  layers: LayoutLayer[];
  states: LayoutState[];
}

const CHARACTER_WIDTH = 7.4;
const MINIMUM_WIDTH = 180;
const MAXIMUM_WIDTH = 280;
/** Name, badge line, and the internal-dependency note, plus padding. */
const NODE_HEIGHT = 84;

/**
 * A node wide enough for its label and badge line.
 *
 * ELK needs sizes up front — it lays out boxes, it does not measure text — so
 * this has to approximate what the component will render. Erring wide is
 * cheaper than erring narrow: extra whitespace looks deliberate, a clipped
 * label looks broken.
 */
const leafSize = (node: VisibleNode): { width: number; height: number } => {
  const badge =
    node.foldedLayers > 0
      ? `${node.fileCount} files · ${node.foldedLayers} layers`
      : `${node.fileCount} files`;
  // The toggle button sits beside the name, so the name needs room for both.
  const longest = Math.max(node.name.length + 3, badge.length);
  return {
    width: Math.min(
      MAXIMUM_WIDTH,
      Math.max(MINIMUM_WIDTH, Math.round(longest * CHARACTER_WIDTH) + 36),
    ),
    height: NODE_HEIGHT,
  };
};

/** Whole pixels. Sub-pixel precision is invisible here and triples the payload. */
const round = (value: number): number => Math.round(value);

const elk = new ELK();

const layoutOptions: Record<string, string> = {
  "elk.algorithm": "layered",
  "elk.direction": "RIGHT",
  // Lets ELK route edges that leave one container and enter another, instead of
  // laying each container out as an island and stacking the results.
  "elk.hierarchyHandling": "INCLUDE_CHILDREN",
  "elk.layered.spacing.nodeNodeBetweenLayers": "70",
  "elk.spacing.nodeNode": "28",
  "elk.spacing.edgeNode": "24",
  "elk.padding": "[top=44,left=20,bottom=20,right=20]",
  "elk.layered.mergeEdges": "true",
  "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
};

const toElkGraph = (nodes: VisibleNode[], edges: VisibleEdge[]): ElkNode => {
  const byParent = new Map<string | null, VisibleNode[]>();
  for (const node of nodes) {
    const siblings = byParent.get(node.parent) ?? [];
    siblings.push(node);
    byParent.set(node.parent, siblings);
  }

  const build = (node: VisibleNode): ElkNode => {
    const children = byParent.get(node.id) ?? [];

    if (children.length === 0) {
      return { id: node.id, ...leafSize(node) };
    }

    // A container is sized by ELK from its children plus `elk.padding`.
    return { id: node.id, children: children.map(build) };
  };

  return {
    id: "root",
    layoutOptions,
    children: (byParent.get(null) ?? []).map(build),
    edges: edges.map((edge, index) => ({
      // Reciprocal pairs are one record; lay out the heavier direction so the
      // left-to-right ordering reflects the stronger dependency.
      id: `e${index}`,
      sources: [edge.reverse > edge.forward ? edge.to : edge.from],
      targets: [edge.reverse > edge.forward ? edge.from : edge.to],
    })),
  };
};

/**
 * ELK's routed polyline for each edge, keyed by the id we gave it.
 *
 * Edges declared on the root graph can be moved into a descendant by
 * `INCLUDE_CHILDREN`, so the whole tree is walked rather than just `root.edges`.
 * Coordinates are then relative to whichever graph holds the edge, which is why
 * the containing offset is threaded through.
 */
const collectEdgePoints = (root: ElkNode): Map<string, Point[]> => {
  const routes = new Map<string, Point[]>();

  const walk = (node: ElkNode, offsetX: number, offsetY: number): void => {
    const x = offsetX + (node.x ?? 0);
    const y = offsetY + (node.y ?? 0);

    for (const edge of node.edges ?? []) {
      const points: Point[] = [];
      for (const section of edge.sections ?? []) {
        points.push({
          x: round(section.startPoint.x + x),
          y: round(section.startPoint.y + y),
        });
        for (const bend of section.bendPoints ?? []) {
          points.push({ x: round(bend.x + x), y: round(bend.y + y) });
        }
        points.push({
          x: round(section.endPoint.x + x),
          y: round(section.endPoint.y + y),
        });
      }
      if (points.length > 0) {
        routes.set(edge.id, points);
      }
    }

    for (const child of node.children ?? []) {
      walk(child, x, y);
    }
  };

  // The root's own origin is not an offset — its children already start at 0.
  for (const edge of root.edges ?? []) {
    const points: Point[] = [];
    for (const section of edge.sections ?? []) {
      points.push({
        x: round(section.startPoint.x),
        y: round(section.startPoint.y),
      });
      for (const bend of section.bendPoints ?? []) {
        points.push({ x: round(bend.x), y: round(bend.y) });
      }
      points.push({
        x: round(section.endPoint.x),
        y: round(section.endPoint.y),
      });
    }
    if (points.length > 0) {
      routes.set(edge.id, points);
    }
  }

  for (const child of root.children ?? []) {
    walk(child, 0, 0);
  }

  return routes;
};

const flatten = (root: ElkNode): LayoutNode[] => {
  const flat: LayoutNode[] = [];

  const walk = (node: ElkNode): void => {
    flat.push({
      id: node.id,
      x: round(node.x ?? 0),
      y: round(node.y ?? 0),
      width: round(node.width ?? 0),
      height: round(node.height ?? 0),
    });
    // Parents before children, which React Flow requires of its `nodes` array.
    for (const child of node.children ?? []) {
      walk(child);
    }
  };

  for (const child of root.children ?? []) {
    walk(child);
  }

  return flat;
};

/** Every top-level layer that has children, folded. */
const initialStateKey = (layers: Layer[]): string => {
  const topLevel = layers
    .filter(
      (layer) =>
        layer.parent === null &&
        layers.some((other) => other.parent === layer.id),
    )
    .map((layer) => layer.id)
    .sort((left, right) => left.localeCompare(right));

  return topLevel.length === 0 ? "_" : topLevel.join("+");
};

export const buildLayouts = async (
  layers: Layer[],
  edges: Edge[],
  slugForLayer: (id: string) => string,
): Promise<ArchitectureLayouts> => {
  const states = enumerateCollapseStates(layers);

  const initial = initialStateKey(layers);

  const laidOut = await Promise.all(
    states.map(async (state): Promise<LayoutState> => {
      const graph = visibleGraph(layers, edges, state.collapsed);
      const result = await elk.layout(toElkGraph(graph.nodes, graph.edges));
      // Every state needs its routed polylines: the diagram draws them itself in
      // every fold state, not just the one the server rendered.
      const routes = collectEdgePoints(result);

      return {
        key: state.key,
        collapsed: state.collapsed,
        width: round(result.width ?? 0),
        height: round(result.height ?? 0),
        nodes: flatten(result),
        edges: graph.edges.map((edge, index) => ({
          ...edge,
          points: routes.get(`e${index}`) ?? [],
        })),
        facts: Object.fromEntries(
          graph.nodes.map((node) => [
            node.id,
            {
              collapsed: node.collapsed,
              fileCount: node.fileCount,
              foldedLayers: node.foldedLayers,
              internal: node.internalDependencies,
            },
          ]),
        ),
      };
    }),
  );

  return {
    // Everything folded to the top level: the same view as the overview diagram,
    // and the only state that fits on a screen without scrolling.
    initialState: initial,
    layers: layers.map((layer) => ({
      id: layer.id,
      name: layer.name,
      role: layer.role,
      package: layer.package,
      slug: slugForLayer(layer.id),
      expandable: layers.some((other) => other.parent === layer.id),
    })),
    states: laidOut.sort((left, right) => left.key.localeCompare(right.key)),
  };
};

/**
 * The layouts as a standalone TypeScript module for the bundle.
 *
 * The interactive component needs both the data and its types, and it cannot
 * import from the generator — the bundle has to stand on its own in a host that
 * has never heard of this package. So the types travel with the data.
 */
export const renderLayoutsModule = (
  layouts: ArchitectureLayouts,
  generatedBy: string,
): string =>
  `/**
 * Pre-computed diagram layouts. Generated by ${generatedBy} — do not edit.
 *
 * One entry per reachable fold state, laid out by ELK at build time. See
 * \`./architecture-graph\` for what consumes it.
 */

export interface Point {
  x: number;
  y: number;
}

/** Geometry in the coordinate space of the node's parent. */
export interface LayoutNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutEdge {
  from: string;
  to: string;
  /** File-level imports \`from\` → \`to\`. */
  forward: number;
  /** File-level imports \`to\` → \`from\`. Zero unless the pair is reciprocal. */
  reverse: number;
  crossesPackage: boolean;
  /** Routed polyline in root coordinates. */
  points: Point[];
}

export interface LayoutState {
  key: string;
  collapsed: string[];
  width: number;
  height: number;
  /** Ordered parents-before-children, as React Flow requires. */
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  facts: Record<
    string,
    {
      collapsed: boolean;
      fileCount: number;
      foldedLayers: number;
      internal: number;
    }
  >;
}

export interface LayoutLayer {
  id: string;
  name: string;
  role: string;
  package: string;
  /** Bundle-relative page slug. */
  slug: string;
  expandable: boolean;
}

export interface ArchitectureLayouts {
  initialState: string;
  layers: LayoutLayer[];
  states: LayoutState[];
}

export const layouts: ArchitectureLayouts = ${JSON.stringify(layouts)};
`;
