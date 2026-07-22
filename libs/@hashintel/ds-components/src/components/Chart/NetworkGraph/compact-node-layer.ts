import { CompositeLayer } from "@deck.gl/core";
import { LineLayer, PathLayer, ScatterplotLayer } from "@deck.gl/layers";

import {
  EDGE_COLOR,
  EDGE_HOVER_WIDTH,
  EDGE_MIN_WIDTH,
  EDGE_WIDTH,
  FALLBACK_COLOR,
  type HoverLine,
  type NetworkGraphId,
  type NetworkGraphPoint,
  RGBA_OPAQUE,
  type RgbColor,
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
import type { Color, CompositeLayerProps, DefaultProps } from "@deck.gl/core";

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
  /** Id of the selected node, whose plain crowd point is hidden so it doesn't show through its own (translucent, when dimmed) grow ring. `null` when nothing is selected. */
  selectedPointId: NetworkGraphId | null;
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
  /**
   * Per-id entrance scale (0→1) for nodes easing in from radius 0; an id not present
   * is at full size (`1`). Multiplied into the crowd points' base radius so a
   * newly-added node grows in from nothing.
   */
  entranceScaleById: Map<NetworkGraphId, number>;
  /** Bumped each entrance-animation frame so the crowd points' `getRadius` re-evaluates. */
  entranceEpoch: number;
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
  selectedPointId: null,
  entranceScaleById: new Map<NetworkGraphId, number>(),
  entranceEpoch: 0,
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
      selectedPointId,
      colorByHex,
      radiusScale,
      pointOpacity,
      dimmed,
      showGrowHighlights,
      showPoints,
      entranceScaleById,
      entranceEpoch,
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

    // A slate ring around a node the emphasised edge connects, seated just inside that
    // node's white grow ring — the compact echo of the detail node's edge outline. It
    // sits one grow-ring stroke inside the white ring (`slate radius = grow radius −
    // GROW_RING_STROKE`), matching how the detail layer seats its slate outline inside
    // the white outline. The inset is applied in *pixels* at the current zoom, not via
    // `radiusMinPixels` alone: a min-only inset holds only while the ring is pinned to
    // its minimum size, and once the ring grows with zoom the slate would ride back out
    // level with (and over) the white. `radiusScale` converts the pixel inset back
    // through deck's `getRadius · radiusScale` so it holds at every zoom. Compact only.
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
        // Grow-ring radius minus one stroke, in pixels. `radiusScale` multiplies
        // `getRadius`, so divide the pixel inset by it here to land a constant pixel
        // inset; the min/max are inset too so the clamp tracks the grow ring's clamp.
        // (Guard the divide against a zero scale when fully zoomed out.)
        getRadius:
          radiusScale > 0
            ? Math.max(
                0,
                POINT_RADIUS * radiusMultiplier -
                  GROW_RING_STROKE / radiusScale,
              )
            : 0,
        radiusScale,
        radiusUnits: "pixels",
        radiusMinPixels: radiusMinPixels - GROW_RING_STROKE,
        radiusMaxPixels: radiusMaxPixels - GROW_RING_STROKE,
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
      // Every node as a plain coloured point. Hidden in the detail variation so the
      // crowd doesn't show through the translucent detailed nodes; the detailed layer
      // resolves picking there.
      ...(showPoints
        ? [
            new ScatterplotLayer<NetworkGraphPoint>({
              id: `${id}-points`,
              data: points,
              pickable: true,
              parameters: BASE_LAYER_PARAMETERS,
              getPosition: (point) => [point.x, point.y],
              // Hide the selected node's plain point (drawn transparent) so it never
              // shows through its own grow ring — which is translucent while a
              // different node is hovered. It stays pickable regardless of fill alpha.
              getFillColor: (point): Color =>
                point.id === selectedPointId ? [0, 0, 0, 0] : colorFor(point),
              // Scaled by the node's entrance progress so a newly-added node grows
              // in from radius 0 (settled nodes are at full size).
              getRadius: (point) =>
                POINT_RADIUS * (entranceScaleById.get(point.id) ?? 1),
              radiusScale,
              radiusUnits: "pixels",
              radiusMinPixels: POINT_RADIUS,
              radiusMaxPixels: POINT_MAX_RADIUS,
              // Opacity scales with zoom; an active highlight dims the crowd no
              // brighter than that.
              opacity: dimmed
                ? Math.min(pointOpacity, POINT_DIMMED_OPACITY)
                : pointOpacity,
              updateTriggers: {
                getFillColor: selectedPointId,
                getRadius: entranceEpoch,
              },
            }),
          ]
        : []),
      // Neighbour grow rings, drawn below the edges: a neighbour is a plain node, so
      // the edge reaching it reads on top. Suppressed in the detail variation, which
      // highlights via a colour-matched outline.
      ...(showGrowHighlights && neighbours.length > 0
        ? [
            growRing({
              idSuffix: "highlight-neighbours",
              data: neighbours,
              radiusMultiplier: NEIGHBOUR_RADIUS_MULTIPLIER,
              radiusMinPixels: NEIGHBOUR_MIN_RADIUS,
            }),
          ]
        : []),
      // The active node's incident edges (compact view). Drawn above the point crowd
      // and the neighbour rings so a connection reads on top of the nodes it spans,
      // but below the hovered/selected grow rings next, so the emphasised node still
      // sits over its own edges. Detail draws them as bundled curves in a separate layer.
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
      // The backgrounded-selection and hovered grow rings, drawn above the edges so a
      // hovered or selected node sits over its own edges. Suppressed in the detail
      // variation, which highlights via a colour-matched outline.
      ...(showGrowHighlights
        ? [
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
      // Rings around the nodes the emphasised edge connects, seated just inside each
      // node's white grow ring (see `edgeHoverRing` for the inset). Split by size
      // because an endpoint that is the active node draws a larger (hovered) grow ring
      // than a neighbour, so each edge ring mirrors the matching grow ring's radius
      // clamps to hug the right one. Any endpoint that isn't the active node —
      // including both endpoints of a lone selected edge (no active node) — hugs a
      // neighbour-sized ring. Compact view only.
      ...(showPoints && edgeHoverNodes.length > 0
        ? [
            ...(activeNode
              ? [
                  edgeHoverRing({
                    idSuffix: "edge-hover-outline-hovered",
                    data: edgeHoverNodes.filter(
                      (point) => point.id === activeNode.id,
                    ),
                    radiusMultiplier: HOVERED_RADIUS_MULTIPLIER,
                    radiusMinPixels: HOVERED_MIN_RADIUS,
                    radiusMaxPixels: POINT_MAX_RADIUS * HOVERED_MAX_MULTIPLIER,
                  }),
                ]
              : []),
            edgeHoverRing({
              idSuffix: "edge-hover-outline-neighbour",
              data: edgeHoverNodes.filter(
                (point) => point.id !== activeNode?.id,
              ),
              radiusMultiplier: NEIGHBOUR_RADIUS_MULTIPLIER,
              radiusMinPixels: NEIGHBOUR_MIN_RADIUS,
            }),
          ]
        : []),
    ];
  }
}
