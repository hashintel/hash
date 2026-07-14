import { CompositeLayer } from "@deck.gl/core";
import { LineLayer, ScatterplotLayer } from "@deck.gl/layers";

import type { HoverLine, NetworkGraphPoint } from "./network-graph";
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
};

export type CompactNodeLayerProps = _CompactNodeLayerProps &
  CompositeLayerProps;

const defaultProps: DefaultProps<CompactNodeLayerProps> = {
  edges: [],
  neighbours: [],
  activeNode: null,
  colorByHex: new Map<string, RgbColor>(),
  radiusScale: 1,
  pointOpacity: 1,
  dimmed: false,
  showGrowHighlights: true,
};

/**
 * The compact (zoomed-out) node rendering: every node as a coloured point, plus
 * the active node's incident edges and its grown neighbour/hovered rings. Bundled
 * as one composite layer so the graph can swap between this and the detailed
 * variation as a unit.
 *
 * Only the `points` sublayer is pickable; picking the graph resolves nodes off it.
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
      neighbours,
      activeNode,
      colorByHex,
      radiusScale,
      pointOpacity,
      dimmed,
      showGrowHighlights,
    } = this.props;
    const points = (data ?? []) as NetworkGraphPoint[];
    const colorFor = (point: NetworkGraphPoint): RgbColor =>
      colorByHex.get(point.color) ?? FALLBACK_COLOR;

    return [
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
