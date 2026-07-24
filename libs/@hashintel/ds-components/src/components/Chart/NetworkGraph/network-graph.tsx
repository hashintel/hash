import { OrthographicView } from "@deck.gl/core";
import { IconLayer, PathLayer } from "@deck.gl/layers";
import { DeckGL, type DeckGLRef } from "@deck.gl/react";
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { css, cx } from "@hashintel/ds-helpers/css";

import { CompactNodeLayer, SELECTED_DIM_OPACITY } from "./compact-node-layer";
import { DetailedNodeLayer, DETAIL_NODE_DIAMETER } from "./detailed-node-layer";
import { buildBundleHierarchy, bundleEdgePath } from "./edge-bundling";
import {
  ARROW_HEAD_LENGTH_RATIO,
  arrowIconAtlas,
  clampPanTarget,
  clampPanTargetBlocking,
  DETAIL_ICON_TEXTURE,
  DIMMED_EDGE_COLOR,
  drawEdgeLabel,
  EDGE_COLOR,
  EDGE_HOVER_WIDTH,
  edgeLabelAnchor,
  EDGE_MIN_WIDTH,
  EDGE_WIDTH,
  hexToRgb,
  iconTextureUrl,
  RGBA_OPAQUE,
  trimPathBothEnds,
} from "./network-graph-util";
import {
  arealSpacingWorld,
  blendSpacing,
  COMPACT_OPACITY_SPARSE,
  countPointsInRect,
  DENSITY_AREAL_WEIGHT,
  DENSITY_EASE_MS,
  densityPointRadiusPx,
  maxDensityOpacity,
  medianNearestNeighbourWorld,
} from "./node-density";
import {
  deriveZoomAttributes,
  HOVERED_MAX_MULTIPLIER,
  HOVERED_MIN_RADIUS,
  HOVERED_RADIUS_MULTIPLIER,
  NEIGHBOUR_MIN_RADIUS,
  POINT_MAX_RADIUS,
  POINT_RADIUS,
} from "./zoom-attributes";

import type { IconName } from "../../Icon/icon";
import type { BundledEdge } from "./edge-bundling";
import type {
  DetailIconAtlas,
  HoverableEdge,
  HoverLine,
  NetworkGraphId,
  NetworkGraphPoint,
  NetworkGraphEdge,
} from "./network-graph-util";
import type { Layer, OrthographicViewState, PickingInfo } from "@deck.gl/core";

// Re-export the data types so consumers can import them from the component's
// public entry point.
export type {
  NetworkGraphEdge,
  NetworkGraphId,
  NetworkGraphPoint,
} from "./network-graph-util";

/** A pointer interaction (hover or click) with a node in the network graph. */
export interface NetworkGraphInteraction {
  /** The node under the pointer, or `null` when over empty space. */
  point: NetworkGraphPoint | null;
  /** Pointer x position in pixels, relative to the chart's top-left corner. */
  x: number;
  /** Pointer y position in pixels, relative to the chart's top-left corner. */
  y: number;
  /**
   * The on-screen radius (px) of the emphasised node at the current zoom, so a
   * consumer can offset an anchored overlay (e.g. a tooltip) to clear the node.
   */
  nodeRadius: number;
  /** Which node rendering is showing: `"detailed"` (icons + label pills) or `"compact"` (plain points). */
  variant: "detailed" | "compact";
}

/** A pointer interaction (hover or click) with an edge in the network graph. */
export interface NetworkGraphEdgeInteraction {
  /** The edge under the pointer, or `null` when the pointer left all edges. */
  edge: NetworkGraphEdge | null;
  /** Pointer x position in pixels, relative to the chart's top-left corner. */
  x: number;
  /** Pointer y position in pixels, relative to the chart's top-left corner. */
  y: number;
}

/**
 * A node given as an explicit neighbourhood rather than a node id: the selected
 * `point`, its `edges`, and its `neighbours`. Items not already in the graph are
 * overlaid; items that are get reused rather than re-rendered.
 */
export interface NetworkGraphNeighbourhood {
  point: NetworkGraphPoint;
  edges: NetworkGraphEdge[];
  neighbours: NetworkGraphPoint[];
}

/**
 * An edge given with its two endpoint nodes rather than by id alone. The edge and
 * its endpoints travel with the selection, so a selected edge stays drawn and
 * anchored (its label pill and reported anchor included) even when the graph's
 * current `points`/`edges` don't contain it — e.g. the sparse tiles of a
 * zoomed-out tiling view, whose aggregated sample rarely includes a specific
 * located edge. Endpoints already in the graph are reused; ones that aren't are
 * overlaid.
 */
export interface NetworkGraphEdgeNeighbourhood {
  edge: NetworkGraphEdge;
  endpoints: [NetworkGraphPoint, NetworkGraphPoint];
}

/**
 * What is selected in the graph — a single node or a single edge; only one thing is
 * selectable at a time. The selection is highlighted with the same treatment as
 * hovering it, and an active hover takes precedence.
 *
 * - `{ node }` selects a node, given either the id of a node already in the graph or
 *   a {@link NetworkGraphNeighbourhood} to overlay (items already in the graph are
 *   reused).
 * - `{ edge }` selects an edge, given either the id of an edge in the graph or a
 *   {@link NetworkGraphEdgeNeighbourhood} carrying the edge with its endpoints (so
 *   it stays resolvable when the graph's own data doesn't include it).
 */
export type NetworkGraphSelection =
  | { node: NetworkGraphId | NetworkGraphNeighbourhood }
  | { edge: NetworkGraphId | NetworkGraphEdgeNeighbourhood };

/**
 * A {@link NetworkGraphSelection} broken into the parts the component consumes.
 * Shared by the `selected` and `hoveredByExternal` props, which take the same
 * shape.
 */
interface SelectionParts {
  /** The chosen node (id or an overlaid neighbourhood), or null for an edge/nothing. */
  node: NetworkGraphId | NetworkGraphNeighbourhood | null;
  /** The node overlay when the node was given as a neighbourhood, else null. */
  nodeOverlay: NetworkGraphNeighbourhood | null;
  /** The chosen edge's id, or null for a node/nothing. */
  edgeId: NetworkGraphId | null;
  /** The edge overlay when the edge was given with its endpoints, else null. */
  edgeOverlay: NetworkGraphEdgeNeighbourhood | null;
}

/** Decompose a selection (or the absence of one) into its {@link SelectionParts}. */
const selectionParts = (
  selection: NetworkGraphSelection | null | undefined,
): SelectionParts => {
  if (selection != null && "node" in selection) {
    const { node } = selection;
    return {
      node,
      nodeOverlay: typeof node === "object" ? node : null,
      edgeId: null,
      edgeOverlay: null,
    };
  }
  if (selection != null && "edge" in selection) {
    const { edge } = selection;
    const isOverlay = typeof edge === "object";
    return {
      node: null,
      nodeOverlay: null,
      edgeId: isOverlay ? edge.edge.id : edge,
      edgeOverlay: isOverlay ? edge : null,
    };
  }
  return { node: null, nodeOverlay: null, edgeId: null, edgeOverlay: null };
};

/**
 * The imperative API exposed via {@link NetworkGraphProps.ref}, letting a consumer
 * drive the zoom without the view state becoming controlled. Clamped to the
 * graph's own zoom limits.
 */
export interface NetworkGraphHandle {
  /** Zoom in one step ({@link ZOOM_STEP} zoom levels). */
  zoomIn: () => void;
  /** Zoom out one step. */
  zoomOut: () => void;
  /** Change the zoom by `delta` levels (log2: `+1` doubles the scale, `-1` halves it). */
  zoomBy: (delta: number) => void;
  /**
   * Bring a world-space point into view alongside the current viewport centre by
   * zooming out and panning so both sit {@link FOCUS_MARGIN} in from every edge.
   * No-op if the point is already visible. Clamped to the view's zoom-out and pan
   * limits.
   */
  revealPoint: (point: [number, number]) => void;
}

export interface NetworkGraphProps {
  /** The nodes to plot. */
  points: NetworkGraphPoint[];
  /** The connections between nodes. Only rendered while a node is hovered. */
  edges: NetworkGraphEdge[];
  /**
   * The graph's bounding box over the node coordinates. Used to frame the initial
   * view and to clamp panning to the network.
   */
  graphBounds: { minX: number; maxX: number; minY: number; maxY: number };
  /**
   * The camera's maximum zoom, as an absolute orthographic zoom (`2 ** zoom` =
   * pixels per world unit). Floored at the framing-out zoom so the range is never
   * inverted. Omit (or pass `null`) to fall back to a fixed offset above the
   * framed-in zoom — e.g. when node spacing is unknown. Non-tiled callers derive
   * it from node spacing via {@link maxZoomForNodeMinDistance}.
   */
  maxZoom?: number | null;
  /** Extra class name applied to the chart container. */
  className?: string;
  /**
   * The node or edge to highlight with the same treatment as hovering it — only one
   * thing is selectable at a time. See {@link NetworkGraphSelection}: `{ node }`
   * highlights a node (its edges, neighbour rings and a prominent node), `{ edge }`
   * an edge (bold stroke, direction arrow, endpoint outlines and a label pill). An
   * active hover takes precedence.
   */
  selected?: NetworkGraphSelection | null;
  /**
   * A node or edge to highlight with the **hover** treatment, driven from outside
   * the graph — e.g. hovering a search result elsewhere in the UI. Takes the same
   * shape as {@link NetworkGraphProps.selected} (see {@link NetworkGraphSelection});
   * like it, the nodes/edges may or may not already be in the graph — ones that
   * aren't are overlaid. It behaves exactly as an internal hover would: a live
   * pointer hover inside the graph takes precedence over it, and while it owns the
   * highlight a different `selected` node is backgrounded with a dimmed ring.
   */
  hoveredByExternal?: NetworkGraphSelection | null;
  /**
   * Called with the selection's on-screen anchor (CSS px from the chart's top-left)
   * whenever it changes — including on zoom/pan — or `null` when nothing is selected
   * or the anchor is outside the viewport. Lets a consumer anchor an overlay to the
   * selection and hide it while off screen. A selected node reports `type: "node"`
   * with its drawn `nodeRadius` (to offset an overlay clear of it) and node `variant`;
   * a selected edge reports `type: "edge"` at the centre of its on-screen portion
   * (where the label pill sits).
   */
  onSelectedPositionChange?: (
    position:
      | {
          type: "node";
          x: number;
          y: number;
          nodeRadius: number;
          variant: "detailed" | "compact";
        }
      | { type: "edge"; x: number; y: number }
      | null,
  ) => void;
  /**
   * Called when the hovered node changes, with the newly hovered node (or `null`)
   * and its pixel position.
   */
  onNodeHover?: (interaction: NetworkGraphInteraction) => void;
  /** Called when the chart is clicked, with the clicked node (or `null` for empty space). */
  onNodeClick?: (interaction: NetworkGraphInteraction) => void;
  /**
   * Called when the hovered edge changes, with the newly hovered edge (or `null`)
   * and its pixel position. Edges are hoverable in the detail view, and — while a
   * node is selected — in the compact view.
   */
  onEdgeHover?: (interaction: NetworkGraphEdgeInteraction) => void;
  /**
   * Called when an edge is clicked. Does not change the selection; to keep the clicked
   * edge highlighted, feed it back in via {@link NetworkGraphProps.selected} as
   * `{ edge: id }`.
   */
  onEdgeClick?: (interaction: NetworkGraphEdgeInteraction) => void;
  /**
   * Called when the zoom level changes with the framing-normalised zoom — `0` is the
   * fully-framed-out view and each `+1` doubles the on-screen scale, whatever the
   * graph's world extent — plus `framingBaseZoom`, the absolute orthographic zoom of
   * that framed-out view. Add them to recover the absolute zoom
   * (`2 ** (zoom + framingBaseZoom)` = pixels per world unit) for screen↔world
   * mapping. Not called for pure panning.
   */
  onZoom?: (zoom: number, framingBaseZoom: number) => void;
  /**
   * Called when the pan position changes, with the viewport centre in world
   * coordinates (`[x, y]`). Deduped like {@link NetworkGraphProps.onZoom}: fires only
   * when the centre actually moves, so a pure zoom that keeps the centre put won't
   * call it — but a zoom that re-anchors the view (e.g. zooming in toward the cursor,
   * or a zoom-out that reframes inward) will.
   */
  onPan?: (center: [number, number]) => void;
  /**
   * Imperative handle for driving the zoom from outside without making the view
   * state controlled. See {@link NetworkGraphHandle}.
   */
  ref?: React.Ref<NetworkGraphHandle>;
}

/** Zoom levels moved per {@link NetworkGraphHandle.zoomIn}/`zoomOut` call. */
const ZOOM_STEP = 1;
/**
 * Fraction of the viewport kept clear on each side when {@link
 * NetworkGraphHandle.revealPoint} frames a point, so both it and the centre land
 * within the central `1 − 2·FOCUS_MARGIN` of the view.
 */
const FOCUS_MARGIN = 0.2;
/** Furthest zoom-out keeps the whole network in view plus this fractional margin. */
const ZOOM_OUT_MARGIN = 0.05;
/**
 * Fallback furthest zoom-in (levels above the framing zoom), used only when the
 * `maxZoom` prop is unspecified (e.g. an empty/single-node graph, where node
 * spacing is unknown). Otherwise `maxZoom` comes from the caller.
 */
const MAX_ZOOM_OFFSET = 9;
/**
 * Screen-space margin (px) reserved when framing, so nodes near the edge aren't
 * clipped by their radius — the bounds cover node centres only, and a disc extends
 * past its centre.
 */
const FIT_MARGIN_PX = 60;
/**
 * Controller options, stable across renders so deck doesn't re-process the
 * controller each time. Double-click-to-zoom off: clicks are handled via
 * `pointerup` on the container instead.
 */
const CONTROLLER_OPTIONS = { doubleClickZoom: false } as const;
/** Pointer travel (px) above which a release is treated as a pan, not a click. */
const CLICK_MOVE_THRESHOLD_PX = 4;
/** Picking radius (px) used to resolve the node under a click. */
const CLICK_PICK_RADIUS_PX = 4;
const EDGE_PICK_RADIUS_PX = 5;
/**
 * Sublayer ids of the compact {@link CompactNodeLayer} carrying the selected node's own
 * highlight — its straight incident edges and its neighbour grow rings. Used to give
 * those elements pointer priority over the crowd (see `applyPickPriority`). They mirror
 * the ids the layer builds internally as `${id}-edges` / `${id}-highlight-neighbours`
 * with `id = "compact-nodes"`.
 */
const COMPACT_EDGES_LAYER_ID = "compact-nodes-edges";
const COMPACT_NEIGHBOURS_LAYER_ID = "compact-nodes-highlight-neighbours";
const COMPACT_ACTIVE_NODE_LAYER_ID = "compact-nodes-highlight-hovered";
/**
 * The compact sublayers holding the *backgrounded* selection's neighbourhood — its
 * faded edges and neighbour rings, drawn while a different node is hovered. Kept
 * pickable so the selection's neighbourhood keeps pointer priority over the hovered
 * node (see `applyPickPriority`).
 */
const COMPACT_DIMMED_EDGES_LAYER_ID = "compact-nodes-dimmed-selected-edges";
const COMPACT_DIMMED_NEIGHBOURS_LAYER_ID =
  "compact-nodes-dimmed-selected-neighbours";
/**
 * The compact sublayers whose picks are already a highlight element — an edge, a
 * neighbour ring, or the active node's ring. A primary pick on any of these is kept as
 * is; only a plain crowd-node (or empty) pick is a candidate for snapping to a nearby
 * highlight edge (see `applyPickPriority`).
 */
const COMPACT_HIGHLIGHT_LAYER_IDS = new Set<string>([
  COMPACT_EDGES_LAYER_ID,
  COMPACT_NEIGHBOURS_LAYER_ID,
  COMPACT_ACTIVE_NODE_LAYER_ID,
]);
const DETAIL_MAX_NODES = 1500;
const DETAIL_MAX_EDGES = 400;
/** Extra viewport margin (px) within which nodes are still included, so one straddling the edge isn't culled. */
const DETAIL_VIEWPORT_MARGIN_PX = 80;
/**
 * On-screen size (px) of the direction arrow at the target end of a highlighted
 * edge. (The gap to the node's edge is zoom-derived — see `arrowGapPx` in {@link
 * deriveZoomAttributes}.)
 */
const ARROW_SIZE_PX = 10;
/**
 * On-screen length (px) of the arrowhead from tip to base, so a highlighted edge can be
 * trimmed to stop at the arrowhead's base rather than run under it to the tip — where a
 * thickened edge's square end would otherwise poke out around the arrow point.
 */
const ARROW_HEAD_LENGTH_PX = ARROW_SIZE_PX * ARROW_HEAD_LENGTH_RATIO;
/**
 * Node half-extent (px) the pan clamp reserves so an edge node can be panned fully
 * into view rather than clipped at the viewport edge — the clamp works off the
 * node-*centre* bounds, so a disc's radius spills past the edge without it. Fixed at
 * the largest a node is ever drawn (the detail node's radius) so it covers every
 * zoom without measuring the live node size; the compact crowd points are smaller,
 * so they simply sit a little further in.
 */
const PAN_NODE_MARGIN_PX = DETAIL_NODE_DIAMETER / 2;

/** One direction arrow: where its tip sits and how it's oriented. */
interface EdgeArrow {
  /** Target node centre in world coords — stable across zoom/pan. */
  position: [number, number];
  /**
   * Screen-space pixel offset backing the tip off the node by `nodeRadius + gap`,
   * so the gap stays constant on screen regardless of zoom.
   */
  offset: [number, number];
  /** Rotation (deg) aligning the triangle with the edge's tangent at the target. */
  angle: number;
}

const containerStyles = css({
  position: "relative",
  width: "full",
  height: "full",
  overflow: "hidden",
  // deck.gl renders onto a transparent canvas; give it a surface to sit on.
  backgroundColor: "neutral.s05",
  cursor: "grab",
});

/**
 * The overlay canvas the hovered-edge label is drawn on, above the deck.gl canvas
 * and transparent to pointer events so it never intercepts hover/clicks.
 */
const labelCanvasStyles = css({
  position: "absolute",
  top: "0",
  left: "0",
  width: "full",
  height: "full",
  pointerEvents: "none",
});

/**
 * Eases a scalar toward `target` with an ease-out cubic over `durationMs`, so a
 * stepped input drifts rather than pops. Snaps on the first value (and where rAF is
 * unavailable), and `null` clears straight to `null`. The live value is kept in a ref
 * so each new target tweens from where the animation currently is without the effect
 * re-running every frame; the returned state drives re-renders.
 */
const useEasedValue = (
  target: number | null,
  durationMs: number,
): number | null => {
  const currentRef = useRef<number | null>(null);
  const [eased, setEased] = useState<number | null>(null);
  const rafRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (target === null) {
      currentRef.current = null;
      setEased(null);
      return undefined;
    }
    const from = currentRef.current;
    if (from === null || typeof requestAnimationFrame === "undefined") {
      currentRef.current = target;
      setEased(target);
      return undefined;
    }
    if (from === target) {
      return undefined;
    }
    let start: number | null = null;
    const step = (now: number) => {
      start ??= now;
      const progress = Math.min(1, (now - start) / durationMs);
      // Ease-out cubic.
      const amount = 1 - (1 - progress) ** 3;
      const value = from + (target - from) * amount;
      currentRef.current = value;
      setEased(value);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      }
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== undefined) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [target, durationMs]);
  return eased;
};

/** Duration (ms) over which a newly-added node grows from radius 0 to full. */
const NODE_ENTRANCE_MS = 400;
/** Duration (ms) over which a removed node shrinks to radius 0 before it's dropped. */
const NODE_EXIT_MS = 300;

/** An in-flight per-node radius transition. */
interface NodeTransition {
  /** Growing in (`enter` → scale 1) or shrinking out (`exit` → scale 0). */
  dir: "enter" | "exit";
  /** Start time (ms), stamped on the first frame so progress begins at 0. */
  start: number | null;
  /** Scale when the transition began, so an interrupted node eases from where it is. */
  from: number;
  /** Last computed scale, read when a transition is interrupted and reversed. */
  value: number;
  /**
   * The node's render data, retained so an exiting node keeps drawing after it has
   * left `points`. For an entering node it's just the current object.
   */
  point: NetworkGraphPoint;
}

/**
 * Animates node radii as nodes are added to and removed from `points`. The first
 * non-empty `points` — the initial load — appears at full size; afterwards:
 *
 * - a node absent last update grows in from radius 0 over {@link NODE_ENTRANCE_MS};
 * - a node present last update but now gone shrinks to radius 0 over {@link
 *   NODE_EXIT_MS} and is kept drawn until it finishes, then dropped;
 * - a transition interrupted by the opposite change reverses from its current scale.
 *
 * Returns `scaleById` (per-id radius multiplier; an id not present is at full size,
 * `1`), `exitingPoints` (nodes still shrinking out, to merge into the crowd's data so
 * they keep rendering after leaving `points`), and an `epoch` that changes each
 * animation frame, fed to the crowd points' `getRadius` `updateTriggers`.
 */
const useNodeRadiusTransitions = (
  points: NetworkGraphPoint[],
): {
  scaleById: Map<NetworkGraphId, number>;
  exitingPoints: NetworkGraphPoint[];
  epoch: number;
} => {
  // Whether the first non-empty `points` (shown at full size) has arrived.
  const loadedRef = useRef(false);
  // Nodes present at the last processed update, for diffing adds against removals.
  const prevByIdRef = useRef<Map<NetworkGraphId, NetworkGraphPoint>>(new Map());
  // In-flight transitions by id.
  const activeRef = useRef<Map<NetworkGraphId, NodeTransition>>(new Map());
  const rafRef = useRef<number | undefined>(undefined);
  const [scaleById, setScaleById] = useState<Map<NetworkGraphId, number>>(
    () => new Map(),
  );
  const [exitingPoints, setExitingPoints] = useState<NetworkGraphPoint[]>([]);
  const [epoch, setEpoch] = useState(0);

  // Layout effect, not passive, so the just-changed nodes are seeded at the right
  // scale in the same commit they render — an added node at 0 and a removed node at
  // its current scale — otherwise they'd pop for a frame before the animation ran.
  useLayoutEffect(() => {
    if (!loadedRef.current) {
      // Initial load: adopt the first non-empty set at full size, no animation.
      if (points.length > 0) {
        loadedRef.current = true;
        for (const point of points) {
          prevByIdRef.current.set(point.id, point);
        }
      }
      return;
    }
    if (typeof requestAnimationFrame === "undefined") {
      // No rAF (e.g. SSR/tests): adopt adds and drop removals immediately.
      prevByIdRef.current = new Map(points.map((point) => [point.id, point]));
      return;
    }

    const active = activeRef.current;
    const prev = prevByIdRef.current;
    const currentIds = new Set<NetworkGraphId>();
    for (const point of points) {
      currentIds.add(point.id);
    }

    let changed = false;
    let exitingChanged = false;
    // Added: present now, absent last update → grow in (reversing any in-flight exit).
    for (const point of points) {
      if (prev.has(point.id)) {
        continue;
      }
      const existing = active.get(point.id);
      if (existing?.dir === "exit") {
        exitingChanged = true;
      }
      active.set(point.id, {
        dir: "enter",
        start: null,
        from: existing?.value ?? 0,
        value: existing?.value ?? 0,
        point,
      });
      changed = true;
    }
    // Removed: present last update, absent now → shrink out, keeping the node drawn.
    for (const [id, point] of prev) {
      if (currentIds.has(id)) {
        continue;
      }
      const existing = active.get(id);
      active.set(id, {
        dir: "exit",
        start: null,
        from: existing?.value ?? 1,
        value: existing?.value ?? 1,
        point: existing?.point ?? point,
      });
      changed = true;
      exitingChanged = true;
    }

    prevByIdRef.current = new Map(points.map((point) => [point.id, point]));

    if (!changed) {
      return;
    }

    // Rebuild the retained exiting set (only when its membership changed, so the
    // merged crowd data stays reference-stable between frames of one animation).
    function syncExiting() {
      const list: NetworkGraphPoint[] = [];
      for (const transition of active.values()) {
        if (transition.dir === "exit") {
          list.push(transition.point);
        }
      }
      setExitingPoints(list);
    }
    // A function declaration (not an arrow) so the recursive rAF can reference it,
    // mirroring `useEasedValue`'s `step`. Reads live transitions from a ref, so a
    // change arriving mid-animation is folded into the same loop.
    function frame(now: number) {
      const next = new Map<NetworkGraphId, number>();
      let exitFinished = false;
      for (const [id, transition] of active) {
        // Stamp the start on the first frame so progress begins at 0, avoiding a
        // clock mismatch between this effect and the rAF timeline.
        transition.start ??= now;
        const start = transition.start;
        const duration =
          transition.dir === "enter" ? NODE_ENTRANCE_MS : NODE_EXIT_MS;
        const progress = Math.min(1, (now - start) / duration);
        // Ease-out cubic, matching `useEasedValue`.
        const eased = 1 - (1 - progress) ** 3;
        const target = transition.dir === "enter" ? 1 : 0;
        const value = transition.from + (target - transition.from) * eased;
        transition.value = value;
        if (progress >= 1) {
          active.delete(id);
          // A finished exit drops the node from the retained set; a finished enter
          // just settles (an absent id reads as full size).
          if (transition.dir === "exit") {
            exitFinished = true;
          }
          continue;
        }
        next.set(id, value);
      }
      setScaleById(next);
      setEpoch((value) => value + 1);
      if (exitFinished) {
        syncExiting();
      }
      rafRef.current =
        active.size > 0 ? requestAnimationFrame(frame) : undefined;
    }

    if (exitingChanged) {
      syncExiting();
    }
    // Run one frame synchronously — this is a layout effect, so before paint — to
    // seed the just-changed nodes. Cancel any in-flight frame first so a change
    // arriving mid-animation doesn't leave two loops running.
    if (rafRef.current !== undefined) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = undefined;
    }
    frame(performance.now());
  }, [points]);

  // Stop the animation loop on unmount.
  useEffect(
    () => () => {
      if (rafRef.current !== undefined) {
        cancelAnimationFrame(rafRef.current);
      }
    },
    [],
  );

  return { scaleById, exitingPoints, epoch };
};

/**
 * A GPU-accelerated scatterplot of a node/edge graph, rendered with deck.gl.
 *
 * Every node is drawn as a coloured point. Edges are hidden until a node is
 * hovered, at which point the node's incident edges — and the neighbours they
 * connect to — are highlighted. This keeps large graphs legible while still
 * letting you explore local connectivity.
 *
 * Zoomed all the way in, the node layer switches to a detailed variation:
 * larger nodes that show each node's {@link NetworkGraphPoint.icon} inside and
 * its {@link NetworkGraphPoint.label} in a pill beneath, with hover/selection
 * shown as a colour-matched outline rather than the node growing.
 */
export const NetworkGraph = ({
  points,
  edges,
  graphBounds,
  maxZoom: maxZoomProp,
  className,
  selected,
  hoveredByExternal,
  onSelectedPositionChange,
  onNodeHover,
  onNodeClick,
  onEdgeHover,
  onEdgeClick,
  onZoom,
  onPan,
  ref,
}: NetworkGraphProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const deckRef = useRef<DeckGLRef>(null);
  const labelCanvasRef = useRef<HTMLCanvasElement>(null);
  // Pointer-down position, to tell a click apart from a pan on release.
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null);
  // Last zoom reported to `onZoom`, so we only fire on actual zoom changes.
  const lastZoomRef = useRef<number | null>(null);
  // Last pan centre reported to `onPan`, so we only fire on actual pan changes.
  const lastCenterRef = useRef<[number, number] | null>(null);
  // Last hovered node id reported to `onNodeHover`, so we only fire on change.
  const lastHoveredIdRef = useRef<NetworkGraphId | null>(null);
  // Id of the currently hovered edge, so we only update state when it changes.
  const hoveredEdgeIdRef = useRef<NetworkGraphId | null>(null);
  const [viewState, setViewState] = useState<OrthographicViewState | null>(
    null,
  );
  // Container size (CSS px), tracked so the detail layers can cull points to the
  // viewport in world space.
  const [containerSize, setContainerSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  // Mask atlas of every icon used by the data, built once for the IconLayer.
  const [iconAtlas, setIconAtlas] = useState<DetailIconAtlas | null>(null);
  const [hovered, setHovered] = useState<NetworkGraphPoint | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<HoverableEdge | null>(null);

  const view = useMemo(() => new OrthographicView({ id: "network-graph" }), []);

  // Resolve each distinct hex colour to rgb once.
  const colorByHex = useMemo(() => {
    const map = new Map<string, [number, number, number]>();
    for (const point of points) {
      if (!map.has(point.color)) {
        map.set(point.color, hexToRgb(point.color));
      }
    }
    return map;
  }, [points]);

  const pointById = useMemo(() => {
    const map = new Map<NetworkGraphId, NetworkGraphPoint>();
    for (const point of points) {
      map.set(point.id, point);
    }
    return map;
  }, [points]);

  const edgeById = useMemo(() => {
    const map = new Map<NetworkGraphId, NetworkGraphEdge>();
    for (const edge of edges) {
      map.set(edge.id, edge);
    }
    return map;
  }, [edges]);

  // Per-id radius scale animating nodes in (0→1) as they're added and out (1→0) as
  // they're removed; the initial load and settled nodes are at full size.
  // `exitingPoints` are nodes still shrinking out after leaving `points`, merged back
  // into the crowd's data (and colour map) below so they keep drawing. `nodeScaleEpoch`
  // re-triggers the crowd points' radius each frame while a transition animates.
  const {
    scaleById: nodeScaleById,
    exitingPoints,
    epoch: nodeScaleEpoch,
  } = useNodeRadiusTransitions(points);

  // The crowd's node data: the current `points` plus any nodes still shrinking out, so
  // a removed node keeps rendering (at its shrinking radius) until its exit completes.
  const compactData = useMemo(
    () => (exitingPoints.length > 0 ? [...points, ...exitingPoints] : points),
    [points, exitingPoints],
  );

  // `selected` and `hoveredByExternal` share the same shape; decompose each into
  // the node/edge parts (and overlays) the rest of the component consumes.
  const selectedParts = useMemo(() => selectionParts(selected), [selected]);
  const externalHover = useMemo(
    () => selectionParts(hoveredByExternal),
    [hoveredByExternal],
  );

  // The node/edge overlays carried by either prop: their point/neighbours/endpoints
  // are drawn (and their ids resolvable) even when the graph's own `points`/`edges`
  // don't include them.
  const nodeOverlays = useMemo<NetworkGraphNeighbourhood[]>(
    () =>
      [selectedParts.nodeOverlay, externalHover.nodeOverlay].filter(
        (overlay): overlay is NetworkGraphNeighbourhood => overlay != null,
      ),
    [selectedParts.nodeOverlay, externalHover.nodeOverlay],
  );
  const edgeOverlays = useMemo<NetworkGraphEdgeNeighbourhood[]>(
    () =>
      [selectedParts.edgeOverlay, externalHover.edgeOverlay].filter(
        (overlay): overlay is NetworkGraphEdgeNeighbourhood => overlay != null,
      ),
    [selectedParts.edgeOverlay, externalHover.edgeOverlay],
  );

  /**
   * Every overlay's point + neighbours + endpoints **not** already in the graph —
   * the items to add. Existing items are omitted here so they aren't drawn twice.
   */
  const overlayPoints = useMemo<NetworkGraphPoint[]>(() => {
    if (nodeOverlays.length === 0 && edgeOverlays.length === 0) {
      return [];
    }
    const result: NetworkGraphPoint[] = [];
    const seen = new Set<NetworkGraphId>();
    const add = (point: NetworkGraphPoint) => {
      if (pointById.has(point.id) || seen.has(point.id)) {
        return;
      }
      seen.add(point.id);
      result.push(point);
    };
    for (const overlay of nodeOverlays) {
      add(overlay.point);
      for (const neighbour of overlay.neighbours) {
        add(neighbour);
      }
    }
    for (const overlay of edgeOverlays) {
      for (const endpoint of overlay.endpoints) {
        add(endpoint);
      }
    }
    return result;
  }, [nodeOverlays, edgeOverlays, pointById]);

  // Every node overlay's point + neighbours and every edge overlay's endpoints, keyed by id.
  const overlayPointById = useMemo(() => {
    const map = new Map<NetworkGraphId, NetworkGraphPoint>();
    for (const overlay of nodeOverlays) {
      map.set(overlay.point.id, overlay.point);
      for (const neighbour of overlay.neighbours) {
        map.set(neighbour.id, neighbour);
      }
    }
    for (const overlay of edgeOverlays) {
      for (const endpoint of overlay.endpoints) {
        map.set(endpoint.id, endpoint);
      }
    }
    return map;
  }, [nodeOverlays, edgeOverlays]);

  const overlayEdgeById = useMemo(() => {
    const map = new Map<NetworkGraphId, NetworkGraphEdge>();
    for (const overlay of nodeOverlays) {
      for (const edge of overlay.edges) {
        map.set(edge.id, edge);
      }
    }
    for (const overlay of edgeOverlays) {
      map.set(overlay.edge.id, overlay.edge);
    }
    return map;
  }, [nodeOverlays, edgeOverlays]);

  // Resolve a node/edge by id, preferring the graph item, falling back to an overlaid one.
  const resolvePoint = useCallback(
    (id: NetworkGraphId): NetworkGraphPoint | undefined =>
      pointById.get(id) ?? overlayPointById.get(id),
    [pointById, overlayPointById],
  );
  const resolveEdge = useCallback(
    (id: NetworkGraphId): NetworkGraphEdge | undefined =>
      edgeById.get(id) ?? overlayEdgeById.get(id),
    [edgeById, overlayEdgeById],
  );

  /** The two endpoint nodes of an edge, for the hover label and node outlines. */
  const endpointsOf = useCallback(
    (edge: NetworkGraphEdge): NetworkGraphPoint[] => {
      const from = resolvePoint(edge.fromId);
      const to = resolvePoint(edge.toId);
      return [from, to].filter(
        (point): point is NetworkGraphPoint => point !== undefined,
      );
    },
    [resolvePoint],
  );

  // A hover whose node has left the graph (e.g. tiling swapped the node set)
  // must not keep its grow ring/label under a stationary pointer. Derive the
  // effective hover so a departed node drops on the same render, rather than
  // clearing `hovered` from an effect (which cascades a second render).
  // `selected` is derived from props and heals on its own.
  const hoveredNode = hovered && resolvePoint(hovered.id) ? hovered : null;

  // When that node leaves, forget its id so `onNodeHover` change-detection
  // re-fires on the next pick. Raw `hovered` state lingers harmlessly until the
  // next pointer event replaces it.
  useEffect(() => {
    if (hovered && !resolvePoint(hovered.id)) {
      lastHoveredIdRef.current = null;
    }
  }, [hovered, resolvePoint]);

  // {@link colorByHex} extended with any overlay points' and exiting nodes' colours —
  // an exiting node has left `points` (so isn't in `colorByHex`) but still renders.
  const colorByHexWithOverlay = useMemo(() => {
    if (overlayPoints.length === 0 && exitingPoints.length === 0) {
      return colorByHex;
    }
    const map = new Map(colorByHex);
    for (const point of [...overlayPoints, ...exitingPoints]) {
      if (!map.has(point.color)) {
        map.set(point.color, hexToRgb(point.color));
      }
    }
    return map;
  }, [colorByHex, overlayPoints, exitingPoints]);

  // Adjacency list: node id → edges touching it.
  const adjacency = useMemo(() => {
    const map = new Map<NetworkGraphId, NetworkGraphEdge[]>();
    const push = (id: NetworkGraphId, edge: NetworkGraphEdge) => {
      const list = map.get(id);
      if (list) {
        list.push(edge);
      } else {
        map.set(id, [edge]);
      }
    };
    for (const edge of edges) {
      push(edge.fromId, edge);
      push(edge.toId, edge);
    }
    return map;
  }, [edges]);

  /**
   * Resolve a selection's node (by id, or an overlay's `point`, preferring the
   * graph's copy when that id exists) to its point. Null for an id not in the graph,
   * or when the selection is an edge / nothing.
   */
  const resolveNodePoint = useCallback(
    (
      node: NetworkGraphId | NetworkGraphNeighbourhood | null,
    ): NetworkGraphPoint | null => {
      if (node == null) {
        return null;
      }
      if (typeof node === "object") {
        return pointById.get(node.point.id) ?? node.point;
      }
      return pointById.get(node) ?? null;
    },
    [pointById],
  );

  // The `selected` node as a point, and the `hoveredByExternal` node as a point.
  const selectedPoint = useMemo(
    () => resolveNodePoint(selectedParts.node),
    [resolveNodePoint, selectedParts.node],
  );
  const externalHoveredPoint = useMemo(
    () => resolveNodePoint(externalHover.node),
    [resolveNodePoint, externalHover.node],
  );

  // A live pointer hover inside the graph (a node or an edge) suppresses the
  // external hover entirely, so an internal hover always takes precedence.
  const internalHoverActive = hoveredNode != null || hoveredEdge != null;

  // The node driving the active hover highlight: the internal pointer hover, else —
  // when nothing is hovered inside the graph — the externally-hovered node.
  const activeHoveredNode =
    hoveredNode ?? (internalHoverActive ? null : externalHoveredPoint);

  // The node whose neighbourhood is highlighted: hovered (internal or external),
  // else selected.
  const activeNode = useMemo(
    () => activeHoveredNode ?? selectedPoint,
    [activeHoveredNode, selectedPoint],
  );

  // The neighbourhood overlay (from either prop) whose point is the active node, so
  // its provided edges/neighbours drive the highlight rather than the graph's own
  // adjacency. Null when the active node isn't an overlaid one.
  const activeNodeOverlay = useMemo<NetworkGraphNeighbourhood | null>(() => {
    if (!activeNode) {
      return null;
    }
    return (
      nodeOverlays.find((overlay) => overlay.point.id === activeNode.id) ?? null
    );
  }, [activeNode, nodeOverlays]);

  /**
   * The selected node while a *different* node owns the active hover (internal or
   * external): backgrounded, so it keeps a dimmed selected ring while the hovered
   * node owns the active highlight (edges + neighbours). Null when nothing's
   * hovered, or the hover is the selection itself.
   */
  const dimmedSelectedNode = useMemo(
    () =>
      activeHoveredNode &&
      selectedPoint &&
      activeHoveredNode.id !== selectedPoint.id
        ? selectedPoint
        : null,
    [activeHoveredNode, selectedPoint],
  );

  /**
   * A node's neighbourhood for the highlight: its incident edges as straight
   * node-centre lines and its neighbour points. Taken from a selection overlay's
   * provided `edges`/`neighbours` when the node is an overlaid one, else from the
   * graph's adjacency. Null for no node. Backs both the active node's `highlight`
   * and the backgrounded selection's faded neighbourhood.
   */
  const neighbourhoodOf = useCallback(
    (
      node: NetworkGraphPoint | null,
    ): { lines: HoverLine[]; neighbours: NetworkGraphPoint[] } | null => {
      if (!node) {
        return null;
      }
      const overlay =
        nodeOverlays.find((candidate) => candidate.point.id === node.id) ??
        null;
      const incident = overlay ? overlay.edges : (adjacency.get(node.id) ?? []);
      const lines: HoverLine[] = [];
      const neighbourIds = new Set<NetworkGraphId>();
      for (const edge of incident) {
        const from = resolvePoint(edge.fromId);
        const to = resolvePoint(edge.toId);
        if (!from || !to) {
          continue;
        }
        lines.push({
          id: edge.id,
          source: [from.x, from.y],
          target: [to.x, to.y],
        });
        neighbourIds.add(edge.fromId === node.id ? edge.toId : edge.fromId);
      }
      const neighbours: NetworkGraphPoint[] = [];
      if (overlay) {
        // Use the explicitly-provided neighbours, resolved to their graph copy.
        for (const neighbour of overlay.neighbours) {
          const point = resolvePoint(neighbour.id);
          if (point) {
            neighbours.push(point);
          }
        }
      } else {
        for (const id of neighbourIds) {
          const point = resolvePoint(id);
          if (point) {
            neighbours.push(point);
          }
        }
      }
      return { lines, neighbours };
    },
    [nodeOverlays, adjacency, resolvePoint],
  );

  /**
   * Edges + neighbour nodes for the active node. Taken from an overlay selection's
   * provided `edges`/`neighbours` when it is the active node, else from the graph's
   * adjacency.
   */
  const highlight = useMemo(
    () => neighbourhoodOf(activeNode),
    [neighbourhoodOf, activeNode],
  );

  /** Frame the graph to fit the container on mount and on resize. */
  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }
    const fit = () => {
      const { width, height } = element.getBoundingClientRect();
      if (!width || !height) {
        return;
      }
      setContainerSize({ width, height });
      const padding = 0.9;
      const outPadding = 1 / (1 + ZOOM_OUT_MARGIN);
      const graphWidth = graphBounds.maxX - graphBounds.minX;
      const graphHeight = graphBounds.maxY - graphBounds.minY;
      // Largest zoom at which the centre bounds fit within `paddingFraction` of the
      // viewport, reserving `FIT_MARGIN_PX` for node radii. Tighter axis wins.
      const fitZoom = (paddingFraction: number) =>
        Math.min(
          Math.log2(
            Math.max(1, width * paddingFraction - FIT_MARGIN_PX) /
              (graphWidth || 1),
          ),
          Math.log2(
            Math.max(1, height * paddingFraction - FIT_MARGIN_PX) /
              (graphHeight || 1),
          ),
        );
      const framingZoom = fitZoom(padding);
      // Cap zoom-out so the whole network plus a `ZOOM_OUT_MARGIN` margin fills the
      // viewport. This framing-out zoom is also the graph's zero reference: the view
      // opens here and the zoom-dependent attributes rebase against it (see
      // `framingBaseZoom`), so the framing-normalised zoom starts at 0 for any dataset
      // regardless of its world extent.
      const minZoom = fitZoom(outPadding);
      // Furthest zoom-in comes from the caller (see the `maxZoom` prop), floored at
      // `minZoom` so a sparse graph never yields an inverted range, and falling back
      // to a fixed offset above the framed-in zoom when unspecified. The normalised
      // range the view exposes is `maxZoom − minZoom`: min fits the graph's extent,
      // max the node spacing, so it's the node-spacing↔extent ratio, independent of
      // the absolute world size.
      const maxZoom = Math.max(
        minZoom,
        maxZoomProp ?? framingZoom + MAX_ZOOM_OFFSET,
      );
      // Only auto-frame until the user takes control of the view.
      setViewState(
        (previous) =>
          previous ?? {
            target: [
              (graphBounds.minX + graphBounds.maxX) / 2,
              (graphBounds.minY + graphBounds.maxY) / 2,
              0,
            ],
            // Start fully zoomed out (normalised zoom 0).
            zoom: minZoom,
            minZoom,
            maxZoom,
          },
      );
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => observer.disconnect();
  }, [graphBounds, maxZoomProp]);

  // Distinct icon names used by the graph points.
  const pointIconNames = useMemo(
    () => [
      ...new Set(points.flatMap((point) => (point.icon ? [point.icon] : []))),
    ],
    [points],
  );

  /**
   * A stable key over the distinct icon names (points + overlay points) so the
   * atlas is rebuilt only when the icon *set* changes, not on every selection.
   */
  const iconNamesKey = useMemo(() => {
    const set = new Set(pointIconNames);
    for (const point of overlayPoints) {
      if (point.icon) {
        set.add(point.icon);
      }
    }
    return [...set].sort().join(" ");
  }, [pointIconNames, overlayPoints]);

  /**
   * Rasterise every icon used by the data (and overlaid points) into a single mask
   * atlas for the detail {@link IconLayer}. Async — icons appear once loaded.
   */
  useEffect(() => {
    const names = iconNamesKey ? iconNamesKey.split(" ") : [];
    if (names.length === 0) {
      return;
    }
    const cell = DETAIL_ICON_TEXTURE;
    const columns = Math.ceil(Math.sqrt(names.length));
    const rows = Math.ceil(names.length / columns);
    const canvas = document.createElement("canvas");
    canvas.width = columns * cell;
    canvas.height = rows * cell;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    const mapping: DetailIconAtlas["mapping"] = {};
    let cancelled = false;
    void Promise.all(
      names.map(
        (name, index) =>
          new Promise<void>((resolve) => {
            const image = new Image();
            image.onload = () => {
              const x = (index % columns) * cell;
              const y = Math.floor(index / columns) * cell;
              ctx.drawImage(image, x, y, cell, cell);
              mapping[name] = {
                x,
                y,
                width: cell,
                height: cell,
                mask: true,
                anchorX: cell / 2,
                anchorY: cell / 2,
              };
              resolve();
            };
            image.onerror = () => resolve();
            // `name` came from a point's `icon` (an `IconName`) via the string key.
            image.src = iconTextureUrl(name as IconName);
          }),
      ),
    ).then(() => {
      if (!cancelled) {
        setIconAtlas({ url: canvas.toDataURL(), mapping });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [iconNamesKey]);

  // Current zoom as a single number (orthographic zoom may be a pair).
  const currentZoom = useMemo(() => {
    const zoom = viewState?.zoom;
    if (zoom === undefined) {
      return null;
    }
    return Array.isArray(zoom) ? zoom[0] : zoom;
  }, [viewState?.zoom]);

  // Current pan centre in world coords (`[x, y]`), or null before the view is framed.
  const currentCenter = useMemo<[number, number] | null>(() => {
    const target = viewState?.target;
    if (!target) {
      return null;
    }
    return [target[0], target[1]];
  }, [viewState?.target]);

  // The framing-out zoom (`minZoom`) is the graph's zero reference: the zoom-dependent
  // attributes work in framing-normalised zoom (0 = framed out), so we rebase the
  // absolute orthographic zoom by it below. The absolute zoom stays the source of
  // truth for deck and the geometry (pan clamps, edge trims, `onZoom`); only these
  // presentation attributes are normalised, so they frame every dataset alike.
  const framingBaseZoom = viewState?.minZoom ?? null;

  // Everything the view derives from the current zoom, computed together by {@link deriveZoomAttributes}.
  const { radiusScale, arrowGapPx, isDetailZoom } = useMemo(
    () =>
      deriveZoomAttributes(
        currentZoom != null && framingBaseZoom != null
          ? currentZoom - framingBaseZoom
          : null,
        // Detail view shows in the top 0.5 zoom levels, just below the max zoom —
        // expressed here on the normalised axis (`maxZoom − framingBase − 0.5`).
        viewState?.maxZoom != null && framingBaseZoom != null
          ? viewState.maxZoom - framingBaseZoom - 0.5
          : null,
      ),
    [currentZoom, viewState?.maxZoom, framingBaseZoom],
  );

  // Density sizing measured as a world-space inter-node spacing, later multiplied by
  // the live world→pixel scale so plain zooming stays smooth. Two measures are
  // blended by DENSITY_AREAL_WEIGHT:
  //  - nearest-neighbour: a property of the node set, so it only re-measures when the
  //    set changes.
  //  - areal: √(viewport area / visible count), so it re-measures as the viewport
  //    pans/zooms (which nodes are visible, and over how much world, both change).
  const nearestNeighbourSpacing = useMemo(
    () => medianNearestNeighbourWorld(points),
    [points],
  );
  const arealSpacing = useMemo(() => {
    if (
      currentCenter === null ||
      currentZoom === null ||
      containerSize === null
    ) {
      return null;
    }
    const scale = 2 ** currentZoom;
    const halfWidth = containerSize.width / (2 * scale);
    const halfHeight = containerSize.height / (2 * scale);
    const worldArea =
      (containerSize.width * containerSize.height) / (scale * scale);
    const visible = countPointsInRect(
      points,
      currentCenter[0] - halfWidth,
      currentCenter[1] - halfHeight,
      currentCenter[0] + halfWidth,
      currentCenter[1] + halfHeight,
    );
    return arealSpacingWorld(visible, worldArea);
  }, [points, currentCenter, currentZoom, containerSize]);
  const targetSpacing = blendSpacing(
    nearestNeighbourSpacing,
    arealSpacing,
    DENSITY_AREAL_WEIGHT,
  );

  // The eased density spacing, tweened toward `targetSpacing` over DENSITY_EASE_MS so
  // a tile-depth swap drifts the node size rather than popping it.
  const easedSpacing = useEasedValue(targetSpacing, DENSITY_EASE_MS);

  // Compact crowd opacity from the max local density — the tightest (nearest-neighbour)
  // packing, on screen: denser packing pulls toward the lower opacity, sparser toward
  // the upper (see maxDensityOpacity). Eased over the same duration as the spacing so it
  // drifts rather than pops when the estimate steps.
  const targetOpacity = useMemo(
    () =>
      currentZoom === null
        ? COMPACT_OPACITY_SPARSE
        : maxDensityOpacity(nearestNeighbourSpacing, 2 ** currentZoom),
    [nearestNeighbourSpacing, currentZoom],
  );
  const pointOpacity =
    useEasedValue(targetOpacity, DENSITY_EASE_MS) ?? targetOpacity;

  // The crowd radius tracks on-screen inter-node spacing (`getRadius · radiusScale`,
  // with `getRadius = POINT_RADIUS`). Falls back to the zoom-derived scale until the
  // spacing has been measured (before the first frame, or a <2-node graph).
  const effectiveRadiusScale = useMemo(() => {
    if (easedSpacing === null || currentZoom === null) {
      return radiusScale;
    }
    return densityPointRadiusPx(easedSpacing, 2 ** currentZoom) / POINT_RADIUS;
  }, [easedSpacing, currentZoom, radiusScale]);

  /**
   * The on-screen radius (px) of an emphasised node as drawn: the grown ring
   * clamped to its pixel range (compact), or the detailed node's circle. Reported
   * to consumers so an anchored overlay can be offset to clear it.
   */
  const activeNodeRadius = useMemo(
    () =>
      isDetailZoom
        ? DETAIL_NODE_DIAMETER / 2
        : Math.min(
            POINT_MAX_RADIUS * HOVERED_MAX_MULTIPLIER,
            Math.max(
              HOVERED_MIN_RADIUS,
              POINT_RADIUS * HOVERED_RADIUS_MULTIPLIER * effectiveRadiusScale,
            ),
          ),
    [isDetailZoom, effectiveRadiusScale],
  );

  /** Which node rendering is showing, reported to consumers alongside position. */
  const nodeVariant: "detailed" | "compact" = isDetailZoom
    ? "detailed"
    : "compact";

  // Bounding box of the nodes actually being rendered, or null when there are none.
  const pointsBounds = useMemo(() => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const point of points) {
      if (point.x < minX) {
        minX = point.x;
      }
      if (point.x > maxX) {
        maxX = point.x;
      }
      if (point.y < minY) {
        minY = point.y;
      }
      if (point.y > maxY) {
        maxY = point.y;
      }
    }
    return Number.isFinite(minX) ? { minX, maxX, minY, maxY } : null;
  }, [points]);

  /**
   * The bounds the pan clamp uses: `graphBounds` widened to include any rendered node
   * beyond it. A streaming/tiled caller's `graphBounds` can lag the true extent —
   * e.g. frozen from a coarse overview sample — so nodes stream in outside it; without
   * this widening the clamp would stop at the stale bounds and those edge nodes could
   * never be panned into view. `graphBounds` alone still drives the initial framing
   * (see the fit effect), so the opening view is unchanged.
   */
  const panBounds = useMemo(() => {
    if (!pointsBounds) {
      return graphBounds;
    }
    return {
      minX: Math.min(graphBounds.minX, pointsBounds.minX),
      maxX: Math.max(graphBounds.maxX, pointsBounds.maxX),
      minY: Math.min(graphBounds.minY, pointsBounds.minY),
      maxY: Math.max(graphBounds.maxY, pointsBounds.maxY),
    };
  }, [graphBounds, pointsBounds]);
  // Mirror into a ref so the imperative zoom/reveal callbacks read the latest bounds
  // without re-creating as points stream in.
  const panBoundsRef = useRef(panBounds);
  useEffect(() => {
    panBoundsRef.current = panBounds;
  }, [panBounds]);

  /**
   * The node ids at the two ends of the selected edge (compact view), so those nodes get
   * pointer priority on hover — like a selected node's neighbours — and hovering one
   * highlights it rather than a node beneath or overlapping it. Empty unless an edge is
   * selected.
   */
  const selectedEdgeEndpointIds = useMemo<ReadonlySet<NetworkGraphId>>(() => {
    if (isDetailZoom || selectedParts.edgeId == null) {
      return new Set<NetworkGraphId>();
    }
    const edge = resolveEdge(selectedParts.edgeId);
    return edge
      ? new Set<NetworkGraphId>([edge.fromId, edge.toId])
      : new Set<NetworkGraphId>();
  }, [isDetailZoom, selectedParts.edgeId, resolveEdge]);

  /**
   * Whether a node *or edge* is selected in the compact view. While this holds, the
   * highlight's grown node rings (the active node's and its neighbours', or a selected
   * edge's endpoints') are pickable enlarged hitboxes that take pointer priority over the
   * crowd — held across an in-flight hover (not just when the selection owns the
   * highlight) so promoting a neighbour to the active node keeps its ring a stable target.
   */
  const compactHasSelection =
    !isDetailZoom && (selectedPoint != null || selectedParts.edgeId != null);

  /**
   * Whether the selected node owns the active highlight in the compact view — a node is
   * selected and nothing else is hovered, so its edges are drawn and interactive. While
   * this holds, a thin highlight edge takes pointer priority over the crowd (see
   * `applyPickPriority`), matching when the edge layer is pickable.
   */
  const compactSelectionActive =
    compactHasSelection && dimmedSelectedNode == null;

  /**
   * Give the selected node's neighbourhood priority when resolving a pointer pick in the
   * compact view, so its edges and neighbours win over the crowd — and over a node
   * hovered elsewhere. Two cases:
   *
   * - The selection owns the active highlight (nothing else hovered): deck already draws
   *   its edges and neighbour rings above the crowd, so a direct overlap resolves to
   *   them; on top of that, when the primary pick lands on a plain crowd node (or empty
   *   space) this snaps to a highlight edge within tolerance, so a thin edge wins over a
   *   node beneath or beside it. A primary already on a highlight element is kept as is.
   * - A different node is hovered, so the selection is backgrounded (dimmed): its faded
   *   edges and neighbour rings sit *below* the hovered node's highlight, so z-order
   *   alone wouldn't pick them. Here we prefer a pick on those (dimmed) layers over the
   *   primary, so hovering the selection's neighbour/edge re-highlights it rather than
   *   the hovered node overlapping it.
   *
   * Returns the primary pick unchanged unless a node is selected (compact).
   */
  const applyPickPriority = useCallback(
    (
      primary: PickingInfo | null,
      x: number,
      y: number,
      radius: number,
    ): PickingInfo | null => {
      if (!compactHasSelection) {
        return primary;
      }
      // An edge is selected: prioritise the nodes it connects. Their rings sit in the
      // neighbour layer (below any hovered node's highlight), so prefer a pick there on
      // an endpoint over the primary — hovering an endpoint highlights it rather than a
      // node beneath or overlapping it.
      if (selectedEdgeEndpointIds.size > 0) {
        const endpointPick = deckRef.current?.pickObject({
          x,
          y,
          radius,
          layerIds: [COMPACT_NEIGHBOURS_LAYER_ID],
        });
        const object = endpointPick?.object as NetworkGraphPoint | undefined;
        if (endpointPick && object && selectedEdgeEndpointIds.has(object.id)) {
          return endpointPick;
        }
        return primary;
      }
      if (compactSelectionActive) {
        // A primary already on the selection's on-top highlight is kept; otherwise snap
        // a near-miss to its thin edge.
        const layerId = primary?.layer?.id;
        if (layerId != null && COMPACT_HIGHLIGHT_LAYER_IDS.has(layerId)) {
          return primary;
        }
        const edge = deckRef.current?.pickObject({
          x,
          y,
          radius,
          layerIds: [COMPACT_EDGES_LAYER_ID],
        });
        return edge?.object ? edge : primary;
      }
      // Backgrounded selection: prefer its dimmed neighbourhood over the hovered node.
      const selection = deckRef.current?.pickObject({
        x,
        y,
        radius,
        layerIds: [
          COMPACT_DIMMED_NEIGHBOURS_LAYER_ID,
          COMPACT_DIMMED_EDGES_LAYER_ID,
        ],
      });
      return selection?.object ? selection : primary;
    },
    [compactHasSelection, compactSelectionActive, selectedEdgeEndpointIds],
  );

  const handlePointerDown = useCallback((event: React.PointerEvent) => {
    pointerDownRef.current = { x: event.clientX, y: event.clientY };
  }, []);

  // Handle clicks off native `pointerup` rather than deck.gl's `onClick`: deck
  // delays its click ~300ms to disambiguate a double-click, making selection feel
  // laggy. Picking synchronously here fires instantly.
  const handlePointerUp = useCallback(
    (event: React.PointerEvent) => {
      const down = pointerDownRef.current;
      pointerDownRef.current = null;
      const deck = deckRef.current;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!down || !deck || !rect) {
        return;
      }
      // A release that moved more than the threshold is a pan, not a click.
      if (
        Math.hypot(event.clientX - down.x, event.clientY - down.y) >
        CLICK_MOVE_THRESHOLD_PX
      ) {
        return;
      }
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      // Exactly one node sublayer is pickable at a time (compact points zoomed out,
      // detailed nodes zoomed in), so no `layerIds` filter is needed here.
      const primary = deck.pickObject({
        x,
        y,
        radius: CLICK_PICK_RADIUS_PX,
      });
      // Arrows are pickable (compact) only to intercept picks in the arrow gap; a
      // click on one is a no-op. Checked on the raw pick before applying priority so
      // the arrow still shields the gap.
      if (primary?.layer?.id === "edge-arrows") {
        return;
      }
      // Let the selected node's edges/neighbours win over the crowd (compact), so a
      // click lands on the same element a hover would (see `applyPickPriority`).
      const info = applyPickPriority(primary, x, y, CLICK_PICK_RADIUS_PX);
      const object =
        (info?.object as
          | NetworkGraphPoint
          | HoverLine
          | BundledEdge
          | undefined) ?? null;
      // A click on an edge (it carries `path` or `source`, not node fields) fires
      // `onEdgeClick`, leaving the node selection intact.
      if (object && "path" in object) {
        onEdgeClick?.({ edge: resolveEdge(object.edgeId) ?? null, x, y });
        return;
      }
      if (object && "source" in object) {
        onEdgeClick?.({ edge: resolveEdge(object.id) ?? null, x, y });
        return;
      }
      // Narrowed to a node (or null) by the guards above.
      onNodeClick?.({
        point: object,
        x,
        y,
        nodeRadius: activeNodeRadius,
        variant: nodeVariant,
      });
    },
    [
      onNodeClick,
      onEdgeClick,
      resolveEdge,
      activeNodeRadius,
      nodeVariant,
      applyPickPriority,
    ],
  );

  // Report zoom changes from an effect (after commit), not inline: `setViewState`
  // updaters run during render, so calling `onZoom` there would update the parent
  // mid-render. Deduped (on the absolute zoom) so it fires only on an actual change,
  // and reports the framing-normalised zoom plus the framing base (see `onZoom`).
  useEffect(() => {
    if (currentZoom === null || currentZoom === lastZoomRef.current) {
      return;
    }
    lastZoomRef.current = currentZoom;
    const base = framingBaseZoom ?? 0;
    onZoom?.(currentZoom - base, base);
  }, [currentZoom, onZoom, framingBaseZoom]);

  // Report pan changes from an effect (after commit) for the same reason as
  // `onZoom` above: `setViewState` updaters run during render. Deduped on the
  // centre so it fires only when the pan position actually moves.
  useEffect(() => {
    if (currentCenter === null) {
      return;
    }
    const last = lastCenterRef.current;
    if (last && last[0] === currentCenter[0] && last[1] === currentCenter[1]) {
      return;
    }
    lastCenterRef.current = currentCenter;
    onPan?.(currentCenter);
  }, [currentCenter, onPan]);

  /**
   * Nudge the zoom by `delta` levels about the viewport centre, clamped to
   * `minZoom`/`maxZoom`. A zoom-in leaves the pan `target` untouched so it never
   * yanks the view sideways; a zoom-out hard-clamps the target on every edge (see
   * {@link clampPanTarget}) so the network stays framed — matching the wheel path.
   * Backs the imperative {@link NetworkGraphHandle}.
   */
  const applyZoomDelta = useCallback((delta: number) => {
    if (!delta) {
      return;
    }
    setViewState((previous) => {
      if (!previous) {
        return previous;
      }
      const current = Array.isArray(previous.zoom)
        ? previous.zoom[0]
        : (previous.zoom ?? 0);
      const next = Math.max(
        previous.minZoom ?? -Infinity,
        Math.min(previous.maxZoom ?? Infinity, current + delta),
      );
      if (next === current) {
        // Already at the limit — avoid a needless re-render.
        return previous;
      }
      // Zooming out re-clamps the target to keep the network framed; zooming in doesn't.
      const rect = containerRef.current?.getBoundingClientRect();
      const target =
        next < current && rect && previous.target
          ? clampPanTarget(
              previous.target as number[],
              2 ** next,
              rect.width,
              rect.height,
              panBoundsRef.current,
              PAN_NODE_MARGIN_PX,
            )
          : previous.target;
      return { ...previous, zoom: next, target };
    });
  }, []);

  /**
   * Bring `point` into view alongside the current viewport centre: no-op if already
   * visible; otherwise centre on the midpoint and zoom out (never in) just enough
   * that both sit {@link FOCUS_MARGIN} in from the edges. Clamped to `minZoom` and
   * the network bounds.
   */
  const revealPoint = useCallback(
    (point: [number, number]) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect || !rect.width || !rect.height) {
        return;
      }
      const { width, height } = rect;
      setViewState((previous) => {
        if (!previous?.target) {
          return previous;
        }
        const viewport = view.makeViewport({
          width,
          height,
          viewState: previous,
        });
        if (!viewport) {
          return previous;
        }
        // Already within the viewport → leave the view untouched.
        const [screenX = 0, screenY = 0] = viewport.project([
          point[0],
          point[1],
        ]);
        if (
          screenX >= 0 &&
          screenX <= width &&
          screenY >= 0 &&
          screenY <= height
        ) {
          return previous;
        }
        const current = Array.isArray(previous.zoom)
          ? previous.zoom[0]
          : (previous.zoom ?? 0);
        const target = previous.target as number[];
        const centreX = target[0] ?? 0;
        const centreY = target[1] ?? 0;
        // Fit the point↔centre span within the central `1 − 2·margin` of each axis,
        // then only zoom out from the current level — never in.
        const usable = 1 - 2 * FOCUS_MARGIN;
        const spanX = Math.abs(point[0] - centreX);
        const spanY = Math.abs(point[1] - centreY);
        const fitZoom = Math.min(
          spanX > 0 ? Math.log2((usable * width) / spanX) : Infinity,
          spanY > 0 ? Math.log2((usable * height) / spanY) : Infinity,
        );
        const next = Math.max(
          previous.minZoom ?? -Infinity,
          Math.min(previous.maxZoom ?? Infinity, Math.min(current, fitZoom)),
        );
        const nextTarget = clampPanTarget(
          [(point[0] + centreX) / 2, (point[1] + centreY) / 2, 0],
          2 ** next,
          width,
          height,
          panBoundsRef.current,
          PAN_NODE_MARGIN_PX,
        );
        return { ...previous, zoom: next, target: nextTarget };
      });
    },
    [view],
  );

  useImperativeHandle(
    ref,
    () => ({
      zoomIn: () => applyZoomDelta(ZOOM_STEP),
      zoomOut: () => applyZoomDelta(-ZOOM_STEP),
      zoomBy: applyZoomDelta,
      revealPoint,
    }),
    [applyZoomDelta, revealPoint],
  );

  /**
   * The node hierarchy used to bundle detail-view edges. Viewport-independent, so
   * built once per node set.
   */
  const bundleHierarchy = useMemo(() => buildBundleHierarchy(points), [points]);

  /**
   * Build an edge id into a {@link HoverableEdge} so it can get the same emphasis as
   * a hovered edge. Its `path` matches how the edge is drawn in the current view
   * (bundled curve in detail, straight line in compact) so the label lands on the
   * edge. Null when the edge or an endpoint can't be resolved.
   */
  const buildEdgeHoverable = useCallback(
    (edgeId: NetworkGraphId | null): HoverableEdge | null => {
      if (edgeId == null) {
        return null;
      }
      const edge = resolveEdge(edgeId);
      if (!edge) {
        return null;
      }
      const from = resolvePoint(edge.fromId);
      const to = resolvePoint(edge.toId);
      if (!from || !to) {
        return null;
      }
      const path: [number, number][] = isDetailZoom
        ? bundleEdgePath(from, to, bundleHierarchy)
        : [
            [from.x, from.y],
            [to.x, to.y],
          ];
      return { edgeId: edge.id, path, endpoints: [from, to] };
    },
    [resolveEdge, resolvePoint, isDetailZoom, bundleHierarchy],
  );

  // The `selected` edge and the `hoveredByExternal` edge as hoverable edges.
  const selectedEdgeHoverable = useMemo(
    () => buildEdgeHoverable(selectedParts.edgeId),
    [buildEdgeHoverable, selectedParts.edgeId],
  );
  const externalHoveredEdgeHoverable = useMemo(
    () => buildEdgeHoverable(externalHover.edgeId),
    [buildEdgeHoverable, externalHover.edgeId],
  );

  /**
   * Report the selection's on-screen anchor, re-projecting on every view change so a
   * consumer's overlay tracks it as the view zooms/pans. A selected node reports its
   * projected centre, drawn radius and node variant; a selected edge reports the
   * centre of its on-screen portion (where the label pill sits). Reports `null` while
   * the anchor lies off screen, so an anchored overlay is hidden until it returns.
   */
  useEffect(() => {
    if (!onSelectedPositionChange) {
      return;
    }
    const element = containerRef.current;
    if (!element || !viewState) {
      onSelectedPositionChange(null);
      return;
    }
    const { width, height } = element.getBoundingClientRect();
    const viewport = view.makeViewport({ width, height, viewState });
    if (!viewport) {
      onSelectedPositionChange(null);
      return;
    }
    if (selectedPoint) {
      const [x = 0, y = 0] = viewport.project([
        selectedPoint.x,
        selectedPoint.y,
      ]);
      // Hide once the anchor leaves the viewport; show again when it comes back.
      if (x < 0 || x > width || y < 0 || y > height) {
        onSelectedPositionChange(null);
        return;
      }
      onSelectedPositionChange({
        type: "node",
        x,
        y,
        nodeRadius: activeNodeRadius,
        variant: nodeVariant,
      });
      return;
    }
    if (selectedEdgeHoverable) {
      // Anchor at the centre of the edge's on-screen portion — the same point the
      // label pill uses (see the label effect) — clipped to the viewport, so this is
      // `null` when the edge is entirely off screen.
      const screenPoints = selectedEdgeHoverable.path.map(
        (worldPoint): [number, number] => {
          const [x = 0, y = 0] = viewport.project([
            worldPoint[0],
            worldPoint[1],
          ]);
          return [x, y];
        },
      );
      const anchor = edgeLabelAnchor(screenPoints, width, height);
      if (!anchor) {
        onSelectedPositionChange(null);
        return;
      }
      onSelectedPositionChange({ type: "edge", x: anchor[0], y: anchor[1] });
      return;
    }
    onSelectedPositionChange(null);
  }, [
    onSelectedPositionChange,
    selectedPoint,
    selectedEdgeHoverable,
    viewState,
    view,
    activeNodeRadius,
    nodeVariant,
  ]);

  /**
   * The edge shown with edge-hover emphasis: the internal pointer hover, else the
   * external hover (suppressed while any internal hover is active, so the pointer
   * wins), else the selection. Mirrors {@link activeNode} for edges.
   */
  const activeEdge = useMemo(
    () =>
      hoveredEdge ??
      (internalHoverActive ? null : externalHoveredEdgeHoverable) ??
      selectedEdgeHoverable,
    [
      hoveredEdge,
      internalHoverActive,
      externalHoveredEdgeHoverable,
      selectedEdgeHoverable,
    ],
  );

  /**
   * Whether the active edge is drawn now, so its emphasis (label pill, bold stroke,
   * endpoint outlines) only shows when there's an edge on screen to annotate. Always
   * true in the detail view (every edge is drawn); in the compact view whenever both
   * endpoints resolve — either as one of a selected node's incident lines, or on its
   * own for a lone selected edge (see {@link compactHighlightLines}).
   */
  const activeEdgeShown = useMemo(
    () =>
      activeEdge != null && (isDetailZoom || activeEdge.endpoints.length === 2),
    [activeEdge, isDetailZoom],
  );

  /**
   * Whether the active edge is one of the active node's incident lines (so it is
   * already drawn as part of that node's highlight). When false in the compact view,
   * a shown active edge must be drawn on its own — see {@link compactHighlightLines}.
   */
  const activeEdgeInHighlight = useMemo(
    () =>
      activeEdge != null &&
      (highlight?.lines ?? []).some((line) => line.id === activeEdge.edgeId),
    [activeEdge, highlight],
  );

  /**
   * The compact view's straight highlight lines: the active node's incident lines,
   * plus the active edge on its own when it isn't one of them — i.e. a lone selected
   * edge with no node selected. Adding it here lets that edge show (bold, arrowed,
   * endpoints ringed) in the compact view without a surrounding node selection. Raw
   * node-centre lines; {@link trimmedHighlightLines} trims them for the arrow gap.
   * Empty in the detail view, which draws edges as bundled curves instead.
   */
  const compactHighlightLines = useMemo<HoverLine[]>(() => {
    if (isDetailZoom) {
      return [];
    }
    const lines = [...(highlight?.lines ?? [])];
    if (activeEdge && !activeEdgeInHighlight) {
      const [from, to] = activeEdge.endpoints;
      if (from && to) {
        lines.push({
          id: activeEdge.edgeId,
          source: [from.x, from.y],
          target: [to.x, to.y],
        });
      }
    }
    return lines;
  }, [isDetailZoom, highlight, activeEdge, activeEdgeInHighlight]);

  /**
   * The compact view's neighbour grow-ring nodes: the active node's neighbours, plus
   * a lone active edge's endpoints — so a selected edge with no node selected still
   * draws its two nodes as rings for the edge to connect. Just the active node's
   * neighbours in the detail view (grow rings are suppressed there anyway).
   */
  const compactNeighbours = useMemo<NetworkGraphPoint[]>(() => {
    const base = highlight?.neighbours ?? [];
    let result = base;
    if (!isDetailZoom && activeEdge && !activeEdgeInHighlight) {
      result = [...base];
      const seen = new Set(result.map((point) => point.id));
      if (activeNode) {
        seen.add(activeNode.id);
      }
      for (const endpoint of activeEdge.endpoints) {
        if (!seen.has(endpoint.id)) {
          seen.add(endpoint.id);
          result.push(endpoint);
        }
      }
    }
    // The backgrounded selection is drawn as its own dimmed ring, so drop its
    // full-opacity neighbour ring here — otherwise the bright node shows through
    // beneath the translucent one when a neighbour is hovered.
    return dimmedSelectedNode
      ? result.filter((point) => point.id !== dimmedSelectedNode.id)
      : result;
  }, [
    isDetailZoom,
    highlight,
    activeEdge,
    activeEdgeInHighlight,
    activeNode,
    dimmedSelectedNode,
  ]);

  /**
   * The backgrounded selection's own neighbourhood (see {@link neighbourhoodOf}),
   * computed so it can be drawn faded rather than hidden while a different node owns
   * the active highlight. Compact view only — the detail view already shows every
   * edge as a faint background curve, so the selection's edges never disappear there.
   */
  const dimmedSelectionHighlight = useMemo(
    () =>
      isDetailZoom || !dimmedSelectedNode
        ? null
        : neighbourhoodOf(dimmedSelectedNode),
    [isDetailZoom, dimmedSelectedNode, neighbourhoodOf],
  );

  /**
   * The backgrounded selection's neighbour rings, minus any node already drawn at
   * full opacity by the active highlight (the active node itself, or one of its
   * neighbours), so nothing is drawn both faded and full.
   */
  const dimmedSelectedNeighbours = useMemo<NetworkGraphPoint[]>(() => {
    if (!dimmedSelectionHighlight) {
      return [];
    }
    const shown = new Set<NetworkGraphId>(
      compactNeighbours.map((point) => point.id),
    );
    if (activeNode) {
      shown.add(activeNode.id);
    }
    return dimmedSelectionHighlight.neighbours.filter(
      (point) => !shown.has(point.id),
    );
  }, [dimmedSelectionHighlight, compactNeighbours, activeNode]);

  /**
   * The backgrounded selection's incident edges, minus any edge already drawn by the
   * active highlight (e.g. an edge between the selected and the hovered node), so a
   * shared edge shows once, at full opacity. Full-length node-centre lines; {@link
   * trimmedDimmedSelectedEdges} trims them for the arrow gap and {@link dimmedArrows}
   * places their arrows.
   */
  const dimmedSelectedEdges = useMemo<HoverLine[]>(() => {
    if (!dimmedSelectionHighlight) {
      return [];
    }
    const shownEdgeIds = new Set<NetworkGraphId>(
      compactHighlightLines.map((line) => line.id),
    );
    return dimmedSelectionHighlight.lines.filter(
      (line) => !shownEdgeIds.has(line.id),
    );
  }, [dimmedSelectionHighlight, compactHighlightLines]);

  /**
   * The hovered node when it's an ego-graph neighbour of the selected node — a node is
   * selected and the user hovers a different node that the selection connects to. It's
   * given a black edge-connection border (the same treatment an emphasised edge gives
   * its endpoints) to show it's adjacent to the selection. Reuses the selected node's
   * neighbourhood already computed for the dimmed highlight, so compact view only.
   */
  const hoveredSelectedNeighbour = useMemo<NetworkGraphPoint | null>(() => {
    if (!dimmedSelectionHighlight || !activeHoveredNode) {
      return null;
    }
    return dimmedSelectionHighlight.neighbours.some(
      (point) => point.id === activeHoveredNode.id,
    )
      ? activeHoveredNode
      : null;
  }, [dimmedSelectionHighlight, activeHoveredNode]);

  /**
   * The edge connecting the selected node to the hovered ego-graph neighbour, so it
   * gets the emphasised (thicker) hovered-edge styling while that neighbour is hovered —
   * the edge is already drawn as one of the hovered node's incident lines, so this only
   * bumps its width. Null unless a selected node's neighbour is hovered (compact view).
   */
  const selectedNeighbourEdgeId = useMemo<NetworkGraphId | null>(() => {
    if (
      !dimmedSelectionHighlight ||
      !selectedPoint ||
      !hoveredSelectedNeighbour
    ) {
      return null;
    }
    for (const line of dimmedSelectionHighlight.lines) {
      const edge = resolveEdge(line.id);
      if (!edge) {
        continue;
      }
      const other = edge.fromId === selectedPoint.id ? edge.toId : edge.fromId;
      if (other === hoveredSelectedNeighbour.id) {
        return line.id;
      }
    }
    return null;
  }, [
    dimmedSelectionHighlight,
    selectedPoint,
    hoveredSelectedNeighbour,
    resolveEdge,
  ]);

  /**
   * Draw the active edge's label on the overlay canvas, re-projecting on every view
   * change so the pill tracks the centre of the edge's on-screen portion. Clears the
   * canvas when no edge is active or the active edge isn't drawn, so a label can't
   * linger over an edge no longer shown.
   */
  useEffect(() => {
    const canvas = labelCanvasRef.current;
    if (!canvas || !containerSize) {
      return;
    }
    const { width, height } = containerSize;
    // Back the canvas at device resolution for crisp text, then draw in CSS pixels.
    const dpr = window.devicePixelRatio || 1;
    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(height * dpr);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    if (!activeEdge || !viewState || !activeEdgeShown) {
      return;
    }
    const viewport = view.makeViewport({ width, height, viewState });
    if (!viewport) {
      return;
    }
    const screenPoints = activeEdge.path.map((worldPoint): [number, number] => {
      const [x = 0, y = 0] = viewport.project([worldPoint[0], worldPoint[1]]);
      return [x, y];
    });
    const anchor = edgeLabelAnchor(screenPoints, width, height);
    if (!anchor) {
      return;
    }
    // The consumer supplies the pill text (e.g. the link type's icon + label);
    // draw nothing when the edge carries no label.
    const label = resolveEdge(activeEdge.edgeId)?.label;
    if (label) {
      drawEdgeLabel(ctx, anchor, label);
    }
  }, [
    activeEdge,
    activeEdgeShown,
    viewState,
    containerSize,
    view,
    resolveEdge,
  ]);

  /**
   * The points fed to the detail layers: those within the viewport (plus a margin).
   * Empty unless zoomed into the detail range. Culling keeps per-frame data small;
   * capped at {@link DETAIL_MAX_NODES}.
   */
  const detailPoints = useMemo(() => {
    if (!isDetailZoom || !viewState || !containerSize) {
      return [];
    }
    const { width, height } = containerSize;
    const viewport = view.makeViewport({ width, height, viewState });
    if (!viewport) {
      return [];
    }
    const margin = DETAIL_VIEWPORT_MARGIN_PX;
    // World-space rect covered by the (slightly expanded) viewport.
    const [ax = 0, ay = 0] = viewport.unproject([-margin, -margin]);
    const [bx = 0, by = 0] = viewport.unproject([
      width + margin,
      height + margin,
    ]);
    const minX = Math.min(ax, bx);
    const maxX = Math.max(ax, bx);
    const minY = Math.min(ay, by);
    const maxY = Math.max(ay, by);
    const visible: NetworkGraphPoint[] = [];
    for (const point of points) {
      if (
        point.x < minX ||
        point.x > maxX ||
        point.y < minY ||
        point.y > maxY
      ) {
        continue;
      }
      visible.push(point);
      if (visible.length >= DETAIL_MAX_NODES) {
        break;
      }
    }
    // Always include overlaid selection points, even if outside the culled rect.
    return overlayPoints.length > 0 ? [...visible, ...overlayPoints] : visible;
  }, [isDetailZoom, viewState, containerSize, view, points, overlayPoints]);

  /**
   * Up to {@link DETAIL_MAX_EDGES} edges touching a visible detail node, as bundled
   * polylines (including edges trailing off-screen), drawn faintly so the whole
   * graph's structure shows. Empty outside detail zoom. Walks the visible nodes'
   * adjacency, deduping, then routes each along {@link bundleHierarchy}.
   *
   * Above the cap, edges are sampled **round-robin** across visible nodes (each
   * node's `k`-th edge before any node's `(k+1)`-th) so the budget is spent max-min
   * fairly — hubs truncated last, not eating the whole budget. Adjacency
   * (insertion) order keeps the subset stable frame to frame, avoiding flicker.
   */
  const detailEdgePaths = useMemo(() => {
    if (!isDetailZoom || detailPoints.length === 0) {
      return [];
    }
    const seen = new Set<NetworkGraphId>();
    const paths: BundledEdge[] = [];
    for (let round = 0; paths.length < DETAIL_MAX_EDGES; round++) {
      // False once every node is exhausted at this round's index — then we're done.
      let anyRemaining = false;
      for (const point of detailPoints) {
        const incident = adjacency.get(point.id);
        if (!incident || round >= incident.length) {
          continue;
        }
        anyRemaining = true;
        const edge = incident[round];
        // Draw each edge once even if reached again via its other endpoint.
        if (!edge || seen.has(edge.id)) {
          continue;
        }
        seen.add(edge.id);
        const from = pointById.get(edge.fromId);
        const to = pointById.get(edge.toId);
        if (from && to) {
          paths.push({
            edgeId: edge.id,
            path: bundleEdgePath(from, to, bundleHierarchy),
          });
          if (paths.length >= DETAIL_MAX_EDGES) {
            break;
          }
        }
      }
      if (!anyRemaining) {
        break;
      }
    }
    return paths;
  }, [isDetailZoom, detailPoints, adjacency, pointById, bundleHierarchy]);

  /**
   * The active node's incident edges as bundled polylines, for the detail view.
   * Routed through the same {@link bundleHierarchy} as {@link detailEdgePaths} so a
   * highlighted edge follows the exact path it had as a background edge (no visible
   * shift when selected). Never capped, so all of a selected node's edges show and
   * are hoverable.
   */
  const highlightEdgePaths = useMemo<BundledEdge[]>(() => {
    if (!isDetailZoom || !activeNode) {
      return [];
    }
    const incident = activeNodeOverlay
      ? activeNodeOverlay.edges
      : (adjacency.get(activeNode.id) ?? []);
    const paths: BundledEdge[] = [];
    for (const edge of incident) {
      const from = resolvePoint(edge.fromId);
      const to = resolvePoint(edge.toId);
      if (from && to) {
        paths.push({
          edgeId: edge.id,
          path: bundleEdgePath(from, to, bundleHierarchy),
        });
      }
    }
    return paths;
  }, [
    isDetailZoom,
    activeNode,
    activeNodeOverlay,
    adjacency,
    resolvePoint,
    bundleHierarchy,
  ]);

  /**
   * The active edge rebuilt as a full-length bundled curve (centre → centre). The
   * picked geometry is trimmed to the node edges, but the arrow and prominent-trim
   * need the untrimmed path, so we re-bundle just this one edge. Detail view only.
   */
  const activeFullEdge = useMemo<BundledEdge | null>(() => {
    if (!isDetailZoom || !activeEdge) {
      return null;
    }
    const edge = resolveEdge(activeEdge.edgeId);
    const from = edge && resolvePoint(edge.fromId);
    const to = edge && resolvePoint(edge.toId);
    if (!from || !to) {
      return null;
    }
    return {
      edgeId: activeEdge.edgeId,
      path: bundleEdgePath(from, to, bundleHierarchy),
    };
  }, [isDetailZoom, activeEdge, resolveEdge, resolvePoint, bundleHierarchy]);

  /**
   * A direction arrow for each highlighted edge, placed at the target (`toId`) end:
   * anchored at the target's world centre, with a screen-space offset backing the
   * tip off the node and an angle from the edge's tangent. Fed to the arrow {@link
   * IconLayer}. See {@link EdgeArrow}.
   */
  const arrows = useMemo<EdgeArrow[]>(() => {
    const list: EdgeArrow[] = [];
    const seen = new Set<NetworkGraphId>();
    const addArrow = (
      edgeId: NetworkGraphId,
      target: [number, number],
      previous: [number, number],
    ) => {
      if (seen.has(edgeId)) {
        return;
      }
      const dx = target[0] - previous[0];
      const dy = target[1] - previous[1];
      const length = Math.hypot(dx, dy);
      if (length < 1e-9) {
        return;
      }
      seen.add(edgeId);
      const ux = dx / length;
      const uy = dy / length;
      // The target node's on-screen radius: fixed in the detail view; a hovered-sized or
      // neighbour-sized grow-ring radius in the compact view. Hovered-sized covers both
      // the active node *and* the backgrounded (dimmed) selection — the latter still
      // draws a hovered-sized ring, so an arrow pointing at it must clear that ring
      // rather than jump inward when a neighbour is hovered (matches the edge trim).
      const toId = resolveEdge(edgeId)?.toId;
      const targetIsHoveredSize =
        toId != null &&
        (toId === activeNode?.id || toId === dimmedSelectedNode?.id);
      const targetRadius = isDetailZoom
        ? DETAIL_NODE_DIAMETER / 2
        : targetIsHoveredSize
          ? HOVERED_MIN_RADIUS
          : NEIGHBOUR_MIN_RADIUS;
      const back = targetRadius + arrowGapPx;
      list.push({
        position: target,
        // The view's `flipY` makes world y match screen y, so the world tangent is
        // the screen direction: offset backs the tip toward the source, angle points
        // the triangle into the target.
        offset: [-ux * back, -uy * back],
        angle: -(Math.atan2(uy, ux) * 180) / Math.PI,
      });
    };

    if (isDetailZoom) {
      for (const edge of highlightEdgePaths) {
        const target = edge.path[edge.path.length - 1];
        const previous = edge.path[edge.path.length - 2];
        if (target && previous) {
          addArrow(edge.edgeId, target, previous);
        }
      }
      // The active background edge isn't in the set above; use its full (untrimmed)
      // path so the arrow sits at the node centre.
      if (activeFullEdge) {
        const target = activeFullEdge.path[activeFullEdge.path.length - 1];
        const previous = activeFullEdge.path[activeFullEdge.path.length - 2];
        if (target && previous) {
          addArrow(activeFullEdge.edgeId, target, previous);
        }
      }
    } else {
      for (const line of compactHighlightLines) {
        addArrow(line.id, line.target, line.source);
      }
    }
    return list;
  }, [
    isDetailZoom,
    highlightEdgePaths,
    activeFullEdge,
    compactHighlightLines,
    resolveEdge,
    activeNode,
    dimmedSelectedNode,
    arrowGapPx,
  ]);

  /**
   * The detail view's prominent (arrowed) edges as bundled curves trimmed to each
   * node's edge: source by the node radius, target by radius + gap (leaving the
   * arrow's gap empty). Pixel trims, so this re-trims cheaply on zoom without
   * re-bundling. Empty in compact.
   */
  const trimmedHighlightEdgePaths = useMemo<BundledEdge[]>(() => {
    if (!isDetailZoom) {
      return [];
    }
    const scale = currentZoom == null ? null : 2 ** currentZoom;
    const sourceTrim = scale == null ? 0 : DETAIL_NODE_DIAMETER / 2 / scale;
    const targetTrim =
      scale == null ? 0 : (DETAIL_NODE_DIAMETER / 2 + arrowGapPx) / scale;
    const clip = (path: [number, number][]) =>
      trimPathBothEnds(path, sourceTrim, targetTrim);
    const list: BundledEdge[] = [];
    const seen = new Set<NetworkGraphId>();
    for (const edge of highlightEdgePaths) {
      seen.add(edge.edgeId);
      list.push({ edgeId: edge.edgeId, path: clip(edge.path) });
    }
    // The active background edge is highlighted too; trim it from its full path.
    if (activeFullEdge && !seen.has(activeFullEdge.edgeId)) {
      list.push({
        edgeId: activeFullEdge.edgeId,
        path: clip(activeFullEdge.path),
      });
    }
    return list;
  }, [
    isDetailZoom,
    highlightEdgePaths,
    activeFullEdge,
    currentZoom,
    arrowGapPx,
  ]);

  /**
   * Trim a straight highlight line for its end gaps: pull the target back past the whole
   * arrowhead (target node's grow-ring radius + the arrow gap places the arrow's tip, plus
   * the arrowhead's length) so the edge ends at the arrowhead's base — a thickened edge
   * would otherwise poke out around the arrow point. Trim the source end per `sourceMode`
   * — `"none"` (flush to the node centre), `"gap"` (radius +
   * arrow gap, matching the arrow side so the edge floats clear of both nodes), or
   * `"flush"` (radius only, so the edge meets the node's ring/black border with no gap).
   * `hoveredSizeIds` are the nodes drawn at the larger hovered ring size — the active node
   * *and* the backgrounded (dimmed) selection, which also draws a hovered-sized ring — so
   * an endpoint of either uses HOVERED_MIN_RADIUS; the rest use NEIGHBOUR_MIN_RADIUS. This
   * keeps the selected node's end of an edge put when a neighbour is hovered rather than
   * letting the edge creep toward it. `scale` is the current world→pixel scale.
   */
  const trimHighlightLine = useCallback(
    (
      line: HoverLine,
      scale: number,
      hoveredSizeIds: ReadonlySet<NetworkGraphId>,
      sourceMode: "none" | "gap" | "flush",
    ): HoverLine => {
      const edge = resolveEdge(line.id);
      const dx = line.target[0] - line.source[0];
      const dy = line.target[1] - line.source[1];
      const length = Math.hypot(dx, dy);
      if (length === 0) {
        return line;
      }
      const radiusFor = (id: NetworkGraphId | undefined) =>
        id != null && hoveredSizeIds.has(id)
          ? HOVERED_MIN_RADIUS
          : NEIGHBOUR_MIN_RADIUS;
      // Stop at the arrowhead's base (radius + gap places its tip; add the head length
      // to clear the whole arrow) so a thickened edge doesn't poke out around the point.
      const targetTrim =
        (radiusFor(edge?.toId) + arrowGapPx + ARROW_HEAD_LENGTH_PX) / scale;
      const sourceRadius = radiusFor(edge?.fromId);
      const sourceTrim =
        sourceMode === "gap"
          ? (sourceRadius + arrowGapPx) / scale
          : sourceMode === "flush"
            ? sourceRadius / scale
            : 0;
      // On a short edge the two trims would meet or cross — collapse it to its midpoint.
      if (sourceTrim + targetTrim >= length) {
        const midX = line.source[0] + dx / 2;
        const midY = line.source[1] + dy / 2;
        return { id: line.id, source: [midX, midY], target: [midX, midY] };
      }
      const ux = dx / length;
      const uy = dy / length;
      return {
        id: line.id,
        source: [
          line.source[0] + ux * sourceTrim,
          line.source[1] + uy * sourceTrim,
        ],
        target: [
          line.target[0] - ux * targetTrim,
          line.target[1] - uy * targetTrim,
        ],
      };
    },
    [resolveEdge, arrowGapPx],
  );

  /**
   * The compact view's prominent (arrowed) edges — {@link compactHighlightLines} (the
   * active node's straight incident lines, plus a lone selected edge) — each with its
   * target pulled back by the node radius + gap for the arrow. The source end is trimmed
   * per selection: the *selected edge* meets its endpoint's black border flush (no gap);
   * while any selection is active, the active node's edges open a matching short gap (so
   * they don't overshoot their neighbours — including the hovered node's edges during an
   * edge selection); otherwise (plain hover) the source runs to the node centre. Empty in
   * the detail view.
   */
  const trimmedHighlightLines = useMemo<HoverLine[]>(() => {
    if (isDetailZoom || currentZoom == null) {
      return compactHighlightLines;
    }
    const scale = 2 ** currentZoom;
    // The hovered-sized rings: the active node and the backgrounded selection (both draw
    // a hovered-sized ring), so the selected node's edge end holds its gap when a
    // neighbour is hovered.
    const hoveredSizeIds = new Set<NetworkGraphId>();
    if (activeNode) {
      hoveredSizeIds.add(activeNode.id);
    }
    if (dimmedSelectedNode) {
      hoveredSizeIds.add(dimmedSelectedNode.id);
    }
    return compactHighlightLines.map((line) => {
      // The selected edge meets its endpoint's border flush; while a node or edge is
      // selected, the active node's edges get the short source gap; a plain hover leaves
      // the source untrimmed.
      const sourceMode =
        line.id === selectedParts.edgeId
          ? "flush"
          : compactHasSelection
            ? "gap"
            : "none";
      return trimHighlightLine(line, scale, hoveredSizeIds, sourceMode);
    });
  }, [
    isDetailZoom,
    currentZoom,
    compactHighlightLines,
    activeNode,
    dimmedSelectedNode,
    compactHasSelection,
    selectedParts.edgeId,
    trimHighlightLine,
  ]);

  /**
   * The backgrounded selection's edges (see {@link dimmedSelectedEdges}) trimmed at both
   * ends like {@link trimmedHighlightLines} — the target for its arrow, the source for
   * the matching non-arrow gap (always, as these only exist while a node is selected).
   * The hovered (larger) ring is the dimmed selected node's rather than the active node's.
   * Compact view only.
   */
  const trimmedDimmedSelectedEdges = useMemo<HoverLine[]>(() => {
    if (isDetailZoom || currentZoom == null) {
      return dimmedSelectedEdges;
    }
    const scale = 2 ** currentZoom;
    // Only the dimmed selected node draws a hovered-sized ring here; its neighbours (the
    // other endpoints) are neighbour-sized.
    const hoveredSizeIds = dimmedSelectedNode
      ? new Set<NetworkGraphId>([dimmedSelectedNode.id])
      : new Set<NetworkGraphId>();
    return dimmedSelectedEdges.map((line) =>
      trimHighlightLine(line, scale, hoveredSizeIds, "gap"),
    );
  }, [
    isDetailZoom,
    currentZoom,
    dimmedSelectedEdges,
    dimmedSelectedNode,
    trimHighlightLine,
  ]);

  /**
   * Direction arrows for the backgrounded selection's edges, so its neighbourhood keeps
   * its arrows (drawn by the parent in the dimmed edge colour) while a different node is
   * hovered. Placed at each edge's target from the untrimmed {@link dimmedSelectedEdges},
   * keying the target's grow-ring radius off the dimmed selected node. Compact only.
   */
  const dimmedArrows = useMemo<EdgeArrow[]>(() => {
    if (isDetailZoom || !dimmedSelectedNode) {
      return [];
    }
    const list: EdgeArrow[] = [];
    for (const line of dimmedSelectedEdges) {
      const dx = line.target[0] - line.source[0];
      const dy = line.target[1] - line.source[1];
      const length = Math.hypot(dx, dy);
      if (length < 1e-9) {
        continue;
      }
      const ux = dx / length;
      const uy = dy / length;
      const targetIsSelected =
        resolveEdge(line.id)?.toId === dimmedSelectedNode.id;
      const targetRadius = targetIsSelected
        ? HOVERED_MIN_RADIUS
        : NEIGHBOUR_MIN_RADIUS;
      const back = targetRadius + arrowGapPx;
      list.push({
        position: line.target,
        offset: [-ux * back, -uy * back],
        angle: -(Math.atan2(uy, ux) * 180) / Math.PI,
      });
    }
    return list;
  }, [
    isDetailZoom,
    dimmedSelectedNode,
    dimmedSelectedEdges,
    resolveEdge,
    arrowGapPx,
  ]);

  /**
   * The faint background bundled edges, minus the active node's prominent edges,
   * each trimmed rim-to-rim so it stops at the node's edge (not its centre, under
   * the translucent nodes).
   *
   * The hovered edge is deliberately *kept* here, drawn invisibly (see `getColor`)
   * as a continuous pick target: the bold highlight path is trimmed an extra
   * `arrowGapPx` short at the target, which otherwise left a dead band by the arrow
   * where the hover dropped and re-armed each pointer move — visible hover jitter.
   * Empty in compact.
   */
  const trimmedBackgroundEdgePaths = useMemo<BundledEdge[]>(() => {
    if (!isDetailZoom) {
      return [];
    }
    // Only the active node's edges are excluded (drawn prominently, pickable via
    // their own layer). The hovered edge stays as an invisible pick target.
    const prominentIds = new Set(
      (highlight?.lines ?? []).map((line) => line.id),
    );
    const scale = currentZoom == null ? null : 2 ** currentZoom;
    const trim = scale == null ? 0 : DETAIL_NODE_DIAMETER / 2 / scale;
    return detailEdgePaths
      .filter((edge) => !prominentIds.has(edge.edgeId))
      .map((edge) => ({
        edgeId: edge.edgeId,
        path: trimPathBothEnds(edge.path, trim, trim),
      }));
  }, [isDetailZoom, detailEdgePaths, highlight, currentZoom]);

  const layers = useMemo(() => {
    // The active edge's endpoint nodes, outlined in the edge's colour — only while
    // that edge is drawn (see `activeEdgeShown`).
    const edgeHoverNodes =
      activeEdgeShown && activeEdge ? activeEdge.endpoints : [];

    // Background edges are always hoverable in detail. The highlight lines are
    // hoverable in detail, but in compact only while they're the *selection's own*
    // (a node is selected, no different node hovered) — a hovered node's edges must
    // not become hoverable.
    const backgroundEdgesPickable = isDetailZoom;
    const highlightEdgesPickable = isDetailZoom
      ? activeNode != null
      : selectedPoint != null && dimmedSelectedNode == null;
    // The emphasised (thicker) edge: the active edge when one is hovered/selected, else
    // the edge connecting the selection to a hovered ego-graph neighbour, so hovering a
    // neighbour thickens its connecting edge like hovering the edge itself would.
    const hoveredEdgeId = activeEdgeShown
      ? (activeEdge?.edgeId ?? null)
      : selectedNeighbourEdgeId;

    const compact = new CompactNodeLayer({
      id: "compact-nodes",
      // Resolves picking when shown; the detailed nodes do so in detail zoom (its
      // points are hidden there).
      pickable: true,
      // Current nodes plus any still shrinking out (see `compactData`).
      data: compactData,
      // The active node's incident edges as straight lines (detail draws bundled
      // curves via `highlightEdgePaths` instead). Trimmed at the target to open the gap.
      edges: trimmedHighlightLines,
      // All edges touching visible nodes minus the prominent ones, bundled and drawn
      // faintly in detail. The prominent edges are drawn by a separate layer above.
      backgroundEdgePaths: trimmedBackgroundEdgePaths,
      hoveredEdgeId,
      highlightEdgesPickable,
      backgroundEdgesPickable,
      // While a node is selected, the highlight's grown rings (the active node's and
      // its neighbours') become enlarged hitboxes that win the pick over the crowd
      // beneath them.
      highlightNodesPickable: compactHasSelection,
      edgeHoverNodes,
      neighbours: compactNeighbours,
      activeNode,
      dimmedSelectedNode,
      // The backgrounded selection's edges/neighbours, drawn faded rather than hidden
      // while a different node owns the active highlight (compact view). Edges trimmed
      // at the target so `dimmedArrows` sit in the gap, matching the active edges.
      dimmedSelectedEdges: trimmedDimmedSelectedEdges,
      dimmedSelectedNeighbours,
      // Keep the backgrounded selection's neighbourhood pickable so it retains pointer
      // priority over the hovered node (resolved in `applyPickPriority`).
      dimmedSelectionPickable: compactHasSelection,
      // Hide the selected node's plain crowd point so it can't show through its own
      // grow ring (which is translucent while a different node is hovered).
      selectedPointId: selectedPoint?.id ?? null,
      colorByHex: colorByHexWithOverlay,
      radiusScale: effectiveRadiusScale,
      pointOpacity,
      // Animate crowd points in from / out to radius 0 as nodes are added/removed.
      nodeScaleById,
      nodeScaleEpoch,
      dimmed: highlight !== null,
      // In detail the grow highlights give way to the detailed layer's outline.
      showGrowHighlights: !isDetailZoom,
      // Hide the compact crowd in detail so it doesn't show through behind the
      // translucent detailed nodes; the layer still draws the edges.
      showPoints: !isDetailZoom,
    });

    const nodeLayers: Layer[] = isDetailZoom
      ? [
          compact,
          new DetailedNodeLayer({
            id: "detailed-nodes",
            // With the compact points hidden, these nodes resolve picking.
            pickable: true,
            data: detailPoints,
            activeNode,
            enlargedSelection: dimmedSelectedNode,
            colorByHex: colorByHexWithOverlay,
            iconAtlas,
            edgeHoverNodes,
          }),
        ]
      : [compact];

    // The prominent bundled edges, drawn above the detailed nodes so a highlighted
    // connection reads over any node it crosses. `depthCompare: "always"` lets it
    // paint over the depth-writing nodes. Detail view only.
    if (trimmedHighlightEdgePaths.length > 0) {
      nodeLayers.push(
        new PathLayer<BundledEdge>({
          id: "highlight-edges",
          data: trimmedHighlightEdgePaths,
          pickable: highlightEdgesPickable,
          getPath: (edge) => edge.path,
          getColor: [...EDGE_COLOR, 255],
          getWidth: (edge) =>
            edge.edgeId === hoveredEdgeId ? EDGE_HOVER_WIDTH : EDGE_WIDTH,
          widthUnits: "pixels",
          widthMinPixels: EDGE_MIN_WIDTH,
          capRounded: true,
          jointRounded: true,
          updateTriggers: { getWidth: hoveredEdgeId },
          // Paint over the nodes but don't write depth, so the active node can be
          // redrawn on top of these edges below.
          parameters: { depthCompare: "always", depthWriteEnabled: false },
        }),
      );
    }

    // Direction arrows on the highlighted edges. Drawn *below* the active node's
    // redraw (next) so a selected/hovered node sits above the arrows on its own
    // edges. `depthWriteEnabled: false` lets that redraw paint over them.
    const arrowAtlas = arrowIconAtlas();
    // The backgrounded selection's arrows, in the faded dimmed edge colour/opacity so
    // they match its edges. Drawn before the active arrows so those read on top.
    if (arrowAtlas && dimmedArrows.length > 0) {
      nodeLayers.push(
        new IconLayer<EdgeArrow>({
          id: "dimmed-edge-arrows",
          data: dimmedArrows,
          pickable: false,
          iconAtlas: arrowAtlas.url,
          iconMapping: arrowAtlas.mapping,
          getIcon: () => "arrow",
          getPosition: (arrow) => arrow.position,
          getPixelOffset: (arrow) => arrow.offset,
          getAngle: (arrow) => arrow.angle,
          getSize: ARROW_SIZE_PX,
          sizeUnits: "pixels",
          getColor: [...DIMMED_EDGE_COLOR, RGBA_OPAQUE],
          opacity: SELECTED_DIM_OPACITY,
          parameters: { depthCompare: "always", depthWriteEnabled: false },
        }),
      );
    }
    if (arrowAtlas && arrows.length > 0) {
      nodeLayers.push(
        new IconLayer<EdgeArrow>({
          id: "edge-arrows",
          data: arrows,
          // Pickable in compact only, to intercept picks in the arrow gap so
          // hovering/clicking it doesn't hit the edge (handlers ignore arrow picks).
          // Detail keeps its rim-to-rim edge pick target, so arrows aren't pickable there.
          pickable: !isDetailZoom,
          iconAtlas: arrowAtlas.url,
          iconMapping: arrowAtlas.mapping,
          getIcon: () => "arrow",
          getPosition: (arrow) => arrow.position,
          getPixelOffset: (arrow) => arrow.offset,
          getAngle: (arrow) => arrow.angle,
          getSize: ARROW_SIZE_PX,
          sizeUnits: "pixels",
          getColor: [...EDGE_COLOR, 255],
          parameters: { depthCompare: "always", depthWriteEnabled: false },
        }),
      );
    }

    // The active node (and the backgrounded selection, if any) redrawn above the
    // highlighted edges *and* arrows, so it's never covered by an edge/arrow crossing
    // it. Redrawing the selection here too keeps it drawn twice regardless of whether
    // it's active, so its translucent fill doesn't brighten when the highlight moves.
    // NB: the id must not be `detailed-nodes-active`, or its `-outline-pill` sublayer
    // would collide with the main layer's `-active-outline-pill` sublayer.
    if (isDetailZoom && activeNode) {
      nodeLayers.push(
        new DetailedNodeLayer({
          id: "detailed-nodes-front",
          pickable: true,
          data: dimmedSelectedNode
            ? [activeNode, dimmedSelectedNode]
            : [activeNode],
          activeNode,
          enlargedSelection: dimmedSelectedNode,
          colorByHex: colorByHexWithOverlay,
          iconAtlas,
          edgeHoverNodes: [],
        }),
      );
    } else if (activeNode) {
      // Compact: redraw just the active node's grow ring above the arrows (the rest
      // stays below). Its fill is opaque, so the extra draw is visually identical.
      // When the active node carries a black edge-connection border — a hovered
      // ego-graph neighbour of a selected node, or an endpoint of a selected edge — that
      // border is redrawn here too: the main layer's copy would sit under this opaque
      // grow-ring redraw, so it must be re-applied on top.
      nodeLayers.push(
        new CompactNodeLayer({
          id: "compact-nodes-front",
          pickable: false,
          data: [],
          edges: [],
          backgroundEdgePaths: [],
          hoveredEdgeId: null,
          highlightEdgesPickable: false,
          backgroundEdgesPickable: false,
          edgeHoverNodes:
            hoveredSelectedNeighbour?.id === activeNode.id ||
            edgeHoverNodes.some((point) => point.id === activeNode.id)
              ? [activeNode]
              : [],
          neighbours: [],
          activeNode,
          dimmedSelectedNode: null,
          colorByHex: colorByHexWithOverlay,
          radiusScale: effectiveRadiusScale,
          pointOpacity,
          dimmed: false,
          showGrowHighlights: true,
          showPoints: false,
        }),
      );
    }
    return nodeLayers;
  }, [
    compactData,
    highlight,
    trimmedBackgroundEdgePaths,
    trimmedHighlightEdgePaths,
    trimmedHighlightLines,
    compactNeighbours,
    arrows,
    activeEdge,
    activeEdgeShown,
    selectedPoint,
    activeNode,
    dimmedSelectedNode,
    trimmedDimmedSelectedEdges,
    dimmedArrows,
    dimmedSelectedNeighbours,
    hoveredSelectedNeighbour,
    selectedNeighbourEdgeId,
    compactHasSelection,
    colorByHexWithOverlay,
    effectiveRadiusScale,
    pointOpacity,
    nodeScaleById,
    nodeScaleEpoch,
    isDetailZoom,
    detailPoints,
    iconAtlas,
  ]);

  return (
    <div
      ref={containerRef}
      className={cx(containerStyles, className)}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
    >
      {viewState ? (
        <DeckGL
          ref={deckRef}
          views={view}
          viewState={viewState}
          controller={CONTROLLER_OPTIONS}
          layers={layers}
          // A small tolerance so thin edges can be hovered without pixel-perfect
          // aim; nodes still win where they overlap, being drawn on top.
          pickingRadius={EDGE_PICK_RADIUS_PX}
          onHover={(rawInfo: PickingInfo) => {
            // Ignore arrow picks (compact) so hovering the arrow gap leaves the hover
            // unchanged rather than hovering the edge behind. Checked on the raw pick
            // before applying priority so the arrow still shields the gap.
            if (rawInfo.layer?.id === "edge-arrows") {
              return;
            }
            // Let the selected node's edges/neighbours win over the crowd (compact),
            // so hovering one of them highlights it rather than a node beneath.
            const info =
              applyPickPriority(
                rawInfo,
                rawInfo.x,
                rawInfo.y,
                EDGE_PICK_RADIUS_PX,
              ) ?? rawInfo;
            const object =
              (info.object as
                | NetworkGraphPoint
                | HoverLine
                | BundledEdge
                | undefined) ?? null;

            // A bundled detail edge carries `path`; a compact highlight line carries `source`.
            const picked: {
              edgeId: NetworkGraphId;
              path: [number, number][];
            } | null =
              object && "path" in object
                ? { edgeId: object.edgeId, path: object.path }
                : object && "source" in object
                  ? {
                      edgeId: object.id,
                      path: [object.source, object.target],
                    }
                  : null;

            if (picked) {
              if (hoveredEdgeIdRef.current !== picked.edgeId) {
                hoveredEdgeIdRef.current = picked.edgeId;
                const resolved = resolveEdge(picked.edgeId) ?? null;
                setHoveredEdge({
                  edgeId: picked.edgeId,
                  path: picked.path,
                  endpoints: resolved ? endpointsOf(resolved) : [],
                });
                onEdgeHover?.({ edge: resolved, x: info.x, y: info.y });
              }
              // Hovering an edge drops the node hover (`onNodeHover` with
              // `point: null`) but leaves the external selection for the consumer to keep.
              if (lastHoveredIdRef.current !== null) {
                lastHoveredIdRef.current = null;
                setHovered(null);
                onNodeHover?.({
                  point: null,
                  x: info.x,
                  y: info.y,
                  nodeRadius: activeNodeRadius,
                  variant: nodeVariant,
                });
              }
              return;
            }

            // Not over an edge — clear any edge hover (reporting the pointer left
            // it), then handle node hover.
            if (hoveredEdgeIdRef.current !== null) {
              hoveredEdgeIdRef.current = null;
              setHoveredEdge(null);
              onEdgeHover?.({ edge: null, x: info.x, y: info.y });
            }
            const node = object as NetworkGraphPoint | null;
            const id = node?.id ?? null;
            // Only react when the hovered node changes (including to no node).
            if (id === lastHoveredIdRef.current) {
              return;
            }
            lastHoveredIdRef.current = id;
            setHovered(node);
            onNodeHover?.({
              point: node,
              x: info.x,
              y: info.y,
              nodeRadius: activeNodeRadius,
              variant: nodeVariant,
            });
          }}
          onViewStateChange={(params) => {
            const raw = params.viewState as OrthographicViewState;
            const zoom = Array.isArray(raw.zoom) ? raw.zoom[0] : raw.zoom;
            // deck flags a zoom gesture; the delta's sign (vs. our committed state) says which way.
            const isZooming = params.interactionState.isZooming ?? false;
            const rect = containerRef.current?.getBoundingClientRect();
            setViewState((previous) => {
              // deck's interaction viewState carries only target/zoom, so merge it
              // onto ours to preserve `minZoom`/`maxZoom`. Without this a wheel event
              // wipes the limits, and later imperative zooms produce out-of-range
              // values deck silently ignores — leaving the camera stuck.
              const base = previous ?? raw;
              const previousZoom = Array.isArray(base.zoom)
                ? base.zoom[0]
                : base.zoom;
              const zoomDelta =
                isZooming && zoom !== undefined && previousZoom !== undefined
                  ? zoom - previousZoom
                  : 0;
              // A zoom-in re-anchors on the cursor, legitimately dragging the target
              // toward the far edge; a pan clamp would fight that and jerk the view.
              // Left free — its limits only widen as it zooms, so it can't over-reveal.
              const zoomingIn = zoomDelta > 0;
              // A zoom-out hard-clamps the target on every edge (`clampPanTarget`),
              // reframing inward rather than exposing empty space beyond the network.
              const zoomingOut = zoomDelta < 0;
              // Any other change (pan, or zoom pinned at a limit) constrains panning
              // relative to where the view sits: blocks further outward pan, never
              // pans on its own.
              const target =
                rect && zoom !== undefined && raw.target && !zoomingIn
                  ? zoomingOut
                    ? clampPanTarget(
                        raw.target as number[],
                        2 ** zoom,
                        rect.width,
                        rect.height,
                        panBounds,
                        PAN_NODE_MARGIN_PX,
                      )
                    : clampPanTargetBlocking(
                        raw.target as number[],
                        (previous?.target as number[] | undefined) ??
                          (raw.target as number[]),
                        2 ** zoom,
                        rect.width,
                        rect.height,
                        panBounds,
                        PAN_NODE_MARGIN_PX,
                      )
                  : (raw.target ?? base.target);
              const next: OrthographicViewState = {
                ...base,
                zoom: raw.zoom,
                target,
              };
              return next;
            });
          }}
          getCursor={({ isDragging, isHovering }) =>
            isDragging ? "grabbing" : isHovering ? "pointer" : "grab"
          }
        />
      ) : null}
      <canvas ref={labelCanvasRef} className={labelCanvasStyles} />
    </div>
  );
};
