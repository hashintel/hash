import { CompositeLayer } from "@deck.gl/core";
import { LineLayer, PathLayer, ScatterplotLayer } from "@deck.gl/layers";

import {
  DIMMED_EDGE_COLOR,
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
/** Opacity of the selected node's grow ring while a different node is hovered, so the selection stays visible but secondary. Also applied to its faded edges/neighbours and, by the parent, to their direction arrows. */
export const SELECTED_DIM_OPACITY = 0.5;
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
  /**
   * Whether the highlight's grown node rings — the `neighbours`' rings and the {@link
   * activeNode}'s ring — are pickable, making each ring an enlarged hitbox that wins the
   * pick over any plain crowd node beneath it. Set while a node is selected (compact
   * view), so the selection's neighbourhood takes pointer priority over the crowd. Both
   * rings are covered together so any grown ring is a stable hit target: hovering a
   * neighbour promotes it to the {@link activeNode} (a larger ring), and keeping that
   * ring pickable stops the hover flipping as the pointer crosses its annulus. Off
   * otherwise — the nodes' own crowd points still resolve picking then.
   */
  highlightNodesPickable: boolean;
  /** The two endpoints of the emphasised edge, each ringed in the edge's colour/hover width to show what it connects. Empty when no edge is emphasised. */
  edgeHoverNodes: NetworkGraphPoint[];
  /** Neighbours of the active node, drawn with a grown ring. */
  neighbours: NetworkGraphPoint[];
  /** The hovered/selected node, drawn with a prominent grown ring. */
  activeNode: NetworkGraphPoint | null;
  /** The selected node while a different node is hovered: same grown ring as {@link activeNode} but dimmed so it stays visible without competing. Null unless backgrounded by a hover. */
  dimmedSelectedNode: NetworkGraphPoint | null;
  /**
   * The backgrounded selection's incident edges as straight node-centre lines, drawn
   * faded to {@link SELECTED_DIM_OPACITY} (matching {@link dimmedSelectedNode}'s ring)
   * so a selected node keeps its edges while a different hovered node owns the active
   * highlight. Full-length and arrow-less — unlike the active {@link edges}; the
   * parent dedupes them against those. Empty in the detail view. Compact only.
   */
  dimmedSelectedEdges: HoverLine[];
  /**
   * The backgrounded selection's neighbours, drawn as grow rings faded to {@link
   * SELECTED_DIM_OPACITY} alongside {@link dimmedSelectedNode}. The parent dedupes
   * them against the active node and its {@link neighbours}. Empty in the detail view.
   * Compact only.
   */
  dimmedSelectedNeighbours: NetworkGraphPoint[];
  /**
   * Whether the backgrounded selection's {@link dimmedSelectedEdges} and {@link
   * dimmedSelectedNeighbours} are pickable. Set while a node is selected so its
   * neighbourhood keeps pointer priority even once it's backgrounded by a hover: these
   * layers sit below the hovered node's highlight, so the parent resolves the priority
   * in its pick handler (preferring a pick here over the hovered node) rather than by
   * z-order. Off otherwise.
   */
  dimmedSelectionPickable: boolean;
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
   * Per-id radius scale for nodes animating in (0→1) or out (1→0); an id not present
   * is at full size (`1`). Multiplied into the crowd points' base radius so a
   * newly-added node grows in from nothing and a removed node shrinks away.
   */
  nodeScaleById: Map<NetworkGraphId, number>;
  /** Bumped each transition-animation frame so the crowd points' `getRadius` re-evaluates. */
  nodeScaleEpoch: number;
};

export type CompactNodeLayerProps = _CompactNodeLayerProps &
  CompositeLayerProps;

const defaultProps: DefaultProps<CompactNodeLayerProps> = {
  edges: [],
  backgroundEdgePaths: [],
  hoveredEdgeId: null,
  highlightEdgesPickable: false,
  backgroundEdgesPickable: false,
  highlightNodesPickable: false,
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
  dimmedSelectedEdges: [],
  dimmedSelectedNeighbours: [],
  dimmedSelectionPickable: false,
  selectedPointId: null,
  nodeScaleById: new Map<NetworkGraphId, number>(),
  nodeScaleEpoch: 0,
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
      highlightNodesPickable,
      edgeHoverNodes,
      neighbours,
      activeNode,
      dimmedSelectedNode,
      dimmedSelectedEdges,
      dimmedSelectedNeighbours,
      dimmedSelectionPickable,
      selectedPointId,
      colorByHex,
      radiusScale,
      pointOpacity,
      dimmed,
      showGrowHighlights,
      showPoints,
      nodeScaleById,
      nodeScaleEpoch,
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
      pickable = false,
    }: {
      idSuffix: string;
      data: NetworkGraphPoint[];
      radiusMultiplier: number;
      radiusMinPixels: number;
      radiusMaxPixels?: number;
      opacity?: number;
      pickable?: boolean;
    }) =>
      new ScatterplotLayer<NetworkGraphPoint>({
        id: `${id}-${idSuffix}`,
        parameters: BASE_LAYER_PARAMETERS,
        data: ringData,
        // A pickable ring is the node's enlarged hitbox: sat above the crowd, it wins
        // the pick over any plain node it overlaps (see `highlightNodesPickable`).
        pickable,
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
              // Scaled by the node's transition progress so a newly-added node grows
              // in from radius 0 and a removed one shrinks to it (settled nodes full).
              getRadius: (point) =>
                POINT_RADIUS * (nodeScaleById.get(point.id) ?? 1),
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
                getRadius: nodeScaleEpoch,
              },
            }),
          ]
        : []),
      // The backgrounded selection's own neighbourhood — its incident edges and
      // neighbour rings — faded to SELECTED_DIM_OPACITY (matching its dimmed grow
      // ring) so a selected node keeps its whole neighbourhood visible, just
      // secondary, while a different hovered node owns the active highlight. Drawn
      // below the active highlight so its full-opacity copy always reads on top; the
      // parent dedupes the shared edge/node so nothing is drawn both faded and full.
      //
      // The faded edges use the lighter DIMMED_EDGE_COLOR (vs the active edges'
      // EDGE_COLOR) and are trimmed at the target for the parent's matching direction
      // arrows to sit in — like the active edges. Drawn *below* the faded neighbour
      // rings, which hide where an edge's untrimmed source end tucks into its node.
      ...(dimmedSelectedEdges.length > 0
        ? [
            new LineLayer<HoverLine>({
              id: `${id}-dimmed-selected-edges`,
              data: dimmedSelectedEdges,
              // Pickable so the selection's edges keep pointer priority while
              // backgrounded; the parent's pick handler prefers them over the hovered
              // node (they sit below its highlight, so z-order alone wouldn't).
              pickable: dimmedSelectionPickable,
              parameters: BASE_LAYER_PARAMETERS,
              getSourcePosition: (line) => line.source,
              getTargetPosition: (line) => line.target,
              getColor: [...DIMMED_EDGE_COLOR, RGBA_OPAQUE] as Color,
              getWidth: EDGE_WIDTH,
              widthUnits: "pixels",
              widthMinPixels: EDGE_MIN_WIDTH,
              opacity: SELECTED_DIM_OPACITY,
            }),
          ]
        : []),
      ...(showGrowHighlights && dimmedSelectedNeighbours.length > 0
        ? [
            growRing({
              idSuffix: "dimmed-selected-neighbours",
              data: dimmedSelectedNeighbours,
              radiusMultiplier: NEIGHBOUR_RADIUS_MULTIPLIER,
              radiusMinPixels: NEIGHBOUR_MIN_RADIUS,
              opacity: SELECTED_DIM_OPACITY,
              pickable: dimmedSelectionPickable,
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
              pickable: highlightNodesPickable,
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
            // Keep the hovered node prominent regardless of zoom level. Pickable under
            // the same condition as the neighbour rings so the active node's enlarged
            // ring is a stable hit target — see {@link highlightNodesPickable}.
            ...(activeNode
              ? [
                  growRing({
                    idSuffix: "highlight-hovered",
                    data: [activeNode],
                    radiusMultiplier: HOVERED_RADIUS_MULTIPLIER,
                    radiusMinPixels: HOVERED_MIN_RADIUS,
                    radiusMaxPixels: POINT_MAX_RADIUS * HOVERED_MAX_MULTIPLIER,
                    pickable: highlightNodesPickable,
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
      // neighbour-sized ring. Gated on `showGrowHighlights` (compact only, like the
      // grow rings these seat inside) rather than `showPoints`, so the front-redraw
      // layer — which redraws the active node's grow ring above the arrows with points
      // hidden — can re-apply the border on top of that opaque redraw.
      ...(showGrowHighlights && edgeHoverNodes.length > 0
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
