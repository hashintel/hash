import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { Icon } from "../../Icon/icon";

import type { IconName } from "../../Icon/icon";

/** A node or edge id. */
export type NetworkGraphId = string | number;

export interface NetworkGraphPoint {
  id: NetworkGraphId;
  x: number;
  y: number;
  /** CSS hex colour (e.g. `#FF8C26`) used for the node. */
  color: string;
  label?: string;
  /** Icon rendered inside the node in the zoomed-in detail variation. */
  icon?: IconName;
}

export interface NetworkGraphEdge {
  id: NetworkGraphId;
  fromId: NetworkGraphId;
  toId: NetworkGraphId;
  /**
   * Text shown in the pill drawn on the edge while it is hovered or selected.
   * The consumer supplies it already resolved (e.g. the link type's icon + label
   * looked up from its own metadata); the graph just draws the string. Omit it
   * to draw no pill.
   */
  label?: string;
}

export interface HoverLine {
  /** The edge's id, so a hovered highlight edge can be matched to its label. */
  id: NetworkGraphId;
  source: [number, number];
  target: [number, number];
}

/**
 * A hovered edge, normalised for the on-hover label regardless of how it was
 * drawn (bundled curve in the detail view, or straight two-point line in the
 * compact view): its edge id, the world-space polyline as rendered, and its
 * endpoint nodes (when resolvable), outlined while hovered.
 */
export interface HoverableEdge {
  edgeId: NetworkGraphId;
  path: [number, number][];
  endpoints: NetworkGraphPoint[];
}

/** An `[r, g, b]` colour, each channel 0–255, as deck.gl layers consume it. */
export type RgbColor = [number, number, number];

/** Fully-opaque 8-bit alpha. */
export const RGBA_OPAQUE = 255;
/** Colour used when a point's hex value cannot be resolved. */
export const FALLBACK_COLOR: RgbColor = [148, 148, 148];

/** RGB stroke colour shared by every edge (0–255). */
export const EDGE_COLOR: RgbColor = [80, 88, 110];
/**
 * Lighter grey used for the backgrounded selection's edges (and their arrows) while a
 * different node is hovered, so its neighbourhood reads as secondary to the hovered
 * node's edges (which stay {@link EDGE_COLOR}). Drawn at the same reduced opacity as the
 * rest of the dimmed selection. The midpoint between {@link EDGE_COLOR} and a lighter
 * grey (`[155, 160, 174]`), so it sits halfway between the active edge colour and grey.
 */
export const DIMMED_EDGE_COLOR: RgbColor = [118, 124, 142];
/** On-screen width (px) of an edge, and its floor as it scales with zoom. */
export const EDGE_WIDTH = 0.75;
export const EDGE_MIN_WIDTH = 0.5;
/**
 * Width (px) of a hovered edge and of the outline on its two nodes; a multiple
 * of {@link EDGE_WIDTH} so it stands out from surrounding edges.
 */
export const EDGE_HOVER_WIDTH = EDGE_WIDTH * 3;

/**
 * Style shared by every text label the graph rasterises — the detail node label
 * pill ({@link DetailIconAtlas} layer) and the imperatively-drawn edge-hover pill
 * ({@link drawEdgeLabel}) — so the two treatments stay visually in sync.
 */
export const LABEL_FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
/** Font size (px) of label text. */
export const LABEL_FONT_SIZE = 12;
/** Horizontal padding (px) inside a label pill. */
export const LABEL_PADDING_X = 6;
/** Vertical padding (px) inside a label pill. */
export const LABEL_PADDING_Y = 2;
/** Corner radius (px) of a label pill. */
export const LABEL_BORDER_RADIUS = 6;

/** Parse a `#RRGGBB` string into a deck.gl `[r, g, b]` colour. */
export const hexToRgb = (hex: string): RgbColor => {
  const value = hex.replace("#", "");
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
};

/** Resolution (px) each icon is rasterised at in the mask atlas. */
export const DETAIL_ICON_TEXTURE = 64;

const iconTextureCache = new Map<IconName, string>();

/**
 * SVG data URL for an icon, forced to a fixed size and solid fill so it can be
 * used as a tintable mask. Derived from the {@link Icon} registry so it stays in
 * sync, cached per icon name. Browser-only (called from an effect).
 */
export const iconTextureUrl = (name: IconName): string => {
  const cached = iconTextureCache.get(name);
  if (cached !== undefined) {
    return cached;
  }
  const markup = renderToStaticMarkup(createElement(Icon, { name }));
  const svg = markup
    .replace(
      /<svg([^>]*)>/,
      (_match, attributes: string) =>
        `<svg${attributes.replace(
          /\s(?:width|height)="[^"]*"/g,
          "",
        )} width="${DETAIL_ICON_TEXTURE}" height="${DETAIL_ICON_TEXTURE}">`,
    )
    // `currentColor` has no CSS context here; pin it so the glyph rasterises as
    // an opaque shape whose alpha is the mask (tinted later via `getColor`).
    .replace(/currentColor/g, "#000000");
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  iconTextureCache.set(name, url);
  return url;
};

export interface DetailIconAtlas {
  /** Data-URL of the rasterised atlas, passed straight to `IconLayer.iconAtlas`. */
  url: string;
  mapping: Record<
    string,
    {
      x: number;
      y: number;
      width: number;
      height: number;
      mask: boolean;
      anchorX: number;
      anchorY: number;
    }
  >;
}

// ── Pan clamping ───────────────────────────────────────────────────────────────

/**
 * Screen-space padding (px) the viewport may show beyond the network when
 * panning, shared by the pan-clamp helpers below.
 */
const PAN_PADDING_PX = 10;

/**
 * The inclusive range a pan `center` may take on one axis so the viewport shows a
 * node at the network edge in full plus at most {@link PAN_PADDING_PX} beyond it.
 * `scale` is the world→pixel factor (`2 ** zoom`). `marginPx` is the on-screen
 * radius (px) of a node as drawn, added to the padding so the clamp keeps the node
 * *discs* in view rather than the node *centres* the bounds cover — otherwise an
 * edge node can only be panned until its centre reaches the viewport edge, leaving
 * its outer radius clipped. The two per-side limits order as `[lo, hi]` zoomed in
 * but swap zoomed out — sorting covers both regimes.
 */
const panAxisLimits = (
  min: number,
  max: number,
  viewportPx: number,
  scale: number,
  marginPx: number,
): [number, number] => {
  const pad = (PAN_PADDING_PX + marginPx) / scale;
  const half = viewportPx / (2 * scale);
  const a = min - pad + half;
  const b = max + pad - half;
  return [Math.min(a, b), Math.max(a, b)];
};

/**
 * Hard-clamp an orthographic pan `target` to the nearest in-range value so the
 * viewport never shows more than a node's drawn radius (`marginPx`) plus {@link
 * PAN_PADDING_PX} beyond the network's bounding box. Used where the target is
 * computed afresh (`revealPoint`) and must land inside the limits regardless of
 * where the view previously sat. `viewport{Width,Height}` are in CSS pixels;
 * `marginPx` is the drawn node radius (see {@link panAxisLimits}).
 */
export const clampPanTarget = (
  target: number[],
  scale: number,
  viewportWidth: number,
  viewportHeight: number,
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
  marginPx: number,
): [number, number, number] => {
  const [loX, hiX] = panAxisLimits(
    bounds.minX,
    bounds.maxX,
    viewportWidth,
    scale,
    marginPx,
  );
  const [loY, hiY] = panAxisLimits(
    bounds.minY,
    bounds.maxY,
    viewportHeight,
    scale,
    marginPx,
  );
  return [
    Math.min(hiX, Math.max(loX, target[0] ?? 0)),
    Math.min(hiY, Math.max(loY, target[1] ?? 0)),
    target[2] ?? 0,
  ];
};

/**
 * Constrain a pan *relative to where the view already is*, so the clamp only
 * resists the user's own panning and never pans the view on its own. On each axis
 * the target may move freely back toward the network but is blocked from moving
 * further out than `previous` (the committed target) already sits.
 *
 * Matters when a zoom shrinks the pan limits: a target parked at the edge would
 * fall outside the new limits and {@link clampPanTarget} would snap it inward,
 * jerking the view sideways as the user merely zoomed. Relaxing each bound to
 * include `previous` leaves the view put and only stops further outward panning.
 */
export const clampPanTargetBlocking = (
  target: number[],
  previous: number[],
  scale: number,
  viewportWidth: number,
  viewportHeight: number,
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
  marginPx: number,
): [number, number, number] => {
  const clampAxis = (
    center: number,
    prev: number,
    min: number,
    max: number,
    viewportPx: number,
  ) => {
    const [lo, hi] = panAxisLimits(min, max, viewportPx, scale, marginPx);
    // Relax whichever bound `prev` sits beyond, so the view is never pulled inward.
    return Math.min(Math.max(hi, prev), Math.max(Math.min(lo, prev), center));
  };
  return [
    clampAxis(
      target[0] ?? 0,
      previous[0] ?? 0,
      bounds.minX,
      bounds.maxX,
      viewportWidth,
    ),
    clampAxis(
      target[1] ?? 0,
      previous[1] ?? 0,
      bounds.minY,
      bounds.maxY,
      viewportHeight,
    ),
    target[2] ?? 0,
  ];
};

// ── Edge geometry ──────────────────────────────────────────────────────────────

/**
 * Clip a screen-space segment `a → b` to the rect `[0, 0] … [width, height]`
 * (Liang–Barsky), returning the visible sub-segment or `null` if it lies wholly
 * outside. Used to find the part of a hovered edge that is actually on screen.
 */
const clipSegmentToViewport = (
  a: [number, number],
  b: [number, number],
  width: number,
  height: number,
): [[number, number], [number, number]] | null => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  // Each boundary as (pk, qk): inside where `pk * t <= qk` (Liang–Barsky).
  const tests: [number, number][] = [
    [-dx, a[0]],
    [dx, width - a[0]],
    [-dy, a[1]],
    [dy, height - a[1]],
  ];
  let t0 = 0;
  let t1 = 1;
  for (const [pk, qk] of tests) {
    if (pk === 0) {
      // Parallel to this boundary: reject only if it starts outside it.
      if (qk < 0) {
        return null;
      }
      continue;
    }
    const rk = qk / pk;
    if (pk < 0) {
      if (rk > t1) {
        return null;
      }
      if (rk > t0) {
        t0 = rk;
      }
    } else {
      if (rk < t0) {
        return null;
      }
      if (rk < t1) {
        t1 = rk;
      }
    }
  }
  return [
    [a[0] + t0 * dx, a[1] + t0 * dy],
    [a[0] + t1 * dx, a[1] + t1 * dy],
  ];
};

/**
 * The point at the middle of a polyline's on-screen length: project each vertex,
 * clip every segment to the viewport, then walk to half the total visible arc
 * length. This lands the edge label at the centre of the edge, or — when the edge
 * runs off screen — at the centre of the portion still in view. Returns `null`
 * when no part of the polyline is visible.
 */
export const edgeLabelAnchor = (
  screenPoints: [number, number][],
  width: number,
  height: number,
): [number, number] | null => {
  const segments: [[number, number], [number, number], number][] = [];
  let totalLength = 0;
  for (let index = 0; index + 1 < screenPoints.length; index += 1) {
    const start = screenPoints[index];
    const end = screenPoints[index + 1];
    if (!start || !end) {
      continue;
    }
    const clipped = clipSegmentToViewport(start, end, width, height);
    if (!clipped) {
      continue;
    }
    const length = Math.hypot(
      clipped[1][0] - clipped[0][0],
      clipped[1][1] - clipped[0][1],
    );
    segments.push([clipped[0], clipped[1], length]);
    totalLength += length;
  }
  const first = segments[0];
  if (!first) {
    return null;
  }
  if (totalLength === 0) {
    // Every visible part is a single point (e.g. a dot-length edge): use it.
    return first[0];
  }
  let remaining = totalLength / 2;
  for (const [start, end, length] of segments) {
    if (remaining <= length) {
      const fraction = length === 0 ? 0 : remaining / length;
      return [
        start[0] + (end[0] - start[0]) * fraction,
        start[1] + (end[1] - start[1]) * fraction,
      ];
    }
    remaining -= length;
  }
  return first[0];
};

/**
 * Shorten a world-space polyline by `trim` world units from its **end** (target),
 * interpolating a new endpoint. Used to open the arrow's gap between a highlighted
 * edge and the node it points at.
 */
const trimPathEnd = (
  path: [number, number][],
  trim: number,
): [number, number][] => {
  if (path.length < 2 || trim <= 0) {
    return path;
  }
  let remaining = trim;
  for (let index = path.length - 1; index >= 1; index -= 1) {
    const end = path[index];
    const previous = path[index - 1];
    if (!end || !previous) {
      continue;
    }
    const dx = end[0] - previous[0];
    const dy = end[1] - previous[1];
    const segment = Math.hypot(dx, dy);
    if (segment === 0) {
      continue;
    }
    if (remaining < segment) {
      const fraction = remaining / segment;
      return [
        ...path.slice(0, index),
        [end[0] - dx * fraction, end[1] - dy * fraction],
      ];
    }
    remaining -= segment;
  }
  // The trim consumed the whole path (edge shorter than the gap): draw nothing.
  const first = path[0];
  return first ? [first, first] : path;
};

/**
 * Shorten a polyline from both ends — `startTrim` world units off the source end
 * and `endTrim` off the target end — so a detail-view edge stops at each node's
 * edge instead of running to its centre (under the translucent node).
 */
export const trimPathBothEnds = (
  path: [number, number][],
  startTrim: number,
  endTrim: number,
): [number, number][] => {
  let result = trimPathEnd(path, endTrim);
  if (startTrim > 0 && result.length >= 2) {
    result = [...trimPathEnd([...result].reverse(), startTrim)].reverse();
  }
  return result;
};

// ── Edge-hover label pill ────────────────────────────────────────────────────

const roundRectPath = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void => {
  const clampedRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + clampedRadius, y);
  ctx.arcTo(x + width, y, x + width, y + height, clampedRadius);
  ctx.arcTo(x + width, y + height, x, y + height, clampedRadius);
  ctx.arcTo(x, y + height, x, y, clampedRadius);
  ctx.arcTo(x, y, x + width, y, clampedRadius);
  ctx.closePath();
};

/** Ink, fill, and outline of the edge-hover label pill (outlined in black). */
const EDGE_LABEL_INK = "rgb(15, 18, 25)";
const EDGE_LABEL_BACKGROUND = "rgb(255, 255, 255)";
const EDGE_LABEL_BORDER = "rgb(0, 0, 0)";
const EDGE_LABEL_BORDER_WIDTH = 1;

/**
 * Draw the edge label pill (white fill, black outline) centred at `anchor`.
 * Mirrors the detail node label's shared {@link LABEL_FONT_FAMILY}/padding/radius,
 * drawn imperatively on a 2D overlay canvas so it tracks the edge across pan/zoom.
 */
export const drawEdgeLabel = (
  ctx: CanvasRenderingContext2D,
  anchor: [number, number],
  text: string,
): void => {
  ctx.font = `${LABEL_FONT_SIZE}px ${LABEL_FONT_FAMILY}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const textWidth = ctx.measureText(text).width;
  const rectWidth = textWidth + LABEL_PADDING_X * 2;
  const rectHeight = LABEL_FONT_SIZE + LABEL_PADDING_Y * 2;
  const [centerX, centerY] = anchor;
  roundRectPath(
    ctx,
    centerX - rectWidth / 2,
    centerY - rectHeight / 2,
    rectWidth,
    rectHeight,
    LABEL_BORDER_RADIUS,
  );
  ctx.fillStyle = EDGE_LABEL_BACKGROUND;
  ctx.fill();
  ctx.lineWidth = EDGE_LABEL_BORDER_WIDTH;
  ctx.strokeStyle = EDGE_LABEL_BORDER;
  ctx.stroke();
  ctx.fillStyle = EDGE_LABEL_INK;
  ctx.fillText(text, centerX, centerY);
};

// ── Direction-arrow sprite ───────────────────────────────────────────────────

/** Resolution (px) the arrow triangle sprite is rasterised at. */
const ARROW_ICON_TEXTURE = 64;
/** The arrow triangle's side length as a fraction of the sprite's square size. */
const ARROW_TRIANGLE_SIDE_FRACTION = 0.8;
/**
 * The arrow sprite's rendered tip→base length as a fraction of its `getSize` (which
 * scales the square sprite). Equals the equilateral triangle's height (`side · √3/2`)
 * over the sprite size — see {@link arrowIconAtlas}. Lets a highlighted edge be trimmed
 * to end at the arrowhead's base rather than run under it to the tip.
 */
export const ARROW_HEAD_LENGTH_RATIO =
  (ARROW_TRIANGLE_SIDE_FRACTION * Math.sqrt(3)) / 2;

/** A tintable arrow sprite atlas: a data-URL plus its single-icon mapping. */
export type ArrowIconAtlas = {
  url: string;
  mapping: DetailIconAtlas["mapping"];
};

let arrowIconAtlasCache: ArrowIconAtlas | null = null;

/**
 * A solid-triangle sprite (white mask, tinted via the layer's `getColor`) pointing
 * along +x, anchored at its tip so a per-arrow pixel offset places the tip exactly.
 * Rasterised once and cached; `null` outside the browser.
 */
export const arrowIconAtlas = (): ArrowIconAtlas | null => {
  if (arrowIconAtlasCache) {
    return arrowIconAtlasCache;
  }
  if (typeof document === "undefined") {
    return null;
  }
  const size = ARROW_ICON_TEXTURE;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return null;
  }
  // Equilateral triangle pointing along +x, height `side · √3/2`, centred in the canvas.
  const side = size * ARROW_TRIANGLE_SIDE_FRACTION;
  const height = (side * Math.sqrt(3)) / 2;
  const tipX = (size + height) / 2;
  const baseX = (size - height) / 2;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(tipX, size / 2);
  ctx.lineTo(baseX, size / 2 - side / 2);
  ctx.lineTo(baseX, size / 2 + side / 2);
  ctx.closePath();
  ctx.fill();
  arrowIconAtlasCache = {
    url: canvas.toDataURL(),
    mapping: {
      arrow: {
        x: 0,
        y: 0,
        width: size,
        height: size,
        // Anchor at the tip so `getPosition` + `getPixelOffset` place the tip.
        anchorX: tipX,
        anchorY: size / 2,
        mask: true,
      },
    },
  };
  return arrowIconAtlasCache;
};
