/**
 * Colours derived from a token type's display colour, and the colours used
 * where a type carries none.
 *
 * Nodes and arcs that carry a type's colour take their values from here, so
 * that the derivations for related roles sit together.
 */

import { hexToHsl } from "../../../lib/hsl-color";

const UNTYPED_PLACE_FILL = "var(--colors-neutral-s10)";
const UNTYPED_MINI_MAP_PLACE_FILL = "#0F0F0F";
const UNTYPED_ARC_STROKE = "#777";

export const placeBorderColor = (
  typeColor: string | undefined,
): string | undefined =>
  typeColor ? hexToHsl(typeColor).lighten(-10).saturate(-30).css(1) : undefined;

export const placeFillColor = (typeColor: string | undefined): string =>
  typeColor ? hexToHsl(typeColor).lighten(30).css(1) : UNTYPED_PLACE_FILL;

export const miniMapPlaceFillColor = (typeColor: string | undefined): string =>
  typeColor
    ? hexToHsl(typeColor).saturation(50).css(1)
    : UNTYPED_MINI_MAP_PLACE_FILL;

export const arcStrokeColor = (typeColor: string | undefined): string =>
  typeColor
    ? hexToHsl(typeColor).lighten(-15).saturate(-30).css(1)
    : UNTYPED_ARC_STROKE;
