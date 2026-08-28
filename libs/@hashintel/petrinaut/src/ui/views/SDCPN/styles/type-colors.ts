/**
 * Colours derived from a token type's display colour.
 *
 * Nodes and arcs that carry a type's colour take their values from here, so
 * that the derivations for related roles sit together.
 */

import { hexToHsl } from "../../../lib/hsl-color";

export const placeBorderColor = (typeColor: string): string =>
  hexToHsl(typeColor).lighten(-10).saturate(-30).css(1);

export const classicPlaceFillColor = (typeColor: string): string =>
  hexToHsl(typeColor).lightness(85).css(1);

export const compactPlaceFillColor = (typeColor: string): string =>
  hexToHsl(typeColor).lightness(80).css(1);

export const miniMapPlaceFillColor = (typeColor: string): string =>
  hexToHsl(typeColor).saturation(50).css(1);

export const arcStrokeColor = (typeColor: string): string =>
  hexToHsl(typeColor).lighten(-15).saturate(-30).css(1);
