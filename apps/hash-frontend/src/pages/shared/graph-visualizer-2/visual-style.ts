import type { Color } from "./frames";

export const graphCanvasBackground = "#F7FAFC";

/**
 * Named graph mark colours. These are presentation semantics, not a generic palette:
 * - frontier / fallback recede behind query-root entities,
 * - grouping marks stay translucent so topology remains legible,
 * - selection is the only saturated product-blue state,
 * - edge support colours are neutral so typed edge hues carry the data.
 */
export const graphColors = {
  frontier: [116, 130, 148, 150],
  frontierHalo: [72, 136, 216, 92],
  fallbackEntity: [126, 142, 160, 220],
  collapsedEdge: [112, 126, 143, 180],
  fanOutEdge: [128, 142, 158, 88],
  selection: [7, 117, 227, 255],
  selectionHalo: [72, 179, 244, 44],
  clusterStroke: [255, 255, 255, 58],
  edgeUnderlay: [255, 255, 255, 76],
  edgeLabelText: [55, 67, 79, 255],
  edgeLabelBackground: [255, 255, 255, 230],
} as const satisfies Record<string, Color | readonly [number, number, number]>;

/** Compact HSL to RGB conversion for deterministic graph palettes. */
export function hslToRgb(
  hue: number,
  saturation: number,
  lightness: number,
): [number, number, number] {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const sextant = hue / 60;
  const second = chroma * (1 - Math.abs((sextant % 2) - 1));
  const match = lightness - chroma / 2;

  let red = 0;
  let green = 0;
  let blue = 0;
  if (sextant < 1) {
    red = chroma;
    green = second;
  } else if (sextant < 2) {
    red = second;
    green = chroma;
  } else if (sextant < 3) {
    green = chroma;
    blue = second;
  } else if (sextant < 4) {
    green = second;
    blue = chroma;
  } else if (sextant < 5) {
    red = second;
    blue = chroma;
  } else {
    red = chroma;
    blue = second;
  }

  return [
    Math.round((red + match) * 255),
    Math.round((green + match) * 255),
    Math.round((blue + match) * 255),
  ];
}

export function colorWithAlpha(
  color: readonly [number, number, number],
  alpha: number,
): Color {
  return [color[0], color[1], color[2], alpha];
}

/** Community hulls are looser than hierarchy bubbles, so they use lower saturation/alpha. */
export function communityColorForId(id: number): Color {
  const hue = ((id * 0.618033988749895) % 1) * 360;
  return colorWithAlpha(hslToRgb(hue, 0.34, 0.66), 38);
}
