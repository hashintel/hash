import { CompositeLayer } from "@deck.gl/core";
import { IconLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";

import { EDGE_COLOR, EDGE_HOVER_WIDTH } from "./network-graph-util";

import type {
  DetailIconAtlas,
  NetworkGraphId,
  NetworkGraphPoint,
} from "./network-graph-util";
import type {
  Color,
  CompositeLayerProps,
  DefaultProps,
  UpdateParameters,
} from "@deck.gl/core";

type RgbColor = [number, number, number];

const RGBA_OPAQUE = 255;
/** Colour used if a point's hex value cannot be resolved. */
const FALLBACK_COLOR: RgbColor = [148, 148, 148];
/** Diameter (px) of a node in the zoomed-in detail variation. */
export const DETAIL_NODE_DIAMETER = 40;
/** On-screen size (px) of the icon drawn inside a detail node. */
const DETAIL_ICON_SIZE = 24;
/** Font size (px) of the detail label text. */
const DETAIL_LABEL_FONT_SIZE = 12;
/** Font stack the label text is rasterised with. */
const DETAIL_LABEL_FONT =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
/** Longest label (chars) before it is truncated with an ellipsis (~2.5× node width). */
const DETAIL_LABEL_MAX_CHARS = 16;
/** Background padding `[x, y]` of the label pill. */
const DETAIL_LABEL_PADDING: [number, number] = [6, 2];
/**
 * How far (px) the label pill overlaps up into the node, so the two read as one
 * shape. Kept at `radius − icon half-height` so the pill's top still clears the
 * icon above it (the label is drawn in front of the node).
 */
const DETAIL_LABEL_OVERLAP = DETAIL_NODE_DIAMETER / 2 - DETAIL_ICON_SIZE / 2;
/** Downward px offset of the label text from centre, giving the {@link DETAIL_LABEL_OVERLAP}. */
const DETAIL_LABEL_OFFSET =
  DETAIL_NODE_DIAMETER / 2 - DETAIL_LABEL_OVERLAP + DETAIL_LABEL_PADDING[1];
/** Corner radius (px) of the label pill. */
const DETAIL_LABEL_RADIUS = 6;
/**
 * Width (px) of the white outline tracing the whole node+label silhouette — a
 * white backdrop of the circle and pill, enlarged by this much and drawn behind
 * the fills, so only the outer ring shows and the two pieces merge into one
 * continuous outline. Constant across idle and hover.
 */
const DETAIL_OUTLINE_WIDTH = 1.5;
/** Width (px) the active circle grows by, in its own colour, inside the white outline (hover enlarge effect). */
const DETAIL_CIRCLE_ACCENT_WIDTH = 1.5;
/** Background padding of the outline's pill backdrop: label padding + outline width. */
const DETAIL_OUTLINE_PADDING: [number, number] = [
  DETAIL_LABEL_PADDING[0] + DETAIL_OUTLINE_WIDTH,
  DETAIL_LABEL_PADDING[1] + DETAIL_OUTLINE_WIDTH,
];
/** Corner radius of the outline's pill backdrop, so the ring is even at the corners. */
const DETAIL_OUTLINE_RADIUS = DETAIL_LABEL_RADIUS + DETAIL_OUTLINE_WIDTH;
/** Font weight applied to the label while the node is active. */
const DETAIL_LABEL_FONT_WEIGHT_ACTIVE = "500";
/** Opaque white, used for node/label fills and the outline. */
const DETAIL_WHITE: Color = [255, 255, 255, 255];
/** Fully transparent, hides the outline backdrops' text. */
const DETAIL_TRANSPARENT: Color = [0, 0, 0, 0];
/** Dark ink for the label text. */
const DETAIL_INK: Color = [15, 18, 25, 255];
/**
 * Opacity of a detail node's coloured circle fill. Slightly translucent so it
 * blends over the white outline backdrop directly behind it (lightening the
 * colour), rather than showing the graph through it.
 */
const DETAIL_NODE_FILL_OPACITY = 0.85;
const DETAIL_NODE_FILL_ALPHA = Math.round(255 * DETAIL_NODE_FILL_OPACITY);
/**
 * The node parts live in separate sublayers, so across-sublayer draw order alone
 * would let a back node's icon/label show over a front node. Instead each node's
 * parts share a per-node depth *band* via the z coordinate, letting the depth
 * buffer resolve occlusion: every part of a nearer node beats every part of a
 * node behind it. Within a band the parts stack `outline < circle < icon < label`
 * (back to front). `DETAIL_Z_STEP` is the world-z gap between adjacent levels —
 * tiny, but far above the orthographic depth buffer's resolution.
 */
const DETAIL_Z_STEP = 0.001;
const DETAIL_LEVEL_OUTLINE = 0;
const DETAIL_LEVEL_CIRCLE = 1;
const DETAIL_LEVEL_ICON = 2;
const DETAIL_LEVEL_LABEL = 3;
const DETAIL_LEVEL_COUNT = 4;

/**
 * World-space z for a node part. `order` is the node's front-to-back rank (later
 * = nearer), `level` its part (`DETAIL_LEVEL_*`), and `slots` the total rank
 * count. Offset by `slots` so all values are ≤ 0 (the compact layer at z 0
 * disables depth writes, so it never occludes these). Larger z = nearer.
 */
const detailZ = (order: number, level: number, slots: number): number =>
  (order * DETAIL_LEVEL_COUNT + level - slots * DETAIL_LEVEL_COUNT) *
  DETAIL_Z_STEP;

/** Truncate a label to {@link DETAIL_LABEL_MAX_CHARS} with an ellipsis. */
const truncateLabel = (label: string): string =>
  label.length > DETAIL_LABEL_MAX_CHARS
    ? `${label.slice(0, DETAIL_LABEL_MAX_CHARS - 1)}…`
    : label;

/** Pick a legible ink colour (near-black or white) for `rgb` by perceived luminance. */
const contrastInkRgb = (rgb: RgbColor): RgbColor => {
  const luminance = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
  return luminance > 0.6 ? [15, 18, 25] : [255, 255, 255];
};

type _DetailedNodeLayerProps = {
  /** The hovered/selected node — jumps to the front with a bolder, accented style. */
  activeNode: NetworkGraphPoint | null;
  /**
   * The selected node while a different node is hovered — kept in its full selected
   * styling (enlarged, bold label, promoted) so hovering another node doesn't change
   * the selection's appearance. Only its edges are dropped (following
   * {@link activeNode}, handled by the parent). Null unless the selection has been
   * backgrounded by a hover.
   */
  enlargedSelection: NetworkGraphPoint | null;
  /** Distinct hex colour → rgb, resolved once by the parent. */
  colorByHex: Map<string, RgbColor>;
  /** Mask atlas of the icons used by the data; `null` until it has rasterised. */
  iconAtlas: DetailIconAtlas | null;
  /**
   * The two endpoint nodes of the emphasised (hovered or selected) edge, each ringed
   * in the edge's colour and hover width. Empty when no edge is emphasised.
   */
  edgeHoverNodes: NetworkGraphPoint[];
};

export type DetailedNodeLayerProps = _DetailedNodeLayerProps &
  CompositeLayerProps;

type DetailedNodeLayerState = {
  /** The subset of `data` with a label / an icon, cached across non-data updates. */
  labelPoints: NetworkGraphPoint[];
  iconPoints: NetworkGraphPoint[];
};

const defaultProps: DefaultProps<DetailedNodeLayerProps> = {
  activeNode: null,
  enlargedSelection: null,
  colorByHex: new Map<string, RgbColor>(),
  iconAtlas: null,
  edgeHoverNodes: [],
};

/**
 * The detailed (zoomed-in) node rendering: a larger circle showing the node's
 * icon, its label in a pill beneath, and a white outline around the whole
 * node+label silhouette. Active (hover/selected): the label goes bold and the
 * circle grows slightly in its own colour, inside a constant-width white outline.
 * Each node's parts share a per-node depth band (see {@link detailZ}) so a front
 * node occludes every part of a node behind it, and the active node jumps to the
 * front. The circle sublayer is the sole pickable one, since the compact points
 * are hidden while detailed nodes are shown.
 */
export class DetailedNodeLayer extends CompositeLayer<
  Required<_DetailedNodeLayerProps>
> {
  static override layerName = "DetailedNodeLayer";
  static override defaultProps = defaultProps;

  override initializeState() {
    this.state = { labelPoints: [], iconPoints: [] };
  }

  override updateState({ changeFlags }: UpdateParameters<this>) {
    // Recompute the label/icon subsets only when the data changes, so hover
    // (which changes `activeNode`, not `data`) doesn't force a TextLayer relayout.
    if (changeFlags.dataChanged) {
      const data = (this.props.data ?? []) as NetworkGraphPoint[];
      this.setState({
        labelPoints: data.filter((point) => point.label),
        iconPoints: data.filter((point) => point.icon),
      });
    }
  }

  override renderLayers() {
    const {
      id,
      activeNode,
      enlargedSelection,
      colorByHex,
      iconAtlas,
      edgeHoverNodes,
    } = this.props;
    const data = (this.props.data ?? []) as NetworkGraphPoint[];
    const { labelPoints, iconPoints } = this.state as DetailedNodeLayerState;

    const activeId = activeNode?.id ?? null;
    // The backgrounded selection keeps the *full* active styling so its appearance
    // is unchanged while another node is hovered — only its edges are dropped (by
    // the parent).
    const selectedId = enlargedSelection?.id ?? null;
    const isEnlarged = (pointId: NetworkGraphId): boolean =>
      pointId === activeId || pointId === selectedId;
    const count = data.length;
    // Rank nodes front-to-back (later = front). Promote the hovered edge's
    // endpoints — and the active node, highest of all — above every regular node
    // so their whole band jumps to the front. Cheap to rebuild each render; the z
    // it feeds only re-evaluates via `updateTriggers`.
    const orderById = new Map(data.map((point, index) => [point.id, index]));
    const promotedIds: NetworkGraphId[] = [];
    for (const point of edgeHoverNodes) {
      if (point.id !== activeId && !promotedIds.includes(point.id)) {
        promotedIds.push(point.id);
      }
    }
    if (
      selectedId != null &&
      selectedId !== activeId &&
      !promotedIds.includes(selectedId)
    ) {
      promotedIds.push(selectedId);
    }
    if (activeId != null) {
      promotedIds.push(activeId);
    }
    for (const [rank, promotedId] of promotedIds.entries()) {
      if (orderById.has(promotedId)) {
        orderById.set(promotedId, count + rank);
      }
    }
    const slots = count + promotedIds.length;
    const zFor = (point: NetworkGraphPoint, level: number): number =>
      detailZ(orderById.get(point.id) ?? 0, level, slots);
    // `getPosition` z depends on the active node *and* the promoted endpoints, so
    // key its trigger on both — the shared sublayers' `data` doesn't change on hover.
    const stackTrigger = `${activeId ?? ""}:${selectedId ?? ""}:${edgeHoverNodes
      .map((point) => point.id)
      .join(",")}`;
    const rgbFor = (point: NetworkGraphPoint): RgbColor =>
      colorByHex.get(point.color) ?? FALLBACK_COLOR;
    // Both the active node and the backgrounded selection get the bold label.
    const boldLabelNodes = [activeNode, enlargedSelection].filter(
      (node): node is NetworkGraphPoint => Boolean(node?.label),
    );

    // The detail label renders as up to four near-identical TextLayers along two
    // axes: `outline` (white pill backdrop at the outline depth vs inked pill at the
    // label depth) and `active` (a bold copy for the active/selected node). Bold
    // needs its own layer because deck bakes font weight into a per-layer atlas.
    const labelLayer = ({
      idSuffix,
      data: layerData,
      outline,
      active,
    }: {
      idSuffix: string;
      data: NetworkGraphPoint[];
      outline: boolean;
      active: boolean;
    }) =>
      new TextLayer<NetworkGraphPoint>({
        id: `${id}-${idSuffix}`,
        data: layerData,
        getPosition: (point) => [
          point.x,
          point.y,
          zFor(point, outline ? DETAIL_LEVEL_OUTLINE : DETAIL_LEVEL_LABEL),
        ],
        getText: (point) => truncateLabel(point.label ?? ""),
        getSize: DETAIL_LABEL_FONT_SIZE,
        sizeUnits: "pixels",
        fontFamily: DETAIL_LABEL_FONT,
        fontWeight: active ? DETAIL_LABEL_FONT_WEIGHT_ACTIVE : "normal",
        characterSet: "auto",
        getTextAnchor: "middle",
        getAlignmentBaseline: "top",
        getPixelOffset: [0, DETAIL_LABEL_OFFSET],
        // Outline variants contribute only the white pill backdrop (invisible text).
        getColor: outline ? DETAIL_TRANSPARENT : DETAIL_INK,
        background: true,
        backgroundPadding: outline
          ? DETAIL_OUTLINE_PADDING
          : DETAIL_LABEL_PADDING,
        backgroundBorderRadius: outline
          ? DETAIL_OUTLINE_RADIUS
          : DETAIL_LABEL_RADIUS,
        getBackgroundColor: DETAIL_WHITE,
        getBorderColor: outline
          ? DETAIL_WHITE
          : (point) => [...rgbFor(point), RGBA_OPAQUE],
        getBorderWidth: outline ? 0 : 1,
        updateTriggers: { getPosition: stackTrigger },
      });

    return [
      // The white outline around the circle: a stroked ring (hollow) not a filled
      // disk, so the translucent node fill shows the background through it instead
      // of blending over white. The stroke draws inward from the radius, so radius =
      // circle + OUTLINE_WIDTH puts its outer edge OUTLINE_WIDTH beyond the circle
      // and its inner edge on the fill; the ring keeps a constant width and follows
      // the grown active circle. The pill backdrop below completes the silhouette.
      new ScatterplotLayer<NetworkGraphPoint>({
        id: `${id}-outline-circle`,
        data,
        getPosition: (point) => [
          point.x,
          point.y,
          zFor(point, DETAIL_LEVEL_OUTLINE),
        ],
        filled: false,
        stroked: true,
        getLineColor: DETAIL_WHITE,
        getLineWidth: DETAIL_OUTLINE_WIDTH,
        lineWidthUnits: "pixels",
        getRadius: (point) =>
          DETAIL_NODE_DIAMETER / 2 +
          DETAIL_OUTLINE_WIDTH +
          (isEnlarged(point.id) ? DETAIL_CIRCLE_ACCENT_WIDTH : 0),
        radiusUnits: "pixels",
        updateTriggers: {
          getPosition: stackTrigger,
          getRadius: `${activeId ?? ""}:${selectedId ?? ""}`,
        },
      }),
      // The white pill backdrop behind the label, part of the white silhouette.
      labelLayer({
        idSuffix: "outline-pill",
        data: labelPoints,
        outline: true,
        active: false,
      }),
      // The active label's bold-sized outline backdrop, so its white ring matches
      // the bold label text.
      ...(boldLabelNodes.length > 0
        ? [
            labelLayer({
              idSuffix: "active-outline-pill",
              data: boldLabelNodes,
              outline: true,
              active: true,
            }),
          ]
        : []),
      // The node circle — a slightly translucent colour fill (no stroke; the
      // outline backdrop provides its ring). The active circle grows by the accent
      // width so it looks like the node enlarges.
      new ScatterplotLayer<NetworkGraphPoint>({
        id: `${id}-nodes`,
        data,
        // The sole pickable sublayer (see the class doc).
        pickable: true,
        getPosition: (point) => [
          point.x,
          point.y,
          zFor(point, DETAIL_LEVEL_CIRCLE),
        ],
        getFillColor: (point) => [...rgbFor(point), DETAIL_NODE_FILL_ALPHA],
        getRadius: (point) =>
          DETAIL_NODE_DIAMETER / 2 +
          (isEnlarged(point.id) ? DETAIL_CIRCLE_ACCENT_WIDTH : 0),
        radiusUnits: "pixels",
        updateTriggers: {
          getPosition: stackTrigger,
          getRadius: `${activeId ?? ""}:${selectedId ?? ""}`,
        },
      }),
      // A ring around each node the hovered edge connects, in the edge's colour and
      // hover width, at the icon depth so it reads in front of the circle fill.
      new ScatterplotLayer<NetworkGraphPoint>({
        id: `${id}-edge-hover-outline`,
        data: edgeHoverNodes,
        getPosition: (point) => [
          point.x,
          point.y,
          zFor(point, DETAIL_LEVEL_ICON),
        ],
        filled: false,
        stroked: true,
        getLineColor: [...EDGE_COLOR, RGBA_OPAQUE] as Color,
        getLineWidth: EDGE_HOVER_WIDTH,
        lineWidthUnits: "pixels",
        // Stroke draws inward, so radius = circle edge seats the ring just inside the
        // white outline, tracking the grown circle when active.
        getRadius: (point) =>
          DETAIL_NODE_DIAMETER / 2 +
          (isEnlarged(point.id) ? DETAIL_CIRCLE_ACCENT_WIDTH : 0),
        radiusUnits: "pixels",
        updateTriggers: {
          getPosition: stackTrigger,
          getRadius: `${activeId ?? ""}:${selectedId ?? ""}`,
        },
      }),
      // Icons sit on top of the nodes; absent until the atlas has rasterised.
      ...(iconAtlas
        ? [
            new IconLayer<NetworkGraphPoint>({
              id: `${id}-icons`,
              data: iconPoints,
              iconAtlas: iconAtlas.url,
              iconMapping: iconAtlas.mapping,
              getIcon: (point) => point.icon ?? "",
              getPosition: (point) => [
                point.x,
                point.y,
                zFor(point, DETAIL_LEVEL_ICON),
              ],
              getSize: DETAIL_ICON_SIZE,
              sizeUnits: "pixels",
              getColor: (point) => contrastInkRgb(rgbFor(point)),
              updateTriggers: { getPosition: stackTrigger },
            }),
          ]
        : []),
      // The label pill in front of the circle and icon: an opaque white pill with a
      // border in the node's colour, tying label to node.
      labelLayer({
        idSuffix: "labels",
        data: labelPoints,
        outline: false,
        active: false,
      }),
      // The active node's label, redrawn bold on top of its normal-weight copy.
      ...(boldLabelNodes.length > 0
        ? [
            labelLayer({
              idSuffix: "active-label",
              data: boldLabelNodes,
              outline: false,
              active: true,
            }),
          ]
        : []),
    ];
  }
}
