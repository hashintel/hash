import { OrthographicView } from "@deck.gl/core";
import { LineLayer, ScatterplotLayer } from "@deck.gl/layers";
import { DeckGL } from "@deck.gl/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { css, cx } from "@hashintel/ds-helpers/css";

import type { Color, OrthographicViewState, PickingInfo } from "@deck.gl/core";

/** A single node in the graph. Positions live in an abstract 2D space. */
export interface GraphChartPoint {
  id: number;
  x: number;
  y: number;
  /** CSS hex colour (e.g. `#FF8C26`) used for the node. */
  color: string;
}

/** A connection between two {@link GraphChartPoint}s, referenced by `id`. */
export interface GraphChartEdge {
  id: number;
  fromId: number;
  toId: number;
}

export interface GraphChartProps {
  /** The nodes to plot. */
  points: GraphChartPoint[];
  /** The connections between nodes. Only rendered while a node is hovered. */
  edges: GraphChartEdge[];
  /** Extra class name applied to the chart container. */
  className?: string;
}

const RGBA_OPAQUE = 255;
/** Colour used if a point's hex value cannot be resolved. */
const FALLBACK_COLOR: [number, number, number] = [148, 148, 148];
const POINT_RADIUS = 0.1;
/**
 * How strongly the point radius grows with zoom. At `0` the radius is fixed in
 * screen pixels; at `1` it scales 1:1 with the zoom's linear scale factor. `0.8`
 * grows the radius slightly sub-linearly as you zoom in.
 */
const ZOOM_RADIUS_RATE = 1;
const EDGE_COLOR = [64, 71, 92] as const;
/** Base opacity of the points — subtly transparent so dense areas read as depth. */
const POINT_OPACITY = 1;
/** Opacity of the points faded into the background while a node is hovered. */
const POINT_DIMMED_OPACITY = 1;

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
export const GraphChart = ({ points, edges, className }: GraphChartProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewState, setViewState] = useState<OrthographicViewState | null>(
    null,
  );
  const [hovered, setHovered] = useState<GraphChartPoint | null>(null);
  // The zoom the graph was first framed at, used as the reference point from
  // which the point radius grows as the user zooms in.
  const [referenceZoom, setReferenceZoom] = useState<number | null>(null);

  const view = useMemo(() => new OrthographicView({ id: "graph-chart" }), []);

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
    const map = new Map<number, GraphChartPoint>();
    for (const point of points) {
      map.set(point.id, point);
    }
    return map;
  }, [points]);

  /** Adjacency list: node id → edges touching it. */
  const adjacency = useMemo(() => {
    const map = new Map<number, GraphChartEdge[]>();
    const push = (id: number, edge: GraphChartEdge) => {
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
    const neighbours: GraphChartPoint[] = [];
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
      // Capture the first framing as the reference for zoom-based radius growth.
      setReferenceZoom((previous) => previous ?? zoom);
      // Only auto-frame until the user takes control of the view.
      setViewState(
        (previous) =>
          previous ?? {
            target: [bounds.centerX, bounds.centerY, 0],
            zoom,
            minZoom: zoom - 2,
            maxZoom: zoom + 12,
          },
      );
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => observer.disconnect();
  }, [bounds]);

  const handleHover = useCallback((info: PickingInfo<GraphChartPoint>) => {
    const object = info.object ?? null;
    setHovered((previous) => (previous?.id === object?.id ? previous : object));
  }, []);

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

  const layers = useMemo(() => {
    const isHovering = hover !== null;
    return [
      new ScatterplotLayer<GraphChartPoint>({
        id: "points",
        data: points,
        pickable: true,
        onHover: handleHover,
        getPosition: (point) => [point.x, point.y],
        getFillColor: (point) => colorByHex.get(point.color) ?? FALLBACK_COLOR,
        getRadius: POINT_RADIUS,
        radiusScale,
        radiusUnits: "pixels",
        radiusMinPixels: POINT_RADIUS,
        // Fade the crowd back so the hovered node's neighbourhood stands out.
        opacity: isHovering ? POINT_DIMMED_OPACITY : POINT_OPACITY,
      }),
      new LineLayer<HoverLine>({
        id: "edges",
        data: hover?.lines ?? [],
        getSourcePosition: (line) => line.source,
        getTargetPosition: (line) => line.target,
        getColor: [...EDGE_COLOR, RGBA_OPAQUE] as Color,
        getWidth: 1.5,
        widthUnits: "pixels",
        widthMinPixels: 1,
      }),
      new ScatterplotLayer<GraphChartPoint>({
        id: "highlight",
        data: hover?.highlighted ?? [],
        getPosition: (point) => [point.x, point.y],
        getFillColor: (point) => colorByHex.get(point.color) ?? FALLBACK_COLOR,
        getRadius: (point) =>
          point.id === hovered?.id ? POINT_RADIUS * 2.2 : POINT_RADIUS * 1.6,
        radiusScale,
        radiusUnits: "pixels",
        radiusMinPixels: 2,
        stroked: true,
        getLineColor: [255, 255, 255, RGBA_OPAQUE],
        getLineWidth: 1.5,
        lineWidthUnits: "pixels",
        lineWidthMinPixels: 1,
        updateTriggers: {
          getRadius: [hovered?.id],
        },
      }),
    ];
  }, [points, hover, hovered?.id, handleHover, colorByHex, radiusScale]);

  return (
    <div ref={containerRef} className={cx(containerStyles, className)}>
      {viewState ? (
        <DeckGL
          views={view}
          viewState={viewState}
          controller
          layers={layers}
          onViewStateChange={(params) => {
            setViewState(params.viewState as OrthographicViewState);
          }}
          getCursor={({ isDragging, isHovering }) =>
            isDragging ? "grabbing" : isHovering ? "pointer" : "grab"
          }
          getTooltip={({ object }: PickingInfo<GraphChartPoint>) =>
            object
              ? {
                  text: `Node ${object.id}\n(${object.x.toFixed(1)}, ${object.y.toFixed(1)})`,
                }
              : null
          }
        />
      ) : null}
    </div>
  );
};
