import { CompositeLayer } from "@deck.gl/core";
import { LineLayer, PathLayer, ScatterplotLayer } from "@deck.gl/layers";

import type { BundledPath } from "./edge-bundling";
import type { HoverLine, NetworkGraphPoint } from "./network-graph-util";
import type { Color, CompositeLayerProps, DefaultProps } from "@deck.gl/core";

type RgbColor = [number, number, number];

const RGBA_OPAQUE = 255;
/** Colour used if a point's hex value cannot be resolved. */
const FALLBACK_COLOR: RgbColor = [148, 148, 148];
const POINT_RADIUS = 0.1;
/** Minimum on-screen radius (px) of the hovered node, so it stays prominent. */
const HOVERED_MIN_RADIUS = 8;
/** Minimum on-screen radius (px) of the hovered node's connected neighbours. */
const NEIGHBOUR_MIN_RADIUS = 5;
const EDGE_COLOR = [80, 88, 110] as const;
/** Opacity of the faint "all edges" drawn behind the detail view (transparent @ 40%). */
const BACKGROUND_EDGE_OPACITY = 0.4;
const BACKGROUND_EDGE_ALPHA = Math.round(RGBA_OPAQUE * BACKGROUND_EDGE_OPACITY);
/** Opacity of the points faded into the background while a node is hovered. */
const POINT_DIMMED_OPACITY = 1;
/**
 * These sublayers all sit at z 0 and must never occlude the detail layers (which
 * use negative z), so they draw without writing depth.
 */
const BASE_LAYER_PARAMETERS = { depthWriteEnabled: false } as const;

type _CompactNodeLayerProps = {
  /** Highlight edges to draw — only the incident edges of the active node. */
  edges: HoverLine[];
  /**
   * Edges drawn faintly behind everything else, at {@link BACKGROUND_EDGE_OPACITY},
   * as bundled polylines. Used by the detail view to show the whole graph's
   * structure (all edges touching the visible nodes), not just the hovered node's.
   * Empty in the compact view.
   */
  backgroundEdgePaths: BundledPath[];
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
      // highlight sit on top. Empty in the compact view.
      new PathLayer<BundledPath>({
        id: `${id}-background-edges`,
        data: backgroundEdgePaths,
        parameters: BASE_LAYER_PARAMETERS,
        getPath: (path) => path,
        getColor: [...EDGE_COLOR, BACKGROUND_EDGE_ALPHA] as Color,
        getWidth: 0.75,
        widthUnits: "pixels",
        widthMinPixels: 0.5,
        capRounded: true,
        jointRounded: true,
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
              // Opacity scales with zoom; an active highlight dims the crowd no
              // brighter than that.
              opacity: dimmed
                ? Math.min(pointOpacity, POINT_DIMMED_OPACITY)
                : pointOpacity,
            }),
          ]
        : []),
      new LineLayer<HoverLine>({
        id: `${id}-edges`,
        data: edges,
        parameters: BASE_LAYER_PARAMETERS,
        getSourcePosition: (line) => line.source,
        getTargetPosition: (line) => line.target,
        getColor: [...EDGE_COLOR, RGBA_OPAQUE] as Color,
        getWidth: 0.75,
        widthUnits: "pixels",
        widthMinPixels: 0.5,
      }),
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
        getLineWidth: 1.5,
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
        stroked: true,
        getLineColor: [255, 255, 255, RGBA_OPAQUE],
        getLineWidth: 1.5,
        lineWidthUnits: "pixels",
        lineWidthMinPixels: 1,
      }),
    ];
  }
}
