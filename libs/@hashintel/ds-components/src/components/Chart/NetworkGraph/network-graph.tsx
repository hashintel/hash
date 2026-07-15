import { OrthographicView } from "@deck.gl/core";
import { DeckGL, type DeckGLRef } from "@deck.gl/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { css, cx } from "@hashintel/ds-helpers/css";

import { CompactNodeLayer } from "./compact-node-layer";
import { DetailedNodeLayer } from "./detailed-node-layer";
import { buildBundleHierarchy, bundleEdgePath } from "./edge-bundling";
import {
  DETAIL_ICON_TEXTURE,
  hexToRgb,
  iconTextureUrl,
} from "./network-graph-util";

import type { BundledEdge } from "./edge-bundling";
import type {
  DetailIconAtlas,
  HoverableEdge,
  HoverLine,
  NetworkGraphPoint,
  NetworkGraphEdge,
} from "./network-graph-util";
import type { OrthographicViewState, PickingInfo } from "@deck.gl/core";

// Re-export the data types (which live in `network-graph-util`) so consumers can
// keep importing them from `network-graph`, the component's public entry point.
export type { NetworkGraphEdge, NetworkGraphPoint } from "./network-graph-util";

/** A pointer interaction (hover or click) with the network graph. */
export interface NetworkGraphInteraction {
  /** The node under the pointer, or `null` when over empty space. */
  point: NetworkGraphPoint | null;
  /** Pointer x position in pixels, relative to the chart's top-left corner. */
  x: number;
  /** Pointer y position in pixels, relative to the chart's top-left corner. */
  y: number;
}

export interface NetworkGraphProps {
  /** The nodes to plot. */
  points: NetworkGraphPoint[];
  /** The connections between nodes. Only rendered while a node is hovered. */
  edges: NetworkGraphEdge[];
  /** Extra class name applied to the chart container. */
  className?: string;
  /**
   * Id of a node to highlight with the same treatment as hovering (edges,
   * neighbour rings and a prominent node). An active hover takes precedence.
   */
  selected?: number | null;
  /**
   * Called with the `selected` node's current on-screen position (CSS pixels,
   * relative to the chart's top-left) whenever it changes — including as the
   * user zooms or pans — or `null` when nothing is selected. Lets a consumer
   * anchor an overlay such as a tooltip to the node.
   */
  onSelectedPositionChange?: (
    position: { x: number; y: number } | null,
  ) => void;
  /**
   * Called when the hovered node changes, with the newly hovered node (or
   * `null` when the pointer leaves all nodes) and its pixel position. Not called
   * while the pointer stays over the same node.
   */
  onNodeHover?: (interaction: NetworkGraphInteraction) => void;
  /**
   * Called when the chart is clicked, with the clicked node (or `null` when
   * empty space is clicked) and its pixel position.
   */
  onNodeClick?: (interaction: NetworkGraphInteraction) => void;
  /**
   * Called when the zoom level changes, with the new zoom as a single number
   * (orthographic zoom is log2 scale). Not called for pure panning.
   */
  onZoom?: (zoom: number) => void;
}

/**
 * How strongly the point radius grows with zoom. At `0` the radius is fixed in
 * screen pixels; at `1` it scales 1:1 with the zoom's linear scale factor. `0.8`
 * grows the radius slightly sub-linearly as you zoom in.
 */
const ZOOM_RADIUS_RATE = 1;
/** Zoom range relative to the initial framing — how far out/in the user can zoom. */
const MIN_ZOOM_OFFSET = -2;
const MAX_ZOOM_OFFSET = 9;
/** Furthest zoom-out keeps the whole network in view plus this fractional margin. */
const ZOOM_OUT_MARGIN = 0.2;
/** Screen-space padding (px) the viewport may show beyond the network when panning. */
const PAN_PADDING_PX = 10;
/** Pointer travel (px) above which a release is treated as a pan, not a click. */
const CLICK_MOVE_THRESHOLD_PX = 4;
/** Picking radius (px) used to resolve the node under a click. */
const CLICK_PICK_RADIUS_PX = 4;
/** Base opacity of the points — subtly transparent so dense areas read as depth. */
const POINT_OPACITY = 1;
/**
 * Point opacity floor — used both when zoomed all the way out and, symmetrically,
 * when zoomed all the way in (as the detailed view takes over).
 */
const POINT_MIN_OPACITY = 0.5;
/** Zoom offset (from the reference framing) at which points reach full opacity while zooming in. */
const OPACITY_FULL_OFFSET = 2.5;
/**
 * Zoom offset at which points — after a couple of levels at full opacity — begin
 * fading back out as you keep zooming in, so the crowd recedes behind the
 * detailed view.
 */
const OPACITY_FADE_OUT_OFFSET = 4.5;
/**
 * Zoom offset (relative to the reference framing) at/above which the node layer
 * switches from the {@link CompactNodeLayer} to the {@link DetailedNodeLayer} —
 * larger nodes showing their icon and label pill. Sits just below the max so the
 * final zoom-in reveals it.
 */
const DETAIL_ZOOM_OFFSET = MAX_ZOOM_OFFSET - 0.5;
/**
 * Cap on how many detail nodes are fed to the {@link DetailedNodeLayer} at once —
 * a safety net for dense clusters; at max zoom only a handful are ever in view.
 */
const DETAIL_MAX_NODES = 1500;
/**
 * Cap on how many edges are drawn in the detail view at once. Above this the
 * edges are sampled round-robin across the visible nodes (see the
 * `detailEdgePaths` memo) so the budget is spread evenly over nodes rather than
 * spent on a few high-degree hubs — keeping the drawn edges relatively uniform
 * across the graph. A safety net against dense clusters bundling thousands of
 * paths per frame.
 */
const DETAIL_MAX_EDGES = 400;
/**
 * Extra viewport margin (px) within which nodes are still included, so a node
 * (or its label) straddling the edge isn't culled away.
 */
const DETAIL_VIEWPORT_MARGIN_PX = 80;
/**
 * Picking tolerance (px) around the pointer for deck.gl's hover picking, so the
 * thin edges can actually be hovered without pixel-perfect aim. Nodes still win
 * where they overlap an edge, being drawn on top.
 */
const EDGE_PICK_RADIUS_PX = 5;
/**
 * Style of the pill drawn on a hovered edge, mirroring the detail node label (see
 * `detailed-node-layer.ts`) — same font, ink, padding and radius — but outlined
 * in black rather than the node's colour. Drawn imperatively on a 2D overlay
 * canvas (not a deck.gl layer) so it can track the edge's on-screen centre as the
 * view pans and zooms.
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
 * Clamp an orthographic pan `target` so the viewport never shows more than
 * {@link PAN_PADDING_PX} beyond the network's bounding box. `scale` is the
 * world→pixel factor (`2 ** zoom`); `viewport{Width,Height}` are in CSS pixels.
 * Works both when the viewport is smaller than the network (pan within it) and
 * when it is larger (pan the network around inside it) — in either case the
 * network can be nudged until only the padding remains on the trailing side.
 */
const clampPanTarget = (
  target: number[],
  scale: number,
  viewportWidth: number,
  viewportHeight: number,
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
): [number, number, number] => {
  const pad = PAN_PADDING_PX / scale;
  const clampAxis = (
    center: number,
    min: number,
    max: number,
    viewportPx: number,
  ) => {
    const half = viewportPx / (2 * scale);
    // The two per-side limits (viewport may show at most `pad` beyond each
    // edge). Zoomed in they order as [lo, hi]; zoomed out they swap — sorting
    // covers both, so panning is always allowed right up to the padding.
    const a = min - pad + half;
    const b = max + pad - half;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    return Math.min(hi, Math.max(lo, center));
  };
  return [
    clampAxis(target[0] ?? 0, bounds.minX, bounds.maxX, viewportWidth),
    clampAxis(target[1] ?? 0, bounds.minY, bounds.maxY, viewportHeight),
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
  // Each boundary as (pk, qk): the segment is inside this boundary where
  // `pk * t <= qk` (Liang–Barsky).
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

/** Trace a rounded-rect path (no fill/stroke) on a 2D context. */
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
  className,
  selected,
  onSelectedPositionChange,
  onNodeHover,
  onNodeClick,
  onZoom,
}: NetworkGraphProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const deckRef = useRef<DeckGLRef>(null);
  // The overlay canvas the hovered-edge label is drawn on.
  const labelCanvasRef = useRef<HTMLCanvasElement>(null);
  // Pointer-down position, to tell a click apart from a pan on release.
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null);
  // Last zoom reported to `onZoom`, so we only fire on actual zoom changes.
  const lastZoomRef = useRef<number | null>(null);
  // Last hovered node id reported to `onNodeHover` (`null` when none), so we
  // only fire when the hovered node actually changes.
  const lastHoveredIdRef = useRef<number | null>(null);
  // Id of the currently hovered edge, so we only update state when it changes.
  const hoveredEdgeIdRef = useRef<number | null>(null);
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
  // The edge under the pointer, if any, drawn emphasised with a label pill.
  const [hoveredEdge, setHoveredEdge] = useState<HoverableEdge | null>(null);
  // The zoom the graph was first framed at, used as the reference point from
  // which the point radius grows as the user zooms in.
  const [referenceZoom, setReferenceZoom] = useState<number | null>(null);

  const view = useMemo(() => new OrthographicView({ id: "network-graph" }), []);

  /** Resolve each distinct hex colour to rgb once (there are only a few). */
  const colorByHex = useMemo(() => {
    const map = new Map<string, [number, number, number]>();
    for (const point of points) {
      if (!map.has(point.color)) {
        map.set(point.color, hexToRgb(point.color));
      }
    }
    return map;
  }, [points]);

  /** Bounding box of all points, used to frame the initial view. */
  const bounds = useMemo(() => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
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
    if (!Number.isFinite(minX)) {
      minX = 0;
      maxX = 0;
      minY = 0;
      maxY = 0;
    }
    return {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX,
      height: maxY - minY,
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2,
    };
  }, [points]);

  /** Look up a point by id, for resolving edge endpoints. */
  const pointById = useMemo(() => {
    const map = new Map<number, NetworkGraphPoint>();
    for (const point of points) {
      map.set(point.id, point);
    }
    return map;
  }, [points]);

  /** Adjacency list: node id → edges touching it. */
  const adjacency = useMemo(() => {
    const map = new Map<number, NetworkGraphEdge[]>();
    const push = (id: number, edge: NetworkGraphEdge) => {
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
   * The node whose neighbourhood is highlighted: the hovered node, or — when
   * nothing is hovered — the externally `selected` node.
   */
  const activeNode = useMemo(() => {
    if (hovered) {
      return hovered;
    }
    if (selected != null) {
      return pointById.get(selected) ?? null;
    }
    return null;
  }, [hovered, selected, pointById]);

  /** Edges + neighbour nodes for the active (hovered or selected) node. */
  const highlight = useMemo(() => {
    if (!activeNode) {
      return null;
    }
    const incident = adjacency.get(activeNode.id) ?? [];
    const lines: HoverLine[] = [];
    const neighbourIds = new Set<number>();
    for (const edge of incident) {
      const from = pointById.get(edge.fromId);
      const to = pointById.get(edge.toId);
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
    for (const id of neighbourIds) {
      const point = pointById.get(id);
      if (point) {
        neighbours.push(point);
      }
    }
    return { lines, neighbours };
  }, [activeNode, adjacency, pointById]);

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
      const zoomX = Math.log2((width * padding) / (bounds.width || 1));
      const zoomY = Math.log2((height * padding) / (bounds.height || 1));
      const zoom = Math.min(zoomX, zoomY);
      // Cap zoom-out so the whole network plus a `ZOOM_OUT_MARGIN` margin fills
      // the viewport — i.e. the view can never span more than that much world.
      const outPadding = 1 / (1 + ZOOM_OUT_MARGIN);
      const minZoom = Math.min(
        Math.log2((width * outPadding) / (bounds.width || 1)),
        Math.log2((height * outPadding) / (bounds.height || 1)),
      );
      // Capture the first framing as the reference for zoom-based radius growth.
      setReferenceZoom((previous) => previous ?? zoom);
      // Only auto-frame until the user takes control of the view.
      setViewState(
        (previous) =>
          previous ?? {
            target: [bounds.centerX, bounds.centerY, 0],
            zoom,
            minZoom,
            maxZoom: zoom + MAX_ZOOM_OFFSET,
          },
      );
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => observer.disconnect();
  }, [bounds]);

  /**
   * Rasterise every icon used by the data into a single mask atlas for the
   * detail {@link IconLayer}. Async (images load off data URLs); the icons
   * simply appear once ready. Rebuilt only when the set of points changes.
   */
  useEffect(() => {
    const names = [
      ...new Set(points.flatMap((point) => (point.icon ? [point.icon] : []))),
    ];
    if (names.length === 0) {
      // Nothing to rasterise; any prior atlas simply goes unused (no icon data).
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
            image.src = iconTextureUrl(name);
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
  }, [points]);

  /**
   * Report the selected node's on-screen position, re-projecting on every view
   * change so a consumer's overlay can track the node as it zooms/pans.
   */
  useEffect(() => {
    if (!onSelectedPositionChange) {
      return;
    }
    const element = containerRef.current;
    const node = selected == null ? undefined : pointById.get(selected);
    if (!element || !viewState || !node) {
      onSelectedPositionChange(null);
      return;
    }
    const { width, height } = element.getBoundingClientRect();
    const viewport = view.makeViewport({ width, height, viewState });
    if (!viewport) {
      onSelectedPositionChange(null);
      return;
    }
    const [x = 0, y = 0] = viewport.project([node.x, node.y]);
    onSelectedPositionChange({ x, y });
  }, [onSelectedPositionChange, selected, pointById, viewState, view]);

  const handlePointerDown = useCallback((event: React.PointerEvent) => {
    pointerDownRef.current = { x: event.clientX, y: event.clientY };
  }, []);

  // Handle clicks ourselves off the native `pointerup` rather than deck.gl's
  // `onClick`: deck delays its click ~300ms to disambiguate a double-click,
  // which makes selection feel laggy. Picking synchronously here fires instantly.
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
      // Exactly one node sublayer is pickable at a time — the compact `points`
      // when zoomed out, the detailed nodes when zoomed in — so no `layerIds`
      // filter is needed to resolve the node under the pointer.
      const info = deck.pickObject({
        x,
        y,
        radius: CLICK_PICK_RADIUS_PX,
      });
      const object =
        (info?.object as
          | NetworkGraphPoint
          | HoverLine
          | BundledEdge
          | undefined) ?? null;
      // Edges are pickable too; a click landing on one (it carries `path` or
      // `source`, not node fields) is ignored so it leaves the selection intact.
      if (object && ("path" in object || "source" in object)) {
        return;
      }
      // Narrowed to a node (or null) by the guard above.
      onNodeClick?.({ point: object, x, y });
    },
    [onNodeClick],
  );

  /** Current zoom level as a single number (orthographic zoom may be a pair). */
  const currentZoom = useMemo(() => {
    const zoom = viewState?.zoom;
    if (zoom === undefined) {
      return null;
    }
    return Array.isArray(zoom) ? zoom[0] : zoom;
  }, [viewState?.zoom]);

  /**
   * Multiplier applied to every point radius so it grows as the user zooms in.
   * `2 ** (zoom - referenceZoom)` is the linear scale factor since orthographic
   * zoom is log2; raising it to {@link ZOOM_RADIUS_RATE} gives the desired rate.
   */
  const radiusScale = useMemo(() => {
    if (currentZoom === null || referenceZoom === null) {
      return 1;
    }
    return 2 ** (ZOOM_RADIUS_RATE * (currentZoom - referenceZoom));
  }, [currentZoom, referenceZoom]);

  /**
   * Point opacity as a function of zoom, as a three-part curve:
   * 1. fade in from {@link POINT_MIN_OPACITY} (fully zoomed out) to full opacity
   *    by {@link OPACITY_FULL_OFFSET},
   * 2. hold at full opacity through {@link OPACITY_FADE_OUT_OFFSET}, then
   * 3. fade back down to {@link POINT_MIN_OPACITY} by the max zoom, so the point
   *    crowd recedes again as the detailed view takes over.
   */
  const pointOpacity = useMemo(() => {
    if (currentZoom === null || referenceZoom === null) {
      return POINT_OPACITY;
    }
    const offset = currentZoom - referenceZoom;
    const lerp = (from: number, to: number, amount: number) =>
      from + (to - from) * Math.min(1, Math.max(0, amount));

    if (offset <= OPACITY_FULL_OFFSET) {
      const amount =
        (offset - MIN_ZOOM_OFFSET) / (OPACITY_FULL_OFFSET - MIN_ZOOM_OFFSET);
      return lerp(POINT_MIN_OPACITY, POINT_OPACITY, amount);
    }
    if (offset <= OPACITY_FADE_OUT_OFFSET) {
      return POINT_OPACITY;
    }
    const amount =
      (offset - OPACITY_FADE_OUT_OFFSET) /
      (MAX_ZOOM_OFFSET - OPACITY_FADE_OUT_OFFSET);
    return lerp(POINT_OPACITY, POINT_MIN_OPACITY, amount);
  }, [currentZoom, referenceZoom]);

  /**
   * Whether the view is zoomed in far enough to show the detailed node
   * variation (larger nodes with icons + label pills) instead of plain points.
   */
  const isDetailZoom = useMemo(() => {
    if (currentZoom === null || referenceZoom === null) {
      return false;
    }
    return currentZoom >= referenceZoom + DETAIL_ZOOM_OFFSET;
  }, [currentZoom, referenceZoom]);

  /**
   * Which edges, if any, are hoverable: the faint bundled `"background"` edges in
   * the detail view (always), the selected node's `"highlight"` incident lines in
   * the compact view (only while a node is selected), or `"none"`.
   */
  const hoverableEdgeKind = useMemo<"none" | "highlight" | "background">(
    () =>
      isDetailZoom ? "background" : selected != null ? "highlight" : "none",
    [isDetailZoom, selected],
  );

  /**
   * Draw the hovered edge's label on the overlay canvas, re-projecting on every
   * view change so the pill tracks the centre of the edge's on-screen portion as
   * the user pans and zooms. Clears the canvas when nothing is hovered, or when
   * edges aren't hoverable in the current view (so a label can't linger over an
   * edge that is no longer shown — e.g. after the selection is cleared).
   */
  useEffect(() => {
    const canvas = labelCanvasRef.current;
    if (!canvas || !containerSize) {
      return;
    }
    const { width, height } = containerSize;
    // Back the canvas at device resolution so the text stays crisp, then draw in
    // CSS pixels.
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
    if (!hoveredEdge || !viewState || hoverableEdgeKind === "none") {
      return;
    }
    const viewport = view.makeViewport({ width, height, viewState });
    if (!viewport) {
      return;
    }
    const screenPoints = hoveredEdge.path.map(
      (worldPoint): [number, number] => {
        const [x = 0, y = 0] = viewport.project([worldPoint[0], worldPoint[1]]);
        return [x, y];
      },
    );
    const anchor = edgeLabelAnchor(screenPoints, width, height);
    if (!anchor) {
      return;
    }
    drawEdgeLabel(ctx, anchor, `Edge ${hoveredEdge.edgeId}`);
  }, [hoveredEdge, hoverableEdgeKind, viewState, containerSize, view]);

  /**
   * The points fed to the detail layers: those within the viewport (plus a
   * margin), in world coordinates. Empty unless zoomed into the detail range.
   * Culling keeps the per-frame layer data small; capped at {@link DETAIL_MAX_NODES}.
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
    return visible;
  }, [isDetailZoom, viewState, containerSize, view, points]);

  /**
   * The node hierarchy used to bundle the detail-view edges (root → colour/type →
   * spatial sub-cluster → node). Independent of the viewport, so it is built once
   * per node set.
   */
  const bundleHierarchy = useMemo(() => buildBundleHierarchy(points), [points]);

  /**
   * Up to {@link DETAIL_MAX_EDGES} edges touching a currently visible detail node,
   * as bundled polylines — including edges whose other endpoint is off-screen, so
   * connections trailing out of view are still drawn. The detail view draws these
   * faintly so the whole graph's structure shows, not just the hovered node's
   * edges. Empty outside detail zoom. Walks the visible nodes' adjacency (cheap)
   * rather than the full edge list, deduping each edge, then routes it along
   * {@link bundleHierarchy}.
   *
   * Above the cap, edges are sampled **round-robin** across the visible nodes: on
   * round `k` we take each node's `k`-th incident edge before taking any node's
   * `(k+1)`-th. This spends the budget max-min fairly — every node's edges come in
   * early, high-degree hubs are truncated last — so the drawn edges stay relatively
   * uniform across nodes instead of a few hubs eating the whole budget. Taking
   * edges in adjacency (insertion) order keeps the chosen subset stable frame to
   * frame, avoiding flicker as the view pans. Work is bounded: it stops at the cap,
   * otherwise costs O(visible incidences) like the uncapped walk.
   */
  const detailEdgePaths = useMemo(() => {
    if (!isDetailZoom || detailPoints.length === 0) {
      return [];
    }
    const seen = new Set<number>();
    const paths: BundledEdge[] = [];
    for (let round = 0; paths.length < DETAIL_MAX_EDGES; round++) {
      // Any node still had an edge at this round's index — otherwise every node
      // is exhausted and we're done (before the cap).
      let anyRemaining = false;
      for (const point of detailPoints) {
        const incident = adjacency.get(point.id);
        if (!incident || round >= incident.length) {
          continue;
        }
        anyRemaining = true;
        const edge = incident[round];
        // Reached via `point` (in view), so at least one endpoint is visible;
        // draw each edge once even if it's later reached via its other endpoint.
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

  const layers = useMemo(() => {
    const compact = new CompactNodeLayer({
      id: "compact-nodes",
      // Picking resolves off the compact `points` sublayer when it is shown, and
      // off the detailed nodes otherwise (its points are hidden in detail zoom).
      pickable: true,
      data: points,
      edges: highlight?.lines ?? [],
      // All edges touching visible nodes, bundled and drawn faintly in detail view.
      backgroundEdgePaths: detailEdgePaths,
      hoveredEdgeId:
        hoverableEdgeKind === "none" ? null : (hoveredEdge?.edgeId ?? null),
      hoverableEdgeKind,
      neighbours: highlight?.neighbours ?? [],
      activeNode,
      colorByHex,
      radiusScale,
      pointOpacity,
      dimmed: highlight !== null,
      // In the detail variation the grow highlights give way to the detailed
      // layer's colour-matched outline.
      showGrowHighlights: !isDetailZoom,
      // Hide the compact crowd in detail zoom so it doesn't show through behind the
      // translucent detailed nodes; the layer still draws the faint background
      // edges and the hovered node's edges.
      showPoints: !isDetailZoom,
    });

    if (!isDetailZoom) {
      return [compact];
    }

    return [
      compact,
      new DetailedNodeLayer({
        id: "detailed-nodes",
        // With the compact points hidden, these nodes resolve picking.
        pickable: true,
        data: detailPoints,
        activeNode,
        colorByHex,
        iconAtlas,
      }),
    ];
  }, [
    points,
    highlight,
    detailEdgePaths,
    hoveredEdge,
    hoverableEdgeKind,
    activeNode,
    colorByHex,
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
          // Double-click-to-zoom off: clicks are handled via `pointerup` above.
          controller={{ doubleClickZoom: false }}
          layers={layers}
          // A small tolerance so the thin edges can be hovered without pixel-
          // perfect aim; nodes still win where they overlap, being drawn on top.
          pickingRadius={EDGE_PICK_RADIUS_PX}
          onHover={(info: PickingInfo) => {
            const object =
              (info.object as
                | NetworkGraphPoint
                | HoverLine
                | BundledEdge
                | undefined) ?? null;

            // Resolve a hovered edge from either representation: a bundled detail
            // edge carries `path`; a compact highlight line carries `source`.
            const edge: HoverableEdge | null =
              object && "path" in object
                ? { edgeId: object.edgeId, path: object.path }
                : object && "source" in object
                  ? {
                      edgeId: object.id,
                      path: [object.source, object.target],
                    }
                  : null;

            if (edge) {
              if (hoveredEdgeIdRef.current !== edge.edgeId) {
                hoveredEdgeIdRef.current = edge.edgeId;
                setHoveredEdge(edge);
              }
              // Hovering an edge drops the node hover but preserves the external
              // selection: `onNodeHover` is only told the pointer left the node
              // (`point: null`), which the consumer treats as "keep selection".
              if (lastHoveredIdRef.current !== null) {
                lastHoveredIdRef.current = null;
                setHovered(null);
                onNodeHover?.({ point: null, x: info.x, y: info.y });
              }
              return;
            }

            // Not over an edge — clear any edge hover, then handle node hover.
            if (hoveredEdgeIdRef.current !== null) {
              hoveredEdgeIdRef.current = null;
              setHoveredEdge(null);
            }
            const node = object as NetworkGraphPoint | null;
            const id = node?.id ?? null;
            // Only react when the hovered node changes (including to no node).
            if (id === lastHoveredIdRef.current) {
              return;
            }
            lastHoveredIdRef.current = id;
            setHovered(node);
            onNodeHover?.({ point: node, x: info.x, y: info.y });
          }}
          onViewStateChange={(params) => {
            const raw = params.viewState as OrthographicViewState;
            const zoom = Array.isArray(raw.zoom) ? raw.zoom[0] : raw.zoom;
            const rect = containerRef.current?.getBoundingClientRect();
            // Constrain panning so the view stays within the network + padding.
            const next: OrthographicViewState =
              rect && zoom !== undefined && raw.target
                ? {
                    ...raw,
                    target: clampPanTarget(
                      raw.target as number[],
                      2 ** zoom,
                      rect.width,
                      rect.height,
                      bounds,
                    ),
                  }
                : raw;
            setViewState(next);
            if (zoom !== undefined && zoom !== lastZoomRef.current) {
              lastZoomRef.current = zoom;
              onZoom?.(zoom);
            }
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
