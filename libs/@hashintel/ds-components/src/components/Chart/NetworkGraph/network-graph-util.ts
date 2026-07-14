import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { Icon } from "../../Icon/icon";

import type { IconName } from "../../Icon/icon";

export interface NetworkGraphPoint {
  id: number;
  x: number;
  y: number;
  /** CSS hex colour (e.g. `#FF8C26`) used for the node. */
  color: string;
  label?: string;
  /** Rendered inside the node in the zoomed-in detail variation; should map to an icon-name in ds-components. */
  icon?: IconName;
}

export interface NetworkGraphEdge {
  id: number;
  fromId: number;
  toId: number;
}

export interface HoverLine {
  source: [number, number];
  target: [number, number];
}

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
 * A rasterisable SVG data URL for an icon, forced to a fixed size and a solid
 * fill so the `DetailedNodeLayer`'s icons can use it as a tintable mask. Reuses
 * the {@link Icon} registry (via static markup) so it stays in sync, and is
 * cached per icon name. Runs only in the browser (called from an effect).
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
