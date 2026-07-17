import { CompositeLayer } from "@deck.gl/core";
import { LineLayer, PathLayer, ScatterplotLayer } from "@deck.gl/layers";

import {
  EDGE_COLOR,
  EDGE_HOVER_WIDTH,
  EDGE_MIN_WIDTH,
  EDGE_WIDTH,
} from "./network-graph-util";
import {
  GROW_RING_STROKE,
  HOVERED_MAX_MULTIPLIER,
  HOVERED_MIN_RADIUS,
  HOVERED_RADIUS_MULTIPLIER,
  NEIGHBOUR_MIN_RADIUS,
  NEIGHBOUR_RADIUS_MULTIPLIER,
  POINT_MAX_RADIUS,
  POINT_RADIUS,
} from "./zoom-attributes";

import type { BundledEdge } from "./edge-bundling";
import type {
  HoverLine,
  NetworkGraphId,
  NetworkGraphPoint,
} from "./network-graph-util";
import type { Color, CompositeLayerProps, DefaultProps } from "@deck.gl/core";

type RgbColor = [number, number, number];

const RGBA_OPAQUE = 255;
/** Colour used if a point's hex value cannot be resolved. */
const FALLBACK_COLOR: RgbColor = [148, 148, 148];
/** Opacity of the faint "all edges" drawn behind the detail view (transparent @ 40%). */
const BACKGROUND_EDGE_OPACITY = 0.2;
const BACKGROUND_EDGE_ALPHA = Math.round(RGBA_OPAQUE * BACKGROUND_EDGE_OPACITY);
/** Opacity of the points faded into the background while a node is hovered. */
const POINT_DIMMED_OPACITY = 1;
/**
 * Opacity of the selected node's grow ring while a *different* node is hovered — so
 * the backgrounded selection stays visible but reads as secondary to the hover.
 */
const SELECTED_DIM_OPACITY = 0.5;
/**
 * These sublayers all sit at z 0 and must never occlude the detail layers (which
 * use negative z), so they draw without writing depth.
 */
const BASE_LAYER_PARAMETERS = { depthWriteEnabled: false } as const;

type _CompactNodeLayerProps = {
  /**
   * The active node's incident edges drawn as straight lines — used in the compact
   * view. In the detail view they're drawn as bundled curves by a separate layer
   * (above the nodes), so this is empty there.
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
   * The id of the emphasised edge, if any — the hovered edge, or the selected edge
   * when nothing is hovered. It draws emphasised (double width, and full opacity for
   * the faint background edges). `null` when no edge is hovered or selected.
   */
  hoveredEdgeId: NetworkGraphId | null;
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
   * The two endpoint nodes of the emphasised (hovered or selected) edge, each drawn
   * with a ring in the edge's colour and hover width so it's clear which nodes it
   * connects. Empty when no edge is hovered or selected.
   */
  edgeHoverNodes: NetworkGraphPoint[];
  /** Neighbours of the active node, drawn with a "grown" ring. */
  neighbours: NetworkGraphPoint[];
  /** The hovered/selected node, drawn with a prominent grown ring. */
  activeNode: NetworkGraphPoint | null;
  /**
   * The selected node while a different node is hovered: drawn with the same grown
   * ring as {@link activeNode} but dimmed, so the selection stays visible without
   * competing with the hovered node's highlight. Null unless the selection has been
   * backgrounded by a hover.
   */
  dimmedSelectedNode: NetworkGraphPoint | null;
  /** Distinct hex colour → rgb, resolved once by the parent. */
  colorByHex: Map<string, RgbColor>;
  /** Zoom multiplier applied to every node's base radius (deck's `radiusScale`). */
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
  dimmedSelectedNode: null,
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
      hoveredEdgeId,
      highlightEdgesPickable,
      backgroundEdgesPickable,
      edgeHoverNodes,
      neighbours,
      activeNode,
      dimmedSelectedNode,
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

    // A "grown" node ring: a filled disc in the node's colour with a white stroke,
    // scaled by the current zoom and clamped to a pixel range. Backs the neighbour,
    // hovered, and backgrounded-selection highlights.
    const growRing = ({
      idSuffix,
      data: ringData,
      radiusMultiplier,
      radiusMinPixels,
      radiusMaxPixels = Number.MAX_SAFE_INTEGER,
      opacity = 1,
    }: {
      idSuffix: string;
      data: NetworkGraphPoint[];
      radiusMultiplier: number;
      radiusMinPixels: number;
      radiusMaxPixels?: number;
      opacity?: number;
    }) =>
      new ScatterplotLayer<NetworkGraphPoint>({
        id: `${id}-${idSuffix}`,
        parameters: BASE_LAYER_PARAMETERS,
        data: ringData,
        getPosition: (point) => [point.x, point.y],
        getFillColor: colorFor,
        getRadius: POINT_RADIUS * radiusMultiplier,
        radiusScale,
        radiusUnits: "pixels",
        radiusMinPixels,
        radiusMaxPixels,
        stroked: true,
        getLineColor: [255, 255, 255, RGBA_OPAQUE],
        getLineWidth: GROW_RING_STROKE,
        lineWidthUnits: "pixels",
        lineWidthMinPixels: 1,
        opacity,
      });

    // A ring around a node that a hovered edge connects: hollow, in the edge's
    // colour and hover width, its radius inset by the white stroke so it seats just
    // inside that node's white grow ring. Compact view only.
    const edgeHoverRing = ({
      idSuffix,
      data: ringData,
      radiusMultiplier,
      radiusMinPixels,
      radiusMaxPixels = Number.MAX_SAFE_INTEGER,
    }: {
      idSuffix: string;
      data: NetworkGraphPoint[];
      radiusMultiplier: number;
      radiusMinPixels: number;
      radiusMaxPixels?: number;
    }) =>
      new ScatterplotLayer<NetworkGraphPoint>({
        id: `${id}-${idSuffix}`,
        parameters: BASE_LAYER_PARAMETERS,
        data: ringData,
        getPosition: (point) => [point.x, point.y],
        filled: false,
        stroked: true,
        getRadius: POINT_RADIUS * radiusMultiplier,
        radiusScale,
        radiusUnits: "pixels",
        radiusMinPixels,
        radiusMaxPixels,
        getLineColor: [...EDGE_COLOR, RGBA_OPAQUE] as Color,
        getLineWidth: EDGE_HOVER_WIDTH,
        lineWidthUnits: "pixels",
        lineWidthMinPixels: EDGE_MIN_WIDTH,
      });

    return [
      // The faint "all edges" of the detail view, bundled along the node hierarchy
      // and drawn behind everything else so the nodes and hovered-edge highlight sit
      // on top. Not instantiated in the compact view, where there are none. Pickable
      // (so an edge can be hovered) only in the detail view, its visible edges.
      ...(backgroundEdgePaths.length > 0
        ? [
            new PathLayer<BundledEdge>({
              id: `${id}-background-edges`,
              data: backgroundEdgePaths,
              pickable: backgroundEdgesPickable,
              parameters: BASE_LAYER_PARAMETERS,
              getPath: (edge) => edge.path,
              // The hovered edge is drawn (bold, arrow-gapped, above the nodes) by
              // the parent's separate `highlight-edges` layer; here it is kept in
              // the data only as a continuous, rim-to-rim pick target, so it's drawn
              // fully transparent. The rest stay faint.
              getColor: (edge) =>
                [
                  ...EDGE_COLOR,
                  edge.edgeId === hoveredEdgeId ? 0 : BACKGROUND_EDGE_ALPHA,
                ] as Color,
              // Match the hovered edge's pick-target width to the bold width it's
              // drawn at by the highlight layer, so the hitbox lines up on screen.
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
          ]
        : []),
      // The active node's incident edges (compact view). Drawn before the points so
      // a node's disc paints over the edges meeting at it — and so picking resolves
      // the node, not its edge, at the node's centre. Pickable only when a node is
      // selected, per the compact-view hover rule. Not instantiated in the detail
      // view, where they're drawn as bundled curves instead (so `edges` is empty).
      ...(edges.length > 0
        ? [
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
          ]
        : []),
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
      // The neighbour, backgrounded-selection, and hovered grow rings. Suppressed
      // in the detail variation (which highlights via a colour-matched outline), so
      // none are instantiated there; each is skipped when it has no node.
      ...(showGrowHighlights
        ? [
            ...(neighbours.length > 0
              ? [
                  growRing({
                    idSuffix: "highlight-neighbours",
                    data: neighbours,
                    radiusMultiplier: NEIGHBOUR_RADIUS_MULTIPLIER,
                    radiusMinPixels: NEIGHBOUR_MIN_RADIUS,
                  }),
                ]
              : []),
            // The backgrounded selection: the same grown ring as the active node but
            // dimmed, drawn before it so the hovered node's highlight reads on top.
            // Its edges/neighbours aren't drawn — those belong to the active node.
            ...(dimmedSelectedNode
              ? [
                  growRing({
                    idSuffix: "dimmed-selected",
                    data: [dimmedSelectedNode],
                    radiusMultiplier: HOVERED_RADIUS_MULTIPLIER,
                    radiusMinPixels: HOVERED_MIN_RADIUS,
                    radiusMaxPixels: POINT_MAX_RADIUS * HOVERED_MAX_MULTIPLIER,
                    opacity: SELECTED_DIM_OPACITY,
                  }),
                ]
              : []),
            // Keep the hovered node prominent regardless of zoom level.
            ...(activeNode
              ? [
                  growRing({
                    idSuffix: "highlight-hovered",
                    data: [activeNode],
                    radiusMultiplier: HOVERED_RADIUS_MULTIPLIER,
                    radiusMinPixels: HOVERED_MIN_RADIUS,
                    radiusMaxPixels: POINT_MAX_RADIUS * HOVERED_MAX_MULTIPLIER,
                  }),
                ]
              : []),
          ]
        : []),
      // Rings around the nodes a hovered edge connects, in the edge's colour and
      // hover width, each seated just inside that node's white grow ring. Two layers
      // because the hovered endpoint and its neighbour draw white rings of different
      // sizes; each edge ring mirrors the matching grow ring so it hugs the inside
      // of the right one. Compact view only (showPoints) and only with a node active
      // — the detailed layer draws its own endpoint outlines.
      ...(showPoints && activeNode
        ? [
            edgeHoverRing({
              idSuffix: "edge-hover-outline-hovered",
              data: edgeHoverNodes.filter(
                (point) => point.id === activeNode.id,
              ),
              radiusMultiplier: HOVERED_RADIUS_MULTIPLIER,
              radiusMinPixels: HOVERED_MIN_RADIUS - GROW_RING_STROKE,
              radiusMaxPixels:
                POINT_MAX_RADIUS * HOVERED_MAX_MULTIPLIER - GROW_RING_STROKE,
            }),
            edgeHoverRing({
              idSuffix: "edge-hover-outline-neighbour",
              data: edgeHoverNodes.filter(
                (point) => point.id !== activeNode.id,
              ),
              radiusMultiplier: NEIGHBOUR_RADIUS_MULTIPLIER,
              radiusMinPixels: NEIGHBOUR_MIN_RADIUS - GROW_RING_STROKE,
            }),
          ]
        : []),
    ];
  }
}
