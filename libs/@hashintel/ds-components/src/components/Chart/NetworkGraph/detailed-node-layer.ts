import { CompositeLayer } from "@deck.gl/core";
import { IconLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";

import type { DetailIconAtlas, NetworkGraphPoint } from "./network-graph";
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
const DETAIL_NODE_DIAMETER = 40;
/** On-screen size (px) of the icon drawn inside a detail node. */
const DETAIL_ICON_SIZE = 24;
/** Font size (px) of the detail label text. */
const DETAIL_LABEL_FONT_SIZE = 12;
/** Font stack the label text is rasterised with. */
const DETAIL_LABEL_FONT =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
/** Longest label (chars) before it is truncated with an ellipsis (~2.5× node width). */
const DETAIL_LABEL_MAX_CHARS = 16;
/**
 * Downward pixel offset of the label from the node centre. Equal to the node
 * radius, so the label's text starts just below the node's bottom edge (the
 * pill's padding tucks a couple of pixels behind the node, which is drawn on top).
 */
const DETAIL_LABEL_OFFSET = DETAIL_NODE_DIAMETER / 2;
/** Background padding `[x, y]` of the label pill. */
const DETAIL_LABEL_PADDING: [number, number] = [6, 2];
/** Background padding `[x, y]` of the label's outline halo — larger, so it rings the pill. */
const DETAIL_LABEL_HALO_PADDING: [number, number] = [8, 4];
/** Corner radius (px) of the label pill. */
const DETAIL_LABEL_RADIUS = 9;
/** Corner radius (px) of the label's outline halo (rounds the outline to match). */
const DETAIL_LABEL_HALO_RADIUS = 11;
/** Ring width (px) around an idle (not hovered/selected) node and its label. */
const DETAIL_OUTLINE_WIDTH_IDLE = 1.5;
/** Ring width (px) around an active (hovered/selected) node and its label. */
const DETAIL_OUTLINE_WIDTH_ACTIVE = 3;
/** How far (px) the active node's translucent glow extends beyond its radius. */
const DETAIL_GLOW_EXTENT = 7;
/** Alpha (0–255) of the active node's translucent glow. */
const DETAIL_GLOW_ALPHA = 80;
/** Opaque white, used for node/label fills and the idle outline. */
const DETAIL_WHITE: Color = [255, 255, 255, 255];
/** Fully transparent, used to hide the halo's (invisible) text. */
const DETAIL_TRANSPARENT: Color = [0, 0, 0, 0];
/** Dark ink for the label text. */
const DETAIL_INK: Color = [15, 18, 25, 255];
/**
 * The node parts live in separate sublayers, so across-sublayer draw order alone
 * would let a back node's icon/label show over a front node. Instead each node's
 * parts share a per-node depth *band* via the z coordinate, with the depth buffer
 * resolving occlusion: every part of a nearer node beats every part of a node
 * behind it. Within a band the parts stack `glow < halo < label < circle < icon`
 * (back to front). `DETAIL_Z_STEP` is the world-z gap between adjacent levels —
 * tiny, but far above the orthographic depth buffer's resolution.
 */
const DETAIL_Z_STEP = 0.001;
const DETAIL_LEVEL_GLOW = 0;
const DETAIL_LEVEL_HALO = 1;
const DETAIL_LEVEL_LABEL = 2;
const DETAIL_LEVEL_CIRCLE = 3;
const DETAIL_LEVEL_ICON = 4;
const DETAIL_LEVEL_COUNT = 5;

/**
 * World-space z for a node part. `order` is the node's front-to-back rank (later
 * = nearer), `level` its part (see the `DETAIL_LEVEL_*` constants), `count` the
 * number of nodes. Offset so all values are ≤ 0 (the compact layer, at z 0,
 * disables depth writes so it never occludes these); the `+ 1` reserves a band
 * above every regular node for the active node, ranked `count` so it jumps to the
 * front. Larger z = nearer; a whole node's band sits above the node behind it, so
 * a front node occludes every part of a back node it overlaps.
 */
const detailZ = (order: number, level: number, count: number): number =>
  (order * DETAIL_LEVEL_COUNT + level - (count + 1) * DETAIL_LEVEL_COUNT) *
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
  /** The hovered/selected node — jumps to the front and gets the glow + outline. */
  activeNode: NetworkGraphPoint | null;
  /** Distinct hex colour → rgb, resolved once by the parent. */
  colorByHex: Map<string, RgbColor>;
  /** Mask atlas of the icons used by the data; `null` until it has rasterised. */
  iconAtlas: DetailIconAtlas | null;
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
};

/**
 * The detailed (zoomed-in) node rendering: a larger circle showing the node's
 * icon, with its label in a pill beneath, an outline (white when idle,
 * colour-matched when active), and a translucent glow behind the active node.
 * Each node's parts share a per-node depth band (see {@link detailZ}) so a front
 * node occludes every part of a node behind it, and the active node jumps to the
 * front. The parts are not pickable — the compact layer's points resolve picking.
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
    const { id, activeNode, colorByHex, iconAtlas } = this.props;
    const data = (this.props.data ?? []) as NetworkGraphPoint[];
    const { labelPoints, iconPoints } = this.state as DetailedNodeLayerState;

    const activeId = activeNode?.id ?? null;
    const count = data.length;
    // Rank nodes front-to-back (later = front), bumping the active node above all
    // the rest so it jumps to the front. Cheap to rebuild each render (≤ a few
    // hundred nodes); the z it feeds only re-evaluates via `updateTriggers`.
    const orderById = new Map(data.map((point, index) => [point.id, index]));
    if (activeId != null && orderById.has(activeId)) {
      orderById.set(activeId, count);
    }
    const zFor = (point: NetworkGraphPoint, level: number): number =>
      detailZ(orderById.get(point.id) ?? 0, level, count);
    const rgbFor = (point: NetworkGraphPoint): RgbColor =>
      colorByHex.get(point.color) ?? FALLBACK_COLOR;

    return [
      new ScatterplotLayer<NetworkGraphPoint>({
        id: `${id}-active-glow`,
        // A translucent, colour-matched disc slightly larger than the node; the
        // opaque node drawn on top leaves it showing as a soft glow ring.
        data: activeNode ? [activeNode] : [],
        getPosition: (point) => [
          point.x,
          point.y,
          zFor(point, DETAIL_LEVEL_GLOW),
        ],
        getFillColor: (point) => [...rgbFor(point), DETAIL_GLOW_ALPHA],
        getRadius: DETAIL_NODE_DIAMETER / 2 + DETAIL_GLOW_EXTENT,
        radiusUnits: "pixels",
        updateTriggers: { getPosition: activeId },
      }),
      new TextLayer<NetworkGraphPoint>({
        id: `${id}-label-halo`,
        data: labelPoints,
        getPosition: (point) => [
          point.x,
          point.y,
          zFor(point, DETAIL_LEVEL_HALO),
        ],
        getText: (point) => truncateLabel(point.label ?? ""),
        getSize: DETAIL_LABEL_FONT_SIZE,
        sizeUnits: "pixels",
        fontFamily: DETAIL_LABEL_FONT,
        characterSet: "auto",
        getTextAnchor: "middle",
        getAlignmentBaseline: "top",
        getPixelOffset: [0, DETAIL_LABEL_OFFSET],
        // The halo contributes only an outline: its text is invisible and its
        // (opaque white) background is hidden behind the pill, leaving just the
        // ring — white when idle, colour-matched when active.
        getColor: DETAIL_TRANSPARENT,
        background: true,
        backgroundPadding: DETAIL_LABEL_HALO_PADDING,
        backgroundBorderRadius: DETAIL_LABEL_HALO_RADIUS,
        getBackgroundColor: DETAIL_WHITE,
        getBorderColor: (point) =>
          point.id === activeId
            ? [...rgbFor(point), RGBA_OPAQUE]
            : DETAIL_WHITE,
        getBorderWidth: (point) =>
          point.id === activeId
            ? DETAIL_OUTLINE_WIDTH_ACTIVE
            : DETAIL_OUTLINE_WIDTH_IDLE,
        updateTriggers: {
          getPosition: activeId,
          getBorderColor: activeId,
          getBorderWidth: activeId,
        },
      }),
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
        updateTriggers: { getPosition: activeId },
      }),
      new ScatterplotLayer<NetworkGraphPoint>({
        id: `${id}-nodes`,
        data,
        getPosition: (point) => [
          point.x,
          point.y,
          zFor(point, DETAIL_LEVEL_CIRCLE),
        ],
        getFillColor: rgbFor,
        getRadius: DETAIL_NODE_DIAMETER / 2,
        radiusUnits: "pixels",
        // Idle nodes get a thin white ring for separation; active nodes a
        // thicker colour-matched ring instead of growing.
        stroked: true,
        getLineColor: (point) =>
          point.id === activeId
            ? [...rgbFor(point), RGBA_OPAQUE]
            : DETAIL_WHITE,
        getLineWidth: (point) =>
          point.id === activeId
            ? DETAIL_OUTLINE_WIDTH_ACTIVE
            : DETAIL_OUTLINE_WIDTH_IDLE,
        lineWidthUnits: "pixels",
        updateTriggers: {
          getPosition: activeId,
          getLineColor: activeId,
          getLineWidth: activeId,
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
              updateTriggers: { getPosition: activeId },
            }),
          ]
        : []),
    ];
  }
}
