/**
 * Colours derived from a token type's display colour.
 *
 * Nodes and arcs that carry a type's colour take their values from here, so
 * that the derivations for related roles sit together, along with the colours
 * used when a node or arc has no type colour to derive from.
 */

import { hexToHsl } from "../../../lib/hsl-color";

/** Fill for a place with no type colour. */
const UNTYPED_PLACE_FILL = "#FFFFFF";

/** Mini-map fill for a place with no type colour. */
const UNTYPED_MINI_MAP_PLACE_FILL = "#0F0F0F";

/** Stroke for an arc whose endpoint has no type colour. */
const UNTYPED_ARC_STROKE = "#777";

/** How much lighter than the type colour a place fill is. */
const PLACE_FILL_LIGHTEN = 30;

/**
 * Ceiling on a place fill's lightness.
 *
 * The palette's lighter hues sit above 55% lightness, so lightening them by
 * {@link PLACE_FILL_LIGHTEN} takes them close enough to white that the fill
 * reads as untyped. Capping keeps them distinguishable while leaving the
 * darker hues at the lightness the delta alone gives them.
 */
const PLACE_FILL_MAX_LIGHTNESS = 85;

export const placeBorderColor = (
  typeColor: string | undefined,
): string | undefined =>
  typeColor ? hexToHsl(typeColor).lighten(-10).saturate(-30).css(1) : undefined;

export const placeFillColor = (typeColor: string | undefined): string => {
  if (!typeColor) {
    return UNTYPED_PLACE_FILL;
  }

  const typeHsl = hexToHsl(typeColor);

  return typeHsl
    .lightness(
      Math.min(typeHsl.l + PLACE_FILL_LIGHTEN, PLACE_FILL_MAX_LIGHTNESS),
    )
    .css(1);
};

export const miniMapPlaceFillColor = (typeColor: string | undefined): string =>
  typeColor
    ? hexToHsl(typeColor).saturation(50).css(1)
    : UNTYPED_MINI_MAP_PLACE_FILL;

export const arcStrokeColor = (typeColor: string | undefined): string =>
  typeColor
    ? hexToHsl(typeColor).lighten(-15).saturate(-30).css(1)
    : UNTYPED_ARC_STROKE;
