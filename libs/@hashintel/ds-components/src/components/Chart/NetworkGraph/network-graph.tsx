import { OrthographicView } from "@deck.gl/core";
import { LineLayer, ScatterplotLayer } from "@deck.gl/layers";
import { DeckGL } from "@deck.gl/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { css, cx } from "@hashintel/ds-helpers/css";

import type { Color, OrthographicViewState, PickingInfo } from "@deck.gl/core";

/** A single node in the graph. Positions live in an abstract 2D space. */
export interface NetworkGraphPoint {
  id: number;
  x: number;
  y: number;
  /** CSS hex colour (e.g. `#FF8C26`) used for the node. */
  color: string;
}

/** A connection between two {@link NetworkGraphPoint}s, referenced by `id`. */
export interface NetworkGraphEdge {
  id: number;
  fromId: number;
  toId: number;
}

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

const RGBA_OPAQUE = 255;
/** Colour used if a point's hex value cannot be resolved. */
const FALLBACK_COLOR: [number, number, number] = [148, 148, 148];
const POINT_RADIUS = 0.1;
/** Minimum on-screen radius (px) of the hovered node, so it stays prominent. */
const HOVERED_MIN_RADIUS = 8;
/** Minimum on-screen radius (px) of the hovered node's connected neighbours. */
const NEIGHBOUR_MIN_RADIUS = 5;
/**
 * How strongly the point radius grows with zoom. At `0` the radius is fixed in
 * screen pixels; at `1` it scales 1:1 with the zoom's linear scale factor. `0.8`
 * grows the radius slightly sub-linearly as you zoom in.
 */
const ZOOM_RADIUS_RATE = 1;
/** Zoom range relative to the initial framing — how far out/in the user can zoom. */
const MIN_ZOOM_OFFSET = -2;
const MAX_ZOOM_OFFSET = 12;
/** Furthest zoom-out keeps the whole network in view plus this fractional margin. */
const ZOOM_OUT_MARGIN = 0.2;
const EDGE_COLOR = [80, 88, 110] as const;
/** Base opacity of the points — subtly transparent so dense areas read as depth. */
const POINT_OPACITY = 1;
/** Opacity of the points faded into the background while a node is hovered. */
const POINT_DIMMED_OPACITY = 1;
/** Point opacity when zoomed all the way out; fades in to {@link POINT_OPACITY} at mid-zoom. */
const POINT_MIN_OPACITY = 0.5;
/** Zoom-range fraction at/above which points are fully opaque (below, they fade out as you zoom out). */
const OPACITY_FULL_FRACTION = 0.5;

/** Parse a `#RRGGBB` string into a deck.gl `[r, g, b]` colour. */
const hexToRgb = (hex: string): [number, number, number] => {
  const value = hex.replace("#", "");
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
};

interface HoverLine {
  source: [number, number];
  target: [number, number];
}

const containerStyles = css({
  position: "relative",
  width: "full",
  height: "full",
  overflow: "hidden",
  // deck.gl renders onto a transparent canvas; give it a surface to sit on.
  backgroundColor: "white",
  cursor: "grab",
});

/**
 * A GPU-accelerated scatterplot of a node/edge graph, rendered with deck.gl.
 *
 * Every node is drawn as a coloured point. Edges are hidden until a node is
 * hovered, at which point the node's incident edges — and the neighbours they
 * connect to — are highlighted. This keeps large graphs legible while still
 * letting you explore local connectivity.
 */
export const NetworkGraph = ({
  points,
  edges,
  className,
  onNodeHover,
  onNodeClick,
  onZoom,
}: NetworkGraphProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  // Last zoom reported to `onZoom`, so we only fire on actual zoom changes.
  const lastZoomRef = useRef<number | null>(null);
  // Last hovered node id reported to `onNodeHover` (`null` when none), so we
  // only fire when the hovered node actually changes.
  const lastHoveredIdRef = useRef<number | null>(null);
  const [viewState, setViewState] = useState<OrthographicViewState | null>(
    null,
  );
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

  /** Edges + neighbour nodes for the currently hovered node. */
  const hover = useMemo(() => {
    if (!hovered) {
      return null;
    }
    const incident = adjacency.get(hovered.id) ?? [];
    const lines: HoverLine[] = [];
    const neighbourIds = new Set<number>();
    for (const edge of incident) {
      const from = pointById.get(edge.fromId);
      const to = pointById.get(edge.toId);
      if (!from || !to) {
        continue;
      }
      lines.push({ source: [from.x, from.y], target: [to.x, to.y] });
      neighbourIds.add(edge.fromId === hovered.id ? edge.toId : edge.fromId);
    }
    const neighbours: NetworkGraphPoint[] = [];
    for (const id of neighbourIds) {
      const point = pointById.get(id);
      if (point) {
        neighbours.push(point);
      }
    }
    return { lines, neighbours, highlighted: [hovered, ...neighbours] };
  }, [hovered, adjacency, pointById]);

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

  const handleClick = useCallback(
    (info: PickingInfo) => {
      const point = (info.object as NetworkGraphPoint | undefined) ?? null;
      onNodeClick?.({ point, x: info.x, y: info.y });
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

  const layers = useMemo(() => {
    const isHovering = hover !== null;
    return [
      new ScatterplotLayer<NetworkGraphPoint>({
        id: "points",
        data: points,
        pickable: true,
        getPosition: (point) => [point.x, point.y],
        getFillColor: (point) => colorByHex.get(point.color) ?? FALLBACK_COLOR,
        getRadius: POINT_RADIUS,
        radiusScale,
        radiusUnits: "pixels",
        radiusMinPixels: POINT_RADIUS,
        // Opacity scales with zoom; hovering dims the crowd no brighter than that.
        opacity: isHovering
          ? Math.min(pointOpacity, POINT_DIMMED_OPACITY)
          : pointOpacity,
      }),
      new LineLayer<HoverLine>({
        id: "edges",
        data: hover?.lines ?? [],
        getSourcePosition: (line) => line.source,
        getTargetPosition: (line) => line.target,
        getColor: [...EDGE_COLOR, RGBA_OPAQUE] as Color,
        getWidth: 0.75,
        widthUnits: "pixels",
        widthMinPixels: 0.5,
      }),
      new ScatterplotLayer<NetworkGraphPoint>({
        id: "highlight-neighbours",
        data: hover?.neighbours ?? [],
        getPosition: (point) => [point.x, point.y],
        getFillColor: (point) => colorByHex.get(point.color) ?? FALLBACK_COLOR,
        getRadius: POINT_RADIUS * 1.6,
        radiusScale,
        radiusUnits: "pixels",
        radiusMinPixels: NEIGHBOUR_MIN_RADIUS,
        stroked: true,
        getLineColor: [255, 255, 255, RGBA_OPAQUE],
        getLineWidth: 1.5,
        lineWidthUnits: "pixels",
        lineWidthMinPixels: 1,
      }),
      new ScatterplotLayer<NetworkGraphPoint>({
        id: "highlight-hovered",
        data: hovered ? [hovered] : [],
        getPosition: (point) => [point.x, point.y],
        getFillColor: (point) => colorByHex.get(point.color) ?? FALLBACK_COLOR,
        getRadius: POINT_RADIUS * 2.2,
        radiusScale,
        radiusUnits: "pixels",
        // Keep the hovered node prominent regardless of zoom level.
        radiusMinPixels: HOVERED_MIN_RADIUS,
        stroked: true,
        getLineColor: [255, 255, 255, RGBA_OPAQUE],
        getLineWidth: 1.5,
        lineWidthUnits: "pixels",
        lineWidthMinPixels: 1,
      }),
    ];
  }, [points, hover, hovered, colorByHex, radiusScale, pointOpacity]);

  return (
    <div ref={containerRef} className={cx(containerStyles, className)}>
      {viewState ? (
        <DeckGL
          views={view}
          viewState={viewState}
          controller
          layers={layers}
          onClick={handleClick}
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
            const next = params.viewState as OrthographicViewState;
            setViewState(next);
            const zoom = Array.isArray(next.zoom) ? next.zoom[0] : next.zoom;
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
