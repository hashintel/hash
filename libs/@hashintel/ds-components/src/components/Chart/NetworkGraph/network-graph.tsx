import { OrthographicView } from "@deck.gl/core";
import { IconLayer, PathLayer } from "@deck.gl/layers";
import { DeckGL, type DeckGLRef } from "@deck.gl/react";
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

import { css, cx } from "@hashintel/ds-helpers/css";

import { CompactNodeLayer } from "./compact-node-layer";
import { DetailedNodeLayer, DETAIL_NODE_DIAMETER } from "./detailed-node-layer";
import { buildBundleHierarchy, bundleEdgePath } from "./edge-bundling";
import {
  DETAIL_ICON_TEXTURE,
  EDGE_COLOR,
  EDGE_HOVER_WIDTH,
  EDGE_MIN_WIDTH,
  EDGE_WIDTH,
  hexToRgb,
  iconTextureUrl,
} from "./network-graph-util";
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
 * A selection given as an explicit neighbourhood rather than a node id: the
 * selected `point`, its `edges`, and its `neighbours`. Items not already in the
 * graph are overlaid; items that are get reused rather than re-rendered.
 */
export interface NetworkGraphSelection {
  point: NetworkGraphPoint;
  edges: NetworkGraphEdge[];
  neighbours: NetworkGraphPoint[];
}

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
   * The smallest distance between any two nodes, in world coordinates. Sets the
   * camera's maximum zoom: at max zoom the closest two nodes sit `2 · the detail
   * hover radius + 10px` apart on screen.
   */
  nodeMinDistance: number;
  /** Extra class name applied to the chart container. */
  className?: string;
  /**
   * The node to highlight with the same treatment as hovering (edges, neighbour
   * rings and a prominent node). Either a node id, or a {@link NetworkGraphSelection}
   * giving an explicit neighbourhood to overlay. An active hover takes precedence.
   */
  selected?: NetworkGraphId | NetworkGraphSelection | null;
  /**
   * The edge to highlight with the same treatment as hovering it — bold stroke,
   * direction arrow, endpoint outlines and a label pill. An active edge hover takes
   * precedence. In the compact view, where an edge is only drawn while its node is
   * selected, it keeps its emphasis for as long as that node stays selected.
   */
  selectedEdge?: NetworkGraphId | null;
  /**
   * Called with the `selected` node's on-screen position (CSS px from the chart's
   * top-left) and drawn radius whenever they change — including on zoom/pan — or
   * `null` when nothing is selected or the node is outside the viewport. Lets a
   * consumer anchor an overlay to the node, offsetting it by `nodeRadius`, and hide
   * it while off screen.
   */
  onSelectedPositionChange?: (
    position: {
      x: number;
      y: number;
      nodeRadius: number;
      variant: "detailed" | "compact";
    } | null,
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
   * Called when an edge is clicked. Does not change the node selection; to keep the
   * clicked edge highlighted, feed its id back in via {@link NetworkGraphProps.selectedEdge}.
   */
  onEdgeClick?: (interaction: NetworkGraphEdgeInteraction) => void;
  /** Called when the zoom level changes (log2 scale). Not called for pure panning. */
  onZoom?: (zoom: number) => void;
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
 * Fallback furthest zoom-in (levels above the framing zoom), used only when
 * `nodeMinDistance` is unavailable (an empty/single-node graph). Otherwise
 * `maxZoom` is derived from the node spacing (see the framing effect).
 */
const MAX_ZOOM_OFFSET = 9;
/** Screen-space padding (px) the viewport may show beyond the network when panning. */
const PAN_PADDING_PX = 10;
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
const DETAIL_MAX_NODES = 1500;
const DETAIL_MAX_EDGES = 400;
/** Extra viewport margin (px) within which nodes are still included, so one straddling the edge isn't culled. */
const DETAIL_VIEWPORT_MARGIN_PX = 80;
/**
 * Style of the pill drawn on a hovered edge, mirroring the detail node label but
 * outlined in black. Drawn imperatively on a 2D overlay canvas (not a deck.gl
 * layer) so it can track the edge's on-screen centre as the view pans and zooms.
 */
const EDGE_LABEL_FONT =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const EDGE_LABEL_FONT_SIZE = 12;
const EDGE_LABEL_PADDING_X = 6;
const EDGE_LABEL_PADDING_Y = 2;
const EDGE_LABEL_RADIUS = 6;
const EDGE_LABEL_INK = "rgb(15, 18, 25)";
const EDGE_LABEL_BACKGROUND = "rgb(255, 255, 255)";
const EDGE_LABEL_BORDER = "rgb(0, 0, 0)";
const EDGE_LABEL_BORDER_WIDTH = 1;
/**
 * On-screen size (px) of the direction arrow at the target end of a highlighted
 * edge. (The gap to the node's edge is zoom-derived — see `arrowGapPx` in {@link
 * deriveZoomAttributes}.)
 */
const ARROW_SIZE_PX = 10;
/** Resolution (px) the arrow triangle sprite is rasterised at. */
const ARROW_ICON_TEXTURE = 64;

/**
 * The inclusive range a pan `center` may take on one axis so the viewport shows
 * at most {@link PAN_PADDING_PX} beyond the network on either side. `scale` is the
 * world→pixel factor (`2 ** zoom`). The two per-side limits order as `[lo, hi]`
 * zoomed in but swap zoomed out — sorting covers both regimes.
 */
const panAxisLimits = (
  min: number,
  max: number,
  viewportPx: number,
  scale: number,
): [number, number] => {
  const pad = PAN_PADDING_PX / scale;
  const half = viewportPx / (2 * scale);
  const a = min - pad + half;
  const b = max + pad - half;
  return [Math.min(a, b), Math.max(a, b)];
};

/**
 * Hard-clamp an orthographic pan `target` to the nearest in-range value so the
 * viewport never shows more than {@link PAN_PADDING_PX} beyond the network's
 * bounding box. Used where the target is computed afresh ({@link
 * NetworkGraphHandle.revealPoint}) and must land inside the limits regardless of
 * where the view previously sat. `viewport{Width,Height}` are in CSS pixels.
 */
const clampPanTarget = (
  target: number[],
  scale: number,
  viewportWidth: number,
  viewportHeight: number,
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
): [number, number, number] => {
  const [loX, hiX] = panAxisLimits(
    bounds.minX,
    bounds.maxX,
    viewportWidth,
    scale,
  );
  const [loY, hiY] = panAxisLimits(
    bounds.minY,
    bounds.maxY,
    viewportHeight,
    scale,
  );
  return [
    Math.min(hiX, Math.max(loX, target[0] ?? 0)),
    Math.min(hiY, Math.max(loY, target[1] ?? 0)),
    target[2] ?? 0,
  ];
};

/**
 * Constrain a pan *relative to where the view already is*, so the clamp only
 * resists the user's own panning and never pans the view on its own. On each axis
 * the target may move freely back toward the network but is blocked from moving
 * further out than `previous` (the committed target) already sits.
 *
 * Matters when a zoom shrinks the pan limits: a target parked at the edge would
 * fall outside the new limits and {@link clampPanTarget} would snap it inward,
 * jerking the view sideways as the user merely zoomed. Relaxing each bound to
 * include `previous` leaves the view put and only stops further outward panning.
 */
const clampPanTargetBlocking = (
  target: number[],
  previous: number[],
  scale: number,
  viewportWidth: number,
  viewportHeight: number,
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
): [number, number, number] => {
  const clampAxis = (
    center: number,
    prev: number,
    min: number,
    max: number,
    viewportPx: number,
  ) => {
    const [lo, hi] = panAxisLimits(min, max, viewportPx, scale);
    // Relax whichever bound `prev` sits beyond, so the view is never pulled inward.
    return Math.min(Math.max(hi, prev), Math.max(Math.min(lo, prev), center));
  };
  return [
    clampAxis(
      target[0] ?? 0,
      previous[0] ?? 0,
      bounds.minX,
      bounds.maxX,
      viewportWidth,
    ),
    clampAxis(
      target[1] ?? 0,
      previous[1] ?? 0,
      bounds.minY,
      bounds.maxY,
      viewportHeight,
    ),
    target[2] ?? 0,
  ];
};

/**
 * Clip a screen-space segment `a → b` to the rect `[0, 0] … [width, height]`
 * (Liang–Barsky), returning the visible sub-segment or `null` if it lies wholly
 * outside. Used to find the part of a hovered edge that is actually on screen.
 */
const clipSegmentToViewport = (
  a: [number, number],
  b: [number, number],
  width: number,
  height: number,
): [[number, number], [number, number]] | null => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  // Each boundary as (pk, qk): inside where `pk * t <= qk` (Liang–Barsky).
  const tests: [number, number][] = [
    [-dx, a[0]],
    [dx, width - a[0]],
    [-dy, a[1]],
    [dy, height - a[1]],
  ];
  let t0 = 0;
  let t1 = 1;
  for (const [pk, qk] of tests) {
    if (pk === 0) {
      // Parallel to this boundary: reject only if it starts outside it.
      if (qk < 0) {
        return null;
      }
      continue;
    }
    const rk = qk / pk;
    if (pk < 0) {
      if (rk > t1) {
        return null;
      }
      if (rk > t0) {
        t0 = rk;
      }
    } else {
      if (rk < t0) {
        return null;
      }
      if (rk < t1) {
        t1 = rk;
      }
    }
  }
  return [
    [a[0] + t0 * dx, a[1] + t0 * dy],
    [a[0] + t1 * dx, a[1] + t1 * dy],
  ];
};

/**
 * The point at the middle of a polyline's on-screen length: project each vertex,
 * clip every segment to the viewport, then walk to half the total visible arc
 * length. This lands the edge label at the centre of the edge, or — when the edge
 * runs off screen — at the centre of the portion still in view. Returns `null`
 * when no part of the polyline is visible.
 */
const edgeLabelAnchor = (
  screenPoints: [number, number][],
  width: number,
  height: number,
): [number, number] | null => {
  const segments: [[number, number], [number, number], number][] = [];
  let totalLength = 0;
  for (let index = 0; index + 1 < screenPoints.length; index += 1) {
    const start = screenPoints[index];
    const end = screenPoints[index + 1];
    if (!start || !end) {
      continue;
    }
    const clipped = clipSegmentToViewport(start, end, width, height);
    if (!clipped) {
      continue;
    }
    const length = Math.hypot(
      clipped[1][0] - clipped[0][0],
      clipped[1][1] - clipped[0][1],
    );
    segments.push([clipped[0], clipped[1], length]);
    totalLength += length;
  }
  const first = segments[0];
  if (!first) {
    return null;
  }
  if (totalLength === 0) {
    // Every visible part is a single point (e.g. a dot-length edge): use it.
    return first[0];
  }
  let remaining = totalLength / 2;
  for (const [start, end, length] of segments) {
    if (remaining <= length) {
      const fraction = length === 0 ? 0 : remaining / length;
      return [
        start[0] + (end[0] - start[0]) * fraction,
        start[1] + (end[1] - start[1]) * fraction,
      ];
    }
    remaining -= length;
  }
  return first[0];
};

const roundRectPath = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void => {
  const clampedRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + clampedRadius, y);
  ctx.arcTo(x + width, y, x + width, y + height, clampedRadius);
  ctx.arcTo(x + width, y + height, x, y + height, clampedRadius);
  ctx.arcTo(x, y + height, x, y, clampedRadius);
  ctx.arcTo(x, y, x + width, y, clampedRadius);
  ctx.closePath();
};

/** Draw the edge label pill (white fill, black outline) centred at `anchor`. */
const drawEdgeLabel = (
  ctx: CanvasRenderingContext2D,
  anchor: [number, number],
  text: string,
): void => {
  ctx.font = `${EDGE_LABEL_FONT_SIZE}px ${EDGE_LABEL_FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const textWidth = ctx.measureText(text).width;
  const rectWidth = textWidth + EDGE_LABEL_PADDING_X * 2;
  const rectHeight = EDGE_LABEL_FONT_SIZE + EDGE_LABEL_PADDING_Y * 2;
  const [centerX, centerY] = anchor;
  roundRectPath(
    ctx,
    centerX - rectWidth / 2,
    centerY - rectHeight / 2,
    rectWidth,
    rectHeight,
    EDGE_LABEL_RADIUS,
  );
  ctx.fillStyle = EDGE_LABEL_BACKGROUND;
  ctx.fill();
  ctx.lineWidth = EDGE_LABEL_BORDER_WIDTH;
  ctx.strokeStyle = EDGE_LABEL_BORDER;
  ctx.stroke();
  ctx.fillStyle = EDGE_LABEL_INK;
  ctx.fillText(text, centerX, centerY);
};

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

type ArrowIconAtlas = {
  url: string;
  mapping: DetailIconAtlas["mapping"];
};

let arrowIconAtlasCache: ArrowIconAtlas | null = null;

/**
 * A solid-triangle sprite (white mask, tinted via the layer's `getColor`) pointing
 * along +x, anchored at its tip so a per-arrow pixel offset places the tip exactly.
 * Rasterised once and cached; `null` outside the browser.
 */
const arrowIconAtlas = (): ArrowIconAtlas | null => {
  if (arrowIconAtlasCache) {
    return arrowIconAtlasCache;
  }
  if (typeof document === "undefined") {
    return null;
  }
  const size = ARROW_ICON_TEXTURE;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return null;
  }
  // Equilateral triangle pointing along +x, height `side · √3/2`, centred in the canvas.
  const side = size * 0.8;
  const height = (side * Math.sqrt(3)) / 2;
  const tipX = (size + height) / 2;
  const baseX = (size - height) / 2;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(tipX, size / 2);
  ctx.lineTo(baseX, size / 2 - side / 2);
  ctx.lineTo(baseX, size / 2 + side / 2);
  ctx.closePath();
  ctx.fill();
  arrowIconAtlasCache = {
    url: canvas.toDataURL(),
    mapping: {
      arrow: {
        x: 0,
        y: 0,
        width: size,
        height: size,
        // Anchor at the tip so `getPosition` + `getPixelOffset` place the tip.
        anchorX: tipX,
        anchorY: size / 2,
        mask: true,
      },
    },
  };
  return arrowIconAtlasCache;
};

/**
 * Shorten a world-space polyline by `trim` world units from its **end** (target),
 * interpolating a new endpoint. Used to open the arrow's gap between a highlighted
 * edge and the node it points at.
 */
const trimPathEnd = (
  path: [number, number][],
  trim: number,
): [number, number][] => {
  if (path.length < 2 || trim <= 0) {
    return path;
  }
  let remaining = trim;
  for (let index = path.length - 1; index >= 1; index -= 1) {
    const end = path[index];
    const previous = path[index - 1];
    if (!end || !previous) {
      continue;
    }
    const dx = end[0] - previous[0];
    const dy = end[1] - previous[1];
    const segment = Math.hypot(dx, dy);
    if (segment === 0) {
      continue;
    }
    if (remaining < segment) {
      const fraction = remaining / segment;
      return [
        ...path.slice(0, index),
        [end[0] - dx * fraction, end[1] - dy * fraction],
      ];
    }
    remaining -= segment;
  }
  // The trim consumed the whole path (edge shorter than the gap): draw nothing.
  const first = path[0];
  return first ? [first, first] : path;
};

/**
 * Shorten a polyline from both ends — `startTrim` world units off the source end
 * and `endTrim` off the target end — so a detail-view edge stops at each node's
 * edge instead of running to its centre (under the translucent node).
 */
const trimPathBothEnds = (
  path: [number, number][],
  startTrim: number,
  endTrim: number,
): [number, number][] => {
  let result = trimPathEnd(path, endTrim);
  if (startTrim > 0 && result.length >= 2) {
    result = [...trimPathEnd([...result].reverse(), startTrim)].reverse();
  }
  return result;
};

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
  nodeMinDistance,
  className,
  selected,
  selectedEdge,
  onSelectedPositionChange,
  onNodeHover,
  onNodeClick,
  onEdgeHover,
  onEdgeClick,
  onZoom,
  ref,
}: NetworkGraphProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const deckRef = useRef<DeckGLRef>(null);
  const labelCanvasRef = useRef<HTMLCanvasElement>(null);
  // Pointer-down position, to tell a click apart from a pan on release.
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null);
  // Last zoom reported to `onZoom`, so we only fire on actual zoom changes.
  const lastZoomRef = useRef<number | null>(null);
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

  // The {@link NetworkGraphSelection} when `selected` is one (not a node id), else null.
  const overlaySelection = useMemo(
    () => (selected != null && typeof selected === "object" ? selected : null),
    [selected],
  );

  /**
   * The overlay selection's point + neighbours **not** already in the graph — the
   * items to add. Existing items are omitted here so they aren't drawn twice.
   */
  const overlayPoints = useMemo<NetworkGraphPoint[]>(() => {
    if (!overlaySelection) {
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
    add(overlaySelection.point);
    for (const neighbour of overlaySelection.neighbours) {
      add(neighbour);
    }
    return result;
  }, [overlaySelection, pointById]);

  // The overlay selection's point + neighbours keyed by id.
  const overlayPointById = useMemo(() => {
    const map = new Map<NetworkGraphId, NetworkGraphPoint>();
    if (overlaySelection) {
      map.set(overlaySelection.point.id, overlaySelection.point);
      for (const neighbour of overlaySelection.neighbours) {
        map.set(neighbour.id, neighbour);
      }
    }
    return map;
  }, [overlaySelection]);

  const overlayEdgeById = useMemo(() => {
    const map = new Map<NetworkGraphId, NetworkGraphEdge>();
    if (overlaySelection) {
      for (const edge of overlaySelection.edges) {
        map.set(edge.id, edge);
      }
    }
    return map;
  }, [overlaySelection]);

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

  // {@link colorByHex} extended with any overlay points' colours.
  const colorByHexWithOverlay = useMemo(() => {
    if (overlayPoints.length === 0) {
      return colorByHex;
    }
    const map = new Map(colorByHex);
    for (const point of overlayPoints) {
      if (!map.has(point.color)) {
        map.set(point.color, hexToRgb(point.color));
      }
    }
    return map;
  }, [colorByHex, overlayPoints]);

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
   * The externally selected node: by id, or an overlay selection's `point`
   * (preferring the graph's copy when that id exists).
   */
  const selectedPoint = useMemo(() => {
    if (selected == null) {
      return null;
    }
    if (typeof selected === "object") {
      return pointById.get(selected.point.id) ?? selected.point;
    }
    return pointById.get(selected) ?? null;
  }, [selected, pointById]);

  // The node whose neighbourhood is highlighted: hovered, else externally selected.
  const activeNode = useMemo(
    () => hovered ?? selectedPoint,
    [hovered, selectedPoint],
  );

  /**
   * The selected node while a *different* node is hovered: backgrounded, so it keeps
   * a dimmed selected ring while the hovered node owns the active highlight (edges +
   * neighbours). Null when nothing's hovered, or the hover is the selection itself.
   */
  const dimmedSelectedNode = useMemo(
    () =>
      hovered && selectedPoint && hovered.id !== selectedPoint.id
        ? selectedPoint
        : null,
    [hovered, selectedPoint],
  );

  /**
   * Edges + neighbour nodes for the active node. Taken from an overlay selection's
   * provided `edges`/`neighbours` when it is the active node, else from the graph's
   * adjacency.
   */
  const highlight = useMemo(() => {
    if (!activeNode) {
      return null;
    }
    const useOverlay =
      overlaySelection != null && activeNode.id === overlaySelection.point.id;
    const incident = useOverlay
      ? overlaySelection.edges
      : (adjacency.get(activeNode.id) ?? []);
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
      neighbourIds.add(edge.fromId === activeNode.id ? edge.toId : edge.fromId);
    }
    const neighbours: NetworkGraphPoint[] = [];
    if (useOverlay) {
      // Use the explicitly-provided neighbours, resolved to their graph copy.
      for (const neighbour of overlaySelection.neighbours) {
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
  }, [activeNode, overlaySelection, adjacency, resolvePoint]);

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
      // Cap zoom-out so the whole network plus a `ZOOM_OUT_MARGIN` margin fills the viewport.
      const minZoom = fitZoom(outPadding);
      // Furthest zoom-in: the closest two nodes sit `2 · detailHoverRadius + 10px`
      // apart on screen (their hovered detail circles clear by a 10px gap). Scale is
      // `2 ** zoom` px/world unit, so solve `nodeMinDistance · 2 ** maxZoom = target`.
      // Falls back to a fixed offset above framing when spacing is unknown (empty or
      // single-node graph, where `nodeMinDistance` is 0/Infinity).
      const detailHoverRadius = 1;
      const targetClosestPx = detailHoverRadius;
      // Floored at `minZoom` so a very sparse graph never yields an inverted zoom range.
      const maxZoom = Math.max(
        minZoom,
        Number.isFinite(nodeMinDistance) && nodeMinDistance > 0
          ? Math.log2(targetClosestPx / nodeMinDistance)
          : framingZoom + MAX_ZOOM_OFFSET,
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
            // Start fully zoomed out.
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
  }, [graphBounds, nodeMinDistance]);

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

  // Everything the view derives from the current zoom, computed together by {@link deriveZoomAttributes}.
  const { radiusScale, pointOpacity, arrowGapPx, isDetailZoom } = useMemo(
    () =>
      deriveZoomAttributes(
        currentZoom,
        // Detail view shows in the top 0.5 zoom levels, just below the max zoom.
        viewState?.maxZoom != null ? viewState.maxZoom - 0.5 : null,
      ),
    [currentZoom, viewState?.maxZoom],
  );

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
              POINT_RADIUS * HOVERED_RADIUS_MULTIPLIER * radiusScale,
            ),
          ),
    [isDetailZoom, radiusScale],
  );

  /** Which node rendering is showing, reported to consumers alongside position. */
  const nodeVariant: "detailed" | "compact" = isDetailZoom
    ? "detailed"
    : "compact";

  /**
   * Report the selected node's on-screen position, re-projecting on every view
   * change so a consumer's overlay tracks the node as it zooms/pans. Reports `null`
   * while the anchor lies outside the chart bounds, so the overlay is hidden until
   * the node comes back into view.
   */
  useEffect(() => {
    if (!onSelectedPositionChange) {
      return;
    }
    const element = containerRef.current;
    if (!element || !viewState || !selectedPoint) {
      onSelectedPositionChange(null);
      return;
    }
    const { width, height } = element.getBoundingClientRect();
    const viewport = view.makeViewport({ width, height, viewState });
    if (!viewport) {
      onSelectedPositionChange(null);
      return;
    }
    const [x = 0, y = 0] = viewport.project([selectedPoint.x, selectedPoint.y]);
    // Hide once the anchor leaves the viewport; show again when it pans/zooms back in.
    if (x < 0 || x > width || y < 0 || y > height) {
      onSelectedPositionChange(null);
      return;
    }
    onSelectedPositionChange({
      x,
      y,
      nodeRadius: activeNodeRadius,
      variant: nodeVariant,
    });
  }, [
    onSelectedPositionChange,
    selectedPoint,
    viewState,
    view,
    activeNodeRadius,
    nodeVariant,
  ]);

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
      const info = deck.pickObject({
        x,
        y,
        radius: CLICK_PICK_RADIUS_PX,
      });
      // Arrows are pickable (compact) only to intercept picks in the arrow gap; a
      // click on one is a no-op.
      if (info?.layer?.id === "edge-arrows") {
        return;
      }
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
    [onNodeClick, onEdgeClick, resolveEdge, activeNodeRadius, nodeVariant],
  );

  // Report zoom changes from an effect (after commit), not inline: `setViewState`
  // updaters run during render, so calling `onZoom` there would update the parent
  // mid-render. Deduped so it fires only on an actual change.
  useEffect(() => {
    if (currentZoom === null || currentZoom === lastZoomRef.current) {
      return;
    }
    lastZoomRef.current = currentZoom;
    onZoom?.(currentZoom);
  }, [currentZoom, onZoom]);

  /**
   * Nudge the zoom by `delta` levels about the viewport centre, clamped to
   * `minZoom`/`maxZoom`. A zoom-in leaves the pan `target` untouched so it never
   * yanks the view sideways; a zoom-out hard-clamps the target on every edge (see
   * {@link clampPanTarget}) so the network stays framed — matching the wheel path.
   * Backs the imperative {@link NetworkGraphHandle}.
   */
  const applyZoomDelta = useCallback(
    (delta: number) => {
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
                graphBounds,
              )
            : previous.target;
        return { ...previous, zoom: next, target };
      });
    },
    [graphBounds],
  );

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
          graphBounds,
        );
        return { ...previous, zoom: next, target: nextTarget };
      });
    },
    [view, graphBounds],
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
   * Whether any edges are hoverable in the current view: always in detail, and in
   * compact only while a node is selected (its incident lines).
   */
  const edgesHoverable = useMemo(
    () => isDetailZoom || selected != null,
    [isDetailZoom, selected],
  );

  /**
   * The node hierarchy used to bundle detail-view edges. Viewport-independent, so
   * built once per node set.
   */
  const bundleHierarchy = useMemo(() => buildBundleHierarchy(points), [points]);

  /**
   * The externally selected edge as a {@link HoverableEdge}, so it can get the same
   * emphasis as a hovered edge. Its `path` matches how the edge is drawn in the
   * current view (bundled curve in detail, straight line in compact) so the label
   * lands on the edge.
   */
  const selectedEdgeHoverable = useMemo<HoverableEdge | null>(() => {
    if (selectedEdge == null) {
      return null;
    }
    const edge = resolveEdge(selectedEdge);
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
  }, [selectedEdge, resolveEdge, resolvePoint, isDetailZoom, bundleHierarchy]);

  /**
   * The edge shown with edge-hover emphasis: hovered, else externally selected.
   * Mirrors {@link activeNode} for edges.
   */
  const activeEdge = useMemo(
    () => hoveredEdge ?? selectedEdgeHoverable,
    [hoveredEdge, selectedEdgeHoverable],
  );

  /**
   * Whether the active edge is actually drawn now, so its emphasis (label pill,
   * compact endpoint outlines) only shows when there's an edge on screen. Always
   * true in detail; in compact only when it's one of the active node's shown lines.
   * Matters for a *selected* edge once a different node is hovered: compact swaps to
   * that node's edges, so the selected edge's label/outlines must not linger.
   */
  const activeEdgeShown = useMemo(
    () =>
      edgesHoverable &&
      activeEdge != null &&
      (isDetailZoom ||
        (highlight?.lines ?? []).some((line) => line.id === activeEdge.edgeId)),
    [edgesHoverable, activeEdge, isDetailZoom, highlight],
  );

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
    drawEdgeLabel(ctx, anchor, `Edge ${activeEdge.edgeId}`);
  }, [activeEdge, activeEdgeShown, viewState, containerSize, view]);

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
    const useOverlay =
      overlaySelection != null && activeNode.id === overlaySelection.point.id;
    const incident = useOverlay
      ? overlaySelection.edges
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
    overlaySelection,
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
      // The target node's on-screen radius: fixed in the detail view; the active
      // node's or a neighbour's grow-ring radius in the compact view.
      const targetIsActive = resolveEdge(edgeId)?.toId === activeNode?.id;
      const targetRadius = isDetailZoom
        ? DETAIL_NODE_DIAMETER / 2
        : targetIsActive
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
      for (const line of highlight?.lines ?? []) {
        addArrow(line.id, line.target, line.source);
      }
    }
    return list;
  }, [
    isDetailZoom,
    highlightEdgePaths,
    activeFullEdge,
    highlight,
    resolveEdge,
    activeNode,
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
   * The compact view's prominent (arrowed) edges — the active node's straight
   * incident lines — each with its target pulled back by the node radius + gap, so
   * the arrow's gap sits empty. Empty in the detail view.
   */
  const trimmedHighlightLines = useMemo<HoverLine[]>(() => {
    if (isDetailZoom) {
      return [];
    }
    const lines = highlight?.lines ?? [];
    if (currentZoom == null) {
      return lines;
    }
    const scale = 2 ** currentZoom;
    return lines.map((line) => {
      const toId = resolveEdge(line.id)?.toId;
      const targetRadius =
        toId === activeNode?.id ? HOVERED_MIN_RADIUS : NEIGHBOUR_MIN_RADIUS;
      const worldTrim = (targetRadius + arrowGapPx) / scale;
      const dx = line.target[0] - line.source[0];
      const dy = line.target[1] - line.source[1];
      const length = Math.hypot(dx, dy);
      const fraction = length <= worldTrim ? 0 : (length - worldTrim) / length;
      return {
        id: line.id,
        source: line.source,
        target: [
          line.source[0] + dx * fraction,
          line.source[1] + dy * fraction,
        ],
      };
    });
  }, [
    isDetailZoom,
    highlight,
    currentZoom,
    resolveEdge,
    activeNode,
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
      : selected != null && dimmedSelectedNode == null;
    const hoveredEdgeId = edgesHoverable ? (activeEdge?.edgeId ?? null) : null;

    const compact = new CompactNodeLayer({
      id: "compact-nodes",
      // Resolves picking when shown; the detailed nodes do so in detail zoom (its
      // points are hidden there).
      pickable: true,
      data: points,
      // The active node's incident edges as straight lines (detail draws bundled
      // curves via `highlightEdgePaths` instead). Trimmed at the target to open the gap.
      edges: trimmedHighlightLines,
      // All edges touching visible nodes minus the prominent ones, bundled and drawn
      // faintly in detail. The prominent edges are drawn by a separate layer above.
      backgroundEdgePaths: trimmedBackgroundEdgePaths,
      hoveredEdgeId,
      highlightEdgesPickable,
      backgroundEdgesPickable,
      edgeHoverNodes,
      neighbours: highlight?.neighbours ?? [],
      activeNode,
      dimmedSelectedNode,
      colorByHex: colorByHexWithOverlay,
      radiusScale,
      pointOpacity,
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
          edgeHoverNodes: [],
          neighbours: [],
          activeNode,
          dimmedSelectedNode: null,
          colorByHex: colorByHexWithOverlay,
          radiusScale,
          pointOpacity,
          dimmed: false,
          showGrowHighlights: true,
          showPoints: false,
        }),
      );
    }
    return nodeLayers;
  }, [
    points,
    highlight,
    trimmedBackgroundEdgePaths,
    trimmedHighlightEdgePaths,
    trimmedHighlightLines,
    arrows,
    activeEdge,
    activeEdgeShown,
    edgesHoverable,
    selected,
    activeNode,
    dimmedSelectedNode,
    colorByHexWithOverlay,
    radiusScale,
    pointOpacity,
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
          onHover={(info: PickingInfo) => {
            // Ignore arrow picks (compact) so hovering the arrow gap leaves the hover
            // unchanged rather than hovering the edge behind.
            if (info.layer?.id === "edge-arrows") {
              return;
            }
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
                        graphBounds,
                      )
                    : clampPanTargetBlocking(
                        raw.target as number[],
                        (previous?.target as number[] | undefined) ??
                          (raw.target as number[]),
                        2 ** zoom,
                        rect.width,
                        rect.height,
                        graphBounds,
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
