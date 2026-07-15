import { OrthographicView } from "@deck.gl/core";
import { DeckGL, type DeckGLRef } from "@deck.gl/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { css, cx } from "@hashintel/ds-helpers/css";

import { CompactNodeLayer } from "./compact-node-layer";
import { DetailedNodeLayer } from "./detailed-node-layer";
import {
  DETAIL_ICON_TEXTURE,
  hexToRgb,
  iconTextureUrl,
} from "./network-graph-util";

import type {
  DetailIconAtlas,
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
const MAX_ZOOM_OFFSET = 7;
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
/** Point opacity when zoomed all the way out; fades in to {@link POINT_OPACITY} at mid-zoom. */
const POINT_MIN_OPACITY = 0.5;
/** Zoom-range fraction at/above which points are fully opaque (below, they fade out as you zoom out). */
const OPACITY_FULL_FRACTION = 0.5;
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
 * Extra viewport margin (px) within which nodes are still included, so a node
 * (or its label) straddling the edge isn't culled away.
 */
const DETAIL_VIEWPORT_MARGIN_PX = 80;

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
  // Pointer-down position, to tell a click apart from a pan on release.
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null);
  // Last zoom reported to `onZoom`, so we only fire on actual zoom changes.
  const lastZoomRef = useRef<number | null>(null);
  // Last hovered node id reported to `onNodeHover` (`null` when none), so we
  // only fire when the hovered node actually changes.
  const lastHoveredIdRef = useRef<number | null>(null);
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
      lines.push({ source: [from.x, from.y], target: [to.x, to.y] });
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
      // Only the compact layer's `points` sublayer is pickable, so no
      // `layerIds` filter is needed to resolve the node under the pointer.
      const info = deck.pickObject({
        x,
        y,
        radius: CLICK_PICK_RADIUS_PX,
      });
      const point = (info?.object as NetworkGraphPoint | undefined) ?? null;
      onNodeClick?.({ point, x, y });
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
   * Point opacity as a function of zoom: {@link POINT_MIN_OPACITY} when zoomed
   * all the way out, rising linearly to full opacity at the midpoint of the zoom
   * range and staying fully opaque as the view zooms further in.
   */
  const pointOpacity = useMemo(() => {
    if (currentZoom === null || referenceZoom === null) {
      return POINT_OPACITY;
    }
    const minZoom = referenceZoom + MIN_ZOOM_OFFSET;
    const maxZoom = referenceZoom + MAX_ZOOM_OFFSET;
    const fraction = (currentZoom - minZoom) / (maxZoom - minZoom);
    const fade = Math.min(1, Math.max(0, fraction / OPACITY_FULL_FRACTION));
    return POINT_MIN_OPACITY + fade * (POINT_OPACITY - POINT_MIN_OPACITY);
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

  const layers = useMemo(() => {
    const compact = new CompactNodeLayer({
      id: "compact-nodes",
      // Only this composite (its `points` sublayer) resolves picking.
      pickable: true,
      data: points,
      edges: highlight?.lines ?? [],
      neighbours: highlight?.neighbours ?? [],
      activeNode,
      colorByHex,
      radiusScale,
      pointOpacity,
      dimmed: highlight !== null,
      // In the detail variation the grow highlights give way to the detailed
      // layer's colour-matched outline.
      showGrowHighlights: !isDetailZoom,
    });

    if (!isDetailZoom) {
      return [compact];
    }

    return [
      compact,
      new DetailedNodeLayer({
        id: "detailed-nodes",
        data: detailPoints,
        activeNode,
        colorByHex,
        iconAtlas,
      }),
    ];
  }, [
    points,
    highlight,
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
          onHover={(info: PickingInfo) => {
            const object =
              (info.object as NetworkGraphPoint | undefined) ?? null;
            const id = object?.id ?? null;
            // Only react when the hovered node changes (including to no node).
            if (id === lastHoveredIdRef.current) {
              return;
            }
            lastHoveredIdRef.current = id;
            setHovered(object);
            onNodeHover?.({ point: object, x: info.x, y: info.y });
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
    </div>
  );
};
