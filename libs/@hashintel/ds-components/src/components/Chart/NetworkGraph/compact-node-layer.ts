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
/** Opacity of the faint "all edges" drawn behind the detail view. */
const BACKGROUND_EDGE_OPACITY = 0.2;
const BACKGROUND_EDGE_ALPHA = Math.round(RGBA_OPAQUE * BACKGROUND_EDGE_OPACITY);
/** Opacity of the points dimmed while a node is hovered. */
const POINT_DIMMED_OPACITY = 1;
/** Opacity of the selected node's grow ring while a different node is hovered, so the selection stays visible but secondary. */
const SELECTED_DIM_OPACITY = 0.5;
// Sit at z 0; must not occlude the negative-z detail layers, so draw without writing depth.
const BASE_LAYER_PARAMETERS = { depthWriteEnabled: false } as const;

type _CompactNodeLayerProps = {
  /** Active node's incident edges as straight lines (compact view). Empty in the detail view, which draws them as bundled curves in a separate layer. */
  edges: HoverLine[];
  /** Faint bundled polylines drawn behind everything, showing the whole structure touching visible nodes (detail view). Excludes the active node's edges; empty in the compact view. */
  backgroundEdgePaths: BundledEdge[];
  /** Id of the emphasised edge (hovered, or selected when nothing hovered): drawn double width and, for background edges, full opacity. `null` when none. */
  hoveredEdgeId: NetworkGraphId | null;
  /** Whether the active node's straight `edges` are pickable: in the detail view whenever a node is active, in the compact view while a node is selected. */
  highlightEdgesPickable: boolean;
  /** Whether the faint bundled `backgroundEdgePaths` are pickable — always in the detail view, where they're the visible structural edges. */
  backgroundEdgesPickable: boolean;
  /** The two endpoints of the emphasised edge, each ringed in the edge's colour/hover width to show what it connects. Empty when no edge is emphasised. */
  edgeHoverNodes: NetworkGraphPoint[];
  /** Neighbours of the active node, drawn with a grown ring. */
  neighbours: NetworkGraphPoint[];
  /** The hovered/selected node, drawn with a prominent grown ring. */
  activeNode: NetworkGraphPoint | null;
  /** The selected node while a different node is hovered: same grown ring as {@link activeNode} but dimmed so it stays visible without competing. Null unless backgrounded by a hover. */
  dimmedSelectedNode: NetworkGraphPoint | null;
  /** Distinct hex colour → rgb, resolved once by the parent. */
  colorByHex: Map<string, RgbColor>;
  /** Zoom multiplier applied to every node's base radius (deck's `radiusScale`). */
  radiusScale: number;
  /** Base point opacity for the current zoom. */
  pointOpacity: number;
  /** Whether a node is active, so the point crowd is dimmed. */
  dimmed: boolean;
  /** Whether the neighbour/hovered grow highlights render. Suppressed in the detail variation, which highlights via a colour-matched outline. */
  showGrowHighlights: boolean;
  /** Whether the coloured node points render. Hidden in the detail variation so the compact crowd doesn't show through the translucent detailed nodes; the detailed layer then resolves picking. */
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
 * Compact (zoomed-out) node rendering: every node as a coloured point, plus the
 * active node's incident edges and its grown neighbour/hovered rings. One composite
 * layer so the graph can swap between this and the detailed variation as a unit.
 *
 * The `points` sublayer is the pickable one. In the detail variation the points are
 * hidden (see `showPoints`) and the detailed node layer takes over picking, leaving
 * this layer to draw the faint bundled background edges and the hovered node's edges.
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

    // A grown node ring: filled disc in the node's colour with a white stroke,
    // zoom-scaled and pixel-clamped. Backs the neighbour, hovered, and
    // backgrounded-selection highlights.
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

    // Hollow ring around a node a hovered edge connects: edge colour and hover
    // width, radius inset by the white stroke so it seats just inside that node's
    // white grow ring. Compact view only.
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
      // The faint "all edges" of the detail view, drawn behind everything so nodes
      // and the hovered-edge highlight sit on top. Absent in the compact view.
      ...(backgroundEdgePaths.length > 0
        ? [
            new PathLayer<BundledEdge>({
              id: `${id}-background-edges`,
              data: backgroundEdgePaths,
              pickable: backgroundEdgesPickable,
              parameters: BASE_LAYER_PARAMETERS,
              getPath: (edge) => edge.path,
              // The hovered edge is drawn bold above the nodes by the parent's
              // separate `highlight-edges` layer; here it is kept only as a
              // continuous rim-to-rim pick target, so drawn fully transparent. Rest
              // stay faint.
              getColor: (edge) =>
                [
                  ...EDGE_COLOR,
                  edge.edgeId === hoveredEdgeId ? 0 : BACKGROUND_EDGE_ALPHA,
                ] as Color,
              // Match the pick-target width to the bold width the highlight layer
              // draws, so the hitbox lines up on screen.
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
      // a node's disc paints over the edges meeting at it, and so picking resolves
      // the node rather than its edge at the node's centre.
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
      // Hidden in the detail variation so the crowd doesn't show through the
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
      // in the detail variation, which highlights via a colour-matched outline.
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
            // Backgrounded selection: same grown ring as the active node but dimmed,
            // drawn before it so the hovered node's highlight reads on top.
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
      // Rings around the nodes a hovered edge connects, seated just inside each
      // node's white grow ring. Split into two layers because the hovered endpoint
      // and its neighbour draw white rings of different sizes; each edge ring
      // mirrors the matching grow ring's clamps so it hugs the inside of the right
      // one. Compact view only, and only with a node active.
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
