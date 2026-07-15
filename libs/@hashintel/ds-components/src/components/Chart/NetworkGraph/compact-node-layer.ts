import { CompositeLayer } from "@deck.gl/core";
import { LineLayer, PathLayer, ScatterplotLayer } from "@deck.gl/layers";

import {
  EDGE_COLOR,
  EDGE_HOVER_WIDTH,
  EDGE_MIN_WIDTH,
  EDGE_WIDTH,
} from "./network-graph-util";

import type { BundledEdge } from "./edge-bundling";
import type { HoverLine, NetworkGraphPoint } from "./network-graph-util";
import type { Color, CompositeLayerProps, DefaultProps } from "@deck.gl/core";

type RgbColor = [number, number, number];

const RGBA_OPAQUE = 255;
/** Colour used if a point's hex value cannot be resolved. */
const FALLBACK_COLOR: RgbColor = [148, 148, 148];
const POINT_RADIUS = 0.1;
/** Maximum on-screen radius (px) of a crowd point, so it never grows too large. */
const POINT_MAX_RADIUS = 10;
/** Minimum on-screen radius (px) of the hovered node, so it stays prominent. */
const HOVERED_MIN_RADIUS = 8;
/** Minimum on-screen radius (px) of the hovered node's connected neighbours. */
const NEIGHBOUR_MIN_RADIUS = 5;
/** Width (px) of the white ring around the active/neighbour nodes. */
const GROW_RING_STROKE = 1.5;
/** Opacity of the faint "all edges" drawn behind the detail view (transparent @ 40%). */
const BACKGROUND_EDGE_OPACITY = 0.2;
const BACKGROUND_EDGE_ALPHA = Math.round(RGBA_OPAQUE * BACKGROUND_EDGE_OPACITY);
/** Opacity of the points faded into the background while a node is hovered. */
const POINT_DIMMED_OPACITY = 1;
/**
 * These sublayers all sit at z 0 and must never occlude the detail layers (which
 * use negative z), so they draw without writing depth.
 */
const BASE_LAYER_PARAMETERS = { depthWriteEnabled: false } as const;

type _CompactNodeLayerProps = {
  /**
   * The active node's incident edges drawn as straight lines — used in the compact
   * view. In the detail view they're drawn as bundled curves via
   * `highlightEdgePaths` instead, so this is empty.
   */
  edges: HoverLine[];
  /**
   * Edges drawn faintly behind everything else, at {@link BACKGROUND_EDGE_OPACITY},
   * as bundled polylines. Used by the detail view to show the whole graph's
   * structure (all edges touching the visible nodes), not just the hovered node's.
   * Excludes the active node's edges (drawn prominently). Empty in the compact view.
   */
  backgroundEdgePaths: BundledEdge[];
  /**
   * The active node's incident edges as bundled polylines, drawn prominently on top
   * of the faint background in the detail view. Routed the same way as
   * `backgroundEdgePaths` so they don't shift when the node is selected. Empty in
   * the compact view (which uses straight `edges`).
   */
  highlightEdgePaths: BundledEdge[];
  /**
   * The id of the currently hovered edge, if any — it draws emphasised (double
   * width, and full opacity for the faint background edges). `null` when no edge
   * is hovered.
   */
  hoveredEdgeId: number | null;
  /**
   * Whether the active node's straight incident `edges` are pickable (hoverable):
   * in the detail view whenever a node is active, and in the compact view while a
   * node is selected.
   */
  highlightEdgesPickable: boolean;
  /**
   * Whether the faint bundled `backgroundEdgePaths` are pickable (hoverable) —
   * always in the detail view, where they're the visible structural edges.
   */
  backgroundEdgesPickable: boolean;
  /**
   * The two endpoint nodes of the hovered edge, each drawn with a ring in the
   * edge's colour and hover width so it's clear which nodes it connects. Empty
   * when no edge is hovered.
   */
  edgeHoverNodes: NetworkGraphPoint[];
  /** Neighbours of the active node, drawn with a "grown" ring. */
  neighbours: NetworkGraphPoint[];
  /** The hovered/selected node, drawn with a prominent grown ring. */
  activeNode: NetworkGraphPoint | null;
  /** Distinct hex colour → rgb, resolved once by the parent. */
  colorByHex: Map<string, RgbColor>;
  /** Multiplier applied to point radii so they grow as the user zooms in. */
  radiusScale: number;
  /** Base point opacity for the current zoom. */
  pointOpacity: number;
  /** Whether a node is active, so the point crowd is dimmed. */
  dimmed: boolean;
  /**
   * Whether the neighbour/hovered "grow" highlights should render. Suppressed in
   * the detail variation, which highlights via a colour-matched outline instead.
   */
  showGrowHighlights: boolean;
  /**
   * Whether the coloured node points render. Hidden in the detail variation so the
   * compact crowd doesn't show through behind the (translucent) detailed nodes;
   * with the points gone the detailed node layer resolves picking instead.
   */
  showPoints: boolean;
};

export type CompactNodeLayerProps = _CompactNodeLayerProps &
  CompositeLayerProps;

const defaultProps: DefaultProps<CompactNodeLayerProps> = {
  edges: [],
  backgroundEdgePaths: [],
  highlightEdgePaths: [],
  hoveredEdgeId: null,
  highlightEdgesPickable: false,
  backgroundEdgesPickable: false,
  edgeHoverNodes: [],
  neighbours: [],
  activeNode: null,
  colorByHex: new Map<string, RgbColor>(),
  radiusScale: 1,
  pointOpacity: 1,
  dimmed: false,
  showGrowHighlights: true,
  showPoints: true,
};

/**
 * The compact (zoomed-out) node rendering: every node as a coloured point, plus
 * the active node's incident edges and its grown neighbour/hovered rings. Bundled
 * as one composite layer so the graph can swap between this and the detailed
 * variation as a unit.
 *
 * The `points` sublayer is the pickable one; picking the graph resolves nodes off
 * it. In the detail variation the points are hidden (see `showPoints`) and the
 * detailed node layer takes over picking, leaving this layer to draw the faint
 * bundled background edges and the hovered node's edges.
 */
export class CompactNodeLayer extends CompositeLayer<
  Required<_CompactNodeLayerProps>
> {
  static override layerName = "CompactNodeLayer";
  static override defaultProps = defaultProps;

  override renderLayers() {
    const {
      id,
      data,
      edges,
      backgroundEdgePaths,
      highlightEdgePaths,
      hoveredEdgeId,
      highlightEdgesPickable,
      backgroundEdgesPickable,
      edgeHoverNodes,
      neighbours,
      activeNode,
      colorByHex,
      radiusScale,
      pointOpacity,
      dimmed,
      showGrowHighlights,
      showPoints,
    } = this.props;
    const points = (data ?? []) as NetworkGraphPoint[];
    const colorFor = (point: NetworkGraphPoint): RgbColor =>
      colorByHex.get(point.color) ?? FALLBACK_COLOR;

    return [
      // The faint "all edges" of the detail view, bundled along the node
      // hierarchy and drawn behind everything else so the nodes and hovered-edge
      // highlight sit on top. Empty in the compact view. Pickable (so an edge can
      // be hovered) only in the detail view, where these are the visible edges.
      new PathLayer<BundledEdge>({
        id: `${id}-background-edges`,
        data: backgroundEdgePaths,
        pickable: backgroundEdgesPickable,
        parameters: BASE_LAYER_PARAMETERS,
        getPath: (edge) => edge.path,
        // Hovered edge jumps to full opacity; the rest stay faint.
        getColor: (edge) =>
          [
            ...EDGE_COLOR,
            edge.edgeId === hoveredEdgeId ? RGBA_OPAQUE : BACKGROUND_EDGE_ALPHA,
          ] as Color,
        getWidth: (edge) =>
          edge.edgeId === hoveredEdgeId ? EDGE_HOVER_WIDTH : EDGE_WIDTH,
        widthUnits: "pixels",
        widthMinPixels: EDGE_MIN_WIDTH,
        capRounded: true,
        jointRounded: true,
        updateTriggers: {
          getColor: hoveredEdgeId,
          getWidth: hoveredEdgeId,
        },
      }),
      // The active node's incident edges (detail view), bundled the same way as the
      // faint background so they sit exactly on the paths they had before — drawn
      // prominently (opaque) on top of it. Empty in the compact view. Pickable when
      // a node is active so all of a selected node's edges are hoverable.
      new PathLayer<BundledEdge>({
        id: `${id}-highlight-edges`,
        data: highlightEdgePaths,
        pickable: highlightEdgesPickable,
        parameters: BASE_LAYER_PARAMETERS,
        getPath: (edge) => edge.path,
        getColor: [...EDGE_COLOR, RGBA_OPAQUE] as Color,
        getWidth: (edge) =>
          edge.edgeId === hoveredEdgeId ? EDGE_HOVER_WIDTH : EDGE_WIDTH,
        widthUnits: "pixels",
        widthMinPixels: EDGE_MIN_WIDTH,
        capRounded: true,
        jointRounded: true,
        updateTriggers: {
          getWidth: hoveredEdgeId,
        },
      }),
      // The active node's incident edges (compact view). Drawn before the points
      // so a node's disc paints over the edges meeting at it — and so picking
      // resolves the node, not its edge, at the node's centre. Pickable only when
      // a node is selected, per the compact-view hover rule.
      new LineLayer<HoverLine>({
        id: `${id}-edges`,
        data: edges,
        pickable: highlightEdgesPickable,
        parameters: BASE_LAYER_PARAMETERS,
        getSourcePosition: (line) => line.source,
        getTargetPosition: (line) => line.target,
        // Already fully opaque, so a hovered edge only doubles its width.
        getColor: [...EDGE_COLOR, RGBA_OPAQUE] as Color,
        getWidth: (line) =>
          line.id === hoveredEdgeId ? EDGE_HOVER_WIDTH : EDGE_WIDTH,
        widthUnits: "pixels",
        widthMinPixels: EDGE_MIN_WIDTH,
        updateTriggers: {
          getWidth: hoveredEdgeId,
        },
      }),
      // Hidden in the detail variation so the crowd doesn't show through behind the
      // translucent detailed nodes; the detailed layer resolves picking there.
      ...(showPoints
        ? [
            new ScatterplotLayer<NetworkGraphPoint>({
              id: `${id}-points`,
              data: points,
              pickable: true,
              parameters: BASE_LAYER_PARAMETERS,
              getPosition: (point) => [point.x, point.y],
              getFillColor: colorFor,
              getRadius: POINT_RADIUS,
              radiusScale,
              radiusUnits: "pixels",
              radiusMinPixels: POINT_RADIUS,
              radiusMaxPixels: POINT_MAX_RADIUS,
              // Opacity scales with zoom; an active highlight dims the crowd no
              // brighter than that.
              opacity: dimmed
                ? Math.min(pointOpacity, POINT_DIMMED_OPACITY)
                : pointOpacity,
            }),
          ]
        : []),
      new ScatterplotLayer<NetworkGraphPoint>({
        id: `${id}-highlight-neighbours`,
        parameters: BASE_LAYER_PARAMETERS,
        data: showGrowHighlights ? neighbours : [],
        getPosition: (point) => [point.x, point.y],
        getFillColor: colorFor,
        getRadius: POINT_RADIUS * 1.6,
        radiusScale,
        radiusUnits: "pixels",
        radiusMinPixels: NEIGHBOUR_MIN_RADIUS,
        stroked: true,
        getLineColor: [255, 255, 255, RGBA_OPAQUE],
        getLineWidth: GROW_RING_STROKE,
        lineWidthUnits: "pixels",
        lineWidthMinPixels: 1,
      }),
      new ScatterplotLayer<NetworkGraphPoint>({
        id: `${id}-highlight-hovered`,
        parameters: BASE_LAYER_PARAMETERS,
        data: showGrowHighlights && activeNode ? [activeNode] : [],
        getPosition: (point) => [point.x, point.y],
        getFillColor: colorFor,
        getRadius: POINT_RADIUS * 2.2,
        radiusScale,
        radiusUnits: "pixels",
        // Keep the hovered node prominent regardless of zoom level.
        radiusMinPixels: HOVERED_MIN_RADIUS,
        radiusMaxPixels: POINT_MAX_RADIUS * 1.5,
        stroked: true,
        getLineColor: [255, 255, 255, RGBA_OPAQUE],
        getLineWidth: GROW_RING_STROKE,
        lineWidthUnits: "pixels",
        lineWidthMinPixels: 1,
      }),
      // Ring around each node the hovered edge connects, in the edge's colour and
      // hover width, sitting just inside that node's white grow ring (its radius
      // inset by the white stroke). Two layers because the hovered endpoint and
      // its neighbour draw white rings of different sizes; each edge ring mirrors
      // the matching grow ring so it hugs the inside of the right one. Compact
      // view only — the detailed layer draws its own endpoint outlines.
      new ScatterplotLayer<NetworkGraphPoint>({
        id: `${id}-edge-hover-outline-hovered`,
        parameters: BASE_LAYER_PARAMETERS,
        data:
          showPoints && activeNode
            ? edgeHoverNodes.filter((point) => point.id === activeNode.id)
            : [],
        getPosition: (point) => [point.x, point.y],
        filled: false,
        stroked: true,
        getRadius: POINT_RADIUS * 2.2,
        radiusScale,
        radiusUnits: "pixels",
        radiusMinPixels: HOVERED_MIN_RADIUS - GROW_RING_STROKE,
        radiusMaxPixels: POINT_MAX_RADIUS * 1.5 - GROW_RING_STROKE,
        getLineColor: [...EDGE_COLOR, RGBA_OPAQUE] as Color,
        getLineWidth: EDGE_HOVER_WIDTH,
        lineWidthUnits: "pixels",
        lineWidthMinPixels: EDGE_MIN_WIDTH,
      }),
      new ScatterplotLayer<NetworkGraphPoint>({
        id: `${id}-edge-hover-outline-neighbour`,
        parameters: BASE_LAYER_PARAMETERS,
        data:
          showPoints && activeNode
            ? edgeHoverNodes.filter((point) => point.id !== activeNode.id)
            : [],
        getPosition: (point) => [point.x, point.y],
        filled: false,
        stroked: true,
        getRadius: POINT_RADIUS * 1.6,
        radiusScale,
        radiusUnits: "pixels",
        radiusMinPixels: NEIGHBOUR_MIN_RADIUS - GROW_RING_STROKE,
        getLineColor: [...EDGE_COLOR, RGBA_OPAQUE] as Color,
        getLineWidth: EDGE_HOVER_WIDTH,
        lineWidthUnits: "pixels",
        lineWidthMinPixels: EDGE_MIN_WIDTH,
      }),
    ];
  }
}
