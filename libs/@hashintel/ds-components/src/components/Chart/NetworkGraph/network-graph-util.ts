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

/** RGB stroke colour shared by every edge (0–255). */
export const EDGE_COLOR: [number, number, number] = [80, 88, 110];
/** On-screen width (px) of an edge, and its floor as it scales with zoom. */
export const EDGE_WIDTH = 0.75;
export const EDGE_MIN_WIDTH = 0.5;
/**
 * Width (px) of a hovered edge and of the outline on its two nodes; a multiple
 * of {@link EDGE_WIDTH} so it stands out from surrounding edges.
 */
export const EDGE_HOVER_WIDTH = EDGE_WIDTH * 3;

/** Parse a `#RRGGBB` string into a deck.gl `[r, g, b]` colour. */
export const hexToRgb = (hex: string): [number, number, number] => {
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
