import { CompositeLayer } from "@deck.gl/core";
import { IconLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";

import { EDGE_COLOR, EDGE_HOVER_WIDTH } from "./network-graph-util";

import type { DetailIconAtlas, NetworkGraphPoint } from "./network-graph-util";
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
 * chunky, connected shape. Kept at `radius − icon half-height` so the pill's top
 * still clears the icon above it (the label is drawn in front of the node).
 */
const DETAIL_LABEL_OVERLAP = DETAIL_NODE_DIAMETER / 2 - DETAIL_ICON_SIZE / 2;
/**
 * Downward pixel offset of the label text from the node centre — set so the pill
 * overlaps the node by {@link DETAIL_LABEL_OVERLAP} while sitting above it.
 */
const DETAIL_LABEL_OFFSET =
  DETAIL_NODE_DIAMETER / 2 - DETAIL_LABEL_OVERLAP + DETAIL_LABEL_PADDING[1];
/** Corner radius (px) of the label pill. */
const DETAIL_LABEL_RADIUS = 6;
/**
 * Width (px) of the white outline that traces the whole node+label silhouette — a
 * white backdrop of the circle and pill, enlarged by this much and drawn behind
 * the fills, so only the outer ring shows and the two pieces merge into one
 * continuous outline. Constant across idle and hover.
 */
const DETAIL_OUTLINE_WIDTH = 1.5;
/**
 * Width (px) the active circle grows by, in the node's own colour, inside the
 * white outline — so the node appears to enlarge slightly on hover.
 */
const DETAIL_CIRCLE_ACCENT_WIDTH = 1.5;
/** Background padding of the outline's pill backdrop — the label padding + the outline width. */
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
/** Fully transparent, used to hide the outline backdrops' (invisible) text. */
const DETAIL_TRANSPARENT: Color = [0, 0, 0, 0];
/** Dark ink for the label text. */
const DETAIL_INK: Color = [15, 18, 25, 255];
/**
 * Opacity of a detail node's coloured circle fill. Slightly translucent so the
 * background reads softer than the fully-opaque icon, label and white outline. It
 * blends over the white outline backdrop directly behind it, lightening the
 * colour rather than showing the graph through it.
 */
const DETAIL_NODE_FILL_OPACITY = 0.85;
const DETAIL_NODE_FILL_ALPHA = Math.round(255 * DETAIL_NODE_FILL_OPACITY);
/**
 * The node parts live in separate sublayers, so across-sublayer draw order alone
 * would let a back node's icon/label show over a front node. Instead each node's
 * parts share a per-node depth *band* via the z coordinate, with the depth buffer
 * resolving occlusion: every part of a nearer node beats every part of a node
 * behind it. Within a band the parts stack `outline < circle < icon < label`
 * (back to front) — the label sits above the node and the outline is a white
 * backdrop behind everything. `DETAIL_Z_STEP` is the world-z gap between adjacent
 * levels — tiny, but far above the orthographic depth buffer's resolution.
 */
const DETAIL_Z_STEP = 0.001;
const DETAIL_LEVEL_OUTLINE = 0;
const DETAIL_LEVEL_CIRCLE = 1;
const DETAIL_LEVEL_ICON = 2;
const DETAIL_LEVEL_LABEL = 3;
const DETAIL_LEVEL_COUNT = 4;

/**
 * World-space z for a node part. `order` is the node's front-to-back rank (later
 * = nearer), `level` its part (see the `DETAIL_LEVEL_*` constants), and `slots`
 * the total number of rank slots — every regular node plus the promoted ones (the
 * hovered edge's endpoints and the active node) that jump above them. Offset by
 * `slots` so all values are ≤ 0 (the compact layer, at z 0, disables depth writes
 * so it never occludes these). Larger z = nearer; a whole node's band sits above
 * the node behind it, so a front node occludes every part of a back node it
 * overlaps.
 */
const detailZ = (order: number, level: number, slots: number): number =>
  (order * DETAIL_LEVEL_COUNT + level - slots * DETAIL_LEVEL_COUNT) *
  DETAIL_Z_STEP;

/** Truncate a label to {@link DETAIL_LABEL_MAX_CHARS} with an ellipsis. */
const truncateLabel = (label: string): string =>
  label.length > DETAIL_LABEL_MAX_CHARS
    ? `${label.slice(0, DETAIL_LABEL_MAX_CHARS - 1)}…`
    : label;

/**
 * Pick a legible ink colour (near-black or white) to sit on top of `rgb`, based
 * on its perceived luminance — so an icon stays visible inside a node of any
 * colour.
 */
const contrastInkRgb = (rgb: RgbColor): RgbColor => {
  const luminance = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
  return luminance > 0.6 ? [15, 18, 25] : [255, 255, 255];
};

type _DetailedNodeLayerProps = {
  /** The hovered/selected node — jumps to the front with a bolder, accented style. */
  activeNode: NetworkGraphPoint | null;
  /** Distinct hex colour → rgb, resolved once by the parent. */
  colorByHex: Map<string, RgbColor>;
  /** Mask atlas of the icons used by the data; `null` until it has rasterised. */
  iconAtlas: DetailIconAtlas | null;
  /**
   * The two endpoint nodes of the hovered edge, each ringed in the edge's colour
   * and hover width so it's clear which nodes it connects. Empty when no edge is
   * hovered.
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
  colorByHex: new Map<string, RgbColor>(),
  iconAtlas: null,
  edgeHoverNodes: [],
};

/**
 * The detailed (zoomed-in) node rendering: a larger circle showing the node's
 * icon, with its label in a pill beneath, and a white outline around the whole
 * node+label silhouette. Active (hover/selected): the label text goes bold and the
 * circle grows slightly in its own colour (inside the white outline, which keeps a
 * constant width). Each node's parts share a per-node depth band (see
 * {@link detailZ}) so a front node occludes every part of a node behind it, and
 * the active node jumps to the front. The circle sublayer is pickable: when the
 * detailed nodes are shown the compact points are hidden, so picking resolves off
 * these circles.
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
    const { id, activeNode, colorByHex, iconAtlas, edgeHoverNodes } =
      this.props;
    const data = (this.props.data ?? []) as NetworkGraphPoint[];
    const { labelPoints, iconPoints } = this.state as DetailedNodeLayerState;

    const activeId = activeNode?.id ?? null;
    const count = data.length;
    // Rank nodes front-to-back (later = front). Promote the hovered edge's
    // endpoints — and the active node, highest of all — above every regular node
    // so their whole band (circle, icon, label, outlines) jumps to the front, the
    // same way a hovered node does. Cheap to rebuild each render (≤ a few hundred
    // nodes); the z it feeds only re-evaluates via `updateTriggers`.
    const orderById = new Map(data.map((point, index) => [point.id, index]));
    const promotedIds: number[] = [];
    for (const point of edgeHoverNodes) {
      if (point.id !== activeId && !promotedIds.includes(point.id)) {
        promotedIds.push(point.id);
      }
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
    // key its update trigger on both (the shared sublayers' `data` doesn't change
    // when only the hover does).
    const stackTrigger = `${activeId ?? ""}:${edgeHoverNodes
      .map((point) => point.id)
      .join(",")}`;
    const rgbFor = (point: NetworkGraphPoint): RgbColor =>
      colorByHex.get(point.color) ?? FALLBACK_COLOR;
    const activePoint =
      activeId != null ? [activeNode as NetworkGraphPoint] : [];

    return [
      // The white outline around the circle: a stroked ring (hollow) rather than a
      // filled disk, so the translucent node fill shows the background through it
      // instead of blending over white. The stroke draws inward from the radius,
      // so with radius = circle + OUTLINE_WIDTH its outer edge sits OUTLINE_WIDTH
      // beyond the circle and its inner edge meets the fill; the ring keeps a
      // constant width and, on the active node, follows the grown circle. The pill
      // backdrop below completes the node+label silhouette.
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
          (point.id === activeId ? DETAIL_CIRCLE_ACCENT_WIDTH : 0),
        radiusUnits: "pixels",
        updateTriggers: {
          getPosition: stackTrigger,
          getRadius: activeId,
        },
      }),
      new TextLayer<NetworkGraphPoint>({
        id: `${id}-outline-pill`,
        data: labelPoints,
        getPosition: (point) => [
          point.x,
          point.y,
          zFor(point, DETAIL_LEVEL_OUTLINE),
        ],
        getText: (point) => truncateLabel(point.label ?? ""),
        getSize: DETAIL_LABEL_FONT_SIZE,
        sizeUnits: "pixels",
        fontFamily: DETAIL_LABEL_FONT,
        characterSet: "auto",
        getTextAnchor: "middle",
        getAlignmentBaseline: "top",
        getPixelOffset: [0, DETAIL_LABEL_OFFSET],
        // Invisible text — this layer contributes only the pill-shaped backdrop.
        getColor: DETAIL_TRANSPARENT,
        background: true,
        backgroundPadding: DETAIL_OUTLINE_PADDING,
        backgroundBorderRadius: DETAIL_OUTLINE_RADIUS,
        getBackgroundColor: DETAIL_WHITE,
        getBorderWidth: 0,
        updateTriggers: { getPosition: stackTrigger },
      }),
      // The active label's outline backdrop — bold-sized so its white ring matches
      // the bold label text. Same width as idle (the outline only thickens around
      // the circle, not the label). Active (labelled) node only.
      ...(activeNode?.label
        ? [
            new TextLayer<NetworkGraphPoint>({
              id: `${id}-active-outline-pill`,
              data: activePoint,
              getPosition: (point) => [
                point.x,
                point.y,
                zFor(point, DETAIL_LEVEL_OUTLINE),
              ],
              getText: (point) => truncateLabel(point.label ?? ""),
              getSize: DETAIL_LABEL_FONT_SIZE,
              sizeUnits: "pixels",
              fontFamily: DETAIL_LABEL_FONT,
              fontWeight: DETAIL_LABEL_FONT_WEIGHT_ACTIVE,
              characterSet: "auto",
              getTextAnchor: "middle",
              getAlignmentBaseline: "top",
              getPixelOffset: [0, DETAIL_LABEL_OFFSET],
              getColor: DETAIL_TRANSPARENT,
              background: true,
              backgroundPadding: DETAIL_OUTLINE_PADDING,
              backgroundBorderRadius: DETAIL_OUTLINE_RADIUS,
              getBackgroundColor: DETAIL_WHITE,
              getBorderWidth: 0,
              updateTriggers: { getPosition: stackTrigger },
            }),
          ]
        : []),
      // The node circle — a slightly translucent colour fill (no stroke; the
      // outline backdrop provides its ring). The active circle grows by the accent
      // width so it looks like the node enlarges.
      new ScatterplotLayer<NetworkGraphPoint>({
        id: `${id}-nodes`,
        data,
        // The one pickable sublayer: when detailed nodes are shown the compact
        // points are hidden, so picking (hover/click) resolves off these circles.
        pickable: true,
        getPosition: (point) => [
          point.x,
          point.y,
          zFor(point, DETAIL_LEVEL_CIRCLE),
        ],
        getFillColor: (point) => [...rgbFor(point), DETAIL_NODE_FILL_ALPHA],
        getRadius: (point) =>
          DETAIL_NODE_DIAMETER / 2 +
          (point.id === activeId ? DETAIL_CIRCLE_ACCENT_WIDTH : 0),
        radiusUnits: "pixels",
        updateTriggers: {
          getPosition: stackTrigger,
          getRadius: activeId,
        },
      }),
      // A ring around each node the hovered edge connects, in the edge's colour
      // and hover width, sitting just inside the white outline (over the fill's
      // edge). Drawn at the icon depth so it reads in front of the circle fill.
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
        // Stroke draws inward from the radius, so setting the radius to the circle
        // edge (the white outline's inner edge) seats the ring just inside the
        // white outline — tracking the grown circle when active.
        getRadius: (point) =>
          DETAIL_NODE_DIAMETER / 2 +
          (point.id === activeId ? DETAIL_CIRCLE_ACCENT_WIDTH : 0),
        radiusUnits: "pixels",
        updateTriggers: {
          getPosition: stackTrigger,
          getRadius: activeId,
        },
      }),
      // Icons sit on top of the nodes. Absent until the atlas has rasterised.
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
              // Tint the icon mask to a legible ink for the node's colour.
              getColor: (point) => contrastInkRgb(rgbFor(point)),
              updateTriggers: { getPosition: stackTrigger },
            }),
          ]
        : []),
      // The label pill sits above the node (in front of the circle and icon).
      new TextLayer<NetworkGraphPoint>({
        id: `${id}-labels`,
        data: labelPoints,
        getPosition: (point) => [
          point.x,
          point.y,
          zFor(point, DETAIL_LEVEL_LABEL),
        ],
        getText: (point) => truncateLabel(point.label ?? ""),
        getSize: DETAIL_LABEL_FONT_SIZE,
        sizeUnits: "pixels",
        fontFamily: DETAIL_LABEL_FONT,
        characterSet: "auto",
        getTextAnchor: "middle",
        getAlignmentBaseline: "top",
        getPixelOffset: [0, DETAIL_LABEL_OFFSET],
        getColor: DETAIL_INK,
        background: true,
        backgroundPadding: DETAIL_LABEL_PADDING,
        backgroundBorderRadius: DETAIL_LABEL_RADIUS,
        // Opaque white pill so it stays solid over nodes and open space alike.
        getBackgroundColor: DETAIL_WHITE,
        // Border matches the entity colour, tying the label to its node.
        getBorderColor: (point) => [...rgbFor(point), RGBA_OPAQUE],
        getBorderWidth: 1,
        updateTriggers: { getPosition: stackTrigger },
      }),
      // The active node's label, redrawn bold on top of its normal-weight copy.
      ...(activeNode?.label
        ? [
            new TextLayer<NetworkGraphPoint>({
              id: `${id}-active-label`,
              data: activePoint,
              getPosition: (point) => [
                point.x,
                point.y,
                zFor(point, DETAIL_LEVEL_LABEL),
              ],
              getText: (point) => truncateLabel(point.label ?? ""),
              getSize: DETAIL_LABEL_FONT_SIZE,
              sizeUnits: "pixels",
              fontFamily: DETAIL_LABEL_FONT,
              fontWeight: DETAIL_LABEL_FONT_WEIGHT_ACTIVE,
              characterSet: "auto",
              getTextAnchor: "middle",
              getAlignmentBaseline: "top",
              getPixelOffset: [0, DETAIL_LABEL_OFFSET],
              getColor: DETAIL_INK,
              background: true,
              backgroundPadding: DETAIL_LABEL_PADDING,
              backgroundBorderRadius: DETAIL_LABEL_RADIUS,
              getBackgroundColor: DETAIL_WHITE,
              getBorderColor: (point) => [...rgbFor(point), RGBA_OPAQUE],
              getBorderWidth: 1,
              updateTriggers: { getPosition: stackTrigger },
            }),
          ]
        : []),
    ];
  }
}
