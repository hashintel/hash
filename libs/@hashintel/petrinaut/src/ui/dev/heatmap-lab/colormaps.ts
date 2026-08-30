/**
 * Colormap lookup tables for the heatmap lab: 256 RGBA entries mapping a
 * [0, 1] density to a pixel. Alpha ramps from 0 at density 0 so the chart
 * grid stays visible under sparse regions.
 */

export type ColormapId = "ink" | "blues" | "magma";

export const COLORMAP_IDS: readonly ColormapId[] = ["ink", "blues", "magma"];

type Stop = readonly [position: number, r: number, g: number, b: number];

/** The timeline's current look: one hue, density carried by alpha alone. */
const INK: readonly Stop[] = [
  [0, 17, 24, 39],
  [1, 17, 24, 39],
];

/** ColorBrewer-style blues, matching the contour surface's ramp. */
const BLUES: readonly Stop[] = [
  [0, 247, 251, 255],
  [0.25, 158, 202, 225],
  [0.5, 66, 146, 198],
  [0.75, 8, 81, 156],
  [1, 8, 48, 107],
];

/** Perceptually uniform, matplotlib's magma (subsampled stops). */
const MAGMA: readonly Stop[] = [
  [0, 252, 253, 191],
  [0.25, 254, 159, 109],
  [0.5, 222, 73, 104],
  [0.75, 129, 37, 129],
  [1, 11, 9, 36],
];

function interpolateStops(
  stops: readonly Stop[],
  position: number,
): [number, number, number] {
  let low = stops[0]!;
  let high = stops.at(-1)!;
  for (let index = 0; index < stops.length - 1; index++) {
    if (position >= stops[index]![0] && position <= stops[index + 1]![0]) {
      low = stops[index]!;
      high = stops[index + 1]!;
      break;
    }
  }
  const spanWidth = high[0] - low[0];
  const mix = spanWidth === 0 ? 0 : (position - low[0]) / spanWidth;
  return [
    Math.round(low[1] + (high[1] - low[1]) * mix),
    Math.round(low[2] + (high[2] - low[2]) * mix),
    Math.round(low[3] + (high[3] - low[3]) * mix),
  ];
}

/**
 * A 256-entry RGBA lookup table for `id`. The ink map carries density in
 * alpha over one color; the color maps carry it in color with a short
 * alpha ramp-in so zero density stays transparent.
 */
export function colormapLut(id: ColormapId): Uint8ClampedArray {
  const stops = id === "ink" ? INK : id === "blues" ? BLUES : MAGMA;
  const lut = new Uint8ClampedArray(256 * 4);
  for (let index = 0; index < 256; index++) {
    const position = index / 255;
    const [r, g, b] = interpolateStops(stops, position);
    lut[index * 4] = r;
    lut[index * 4 + 1] = g;
    lut[index * 4 + 2] = b;
    lut[index * 4 + 3] =
      id === "ink"
        ? Math.round(position * 255)
        : index === 0
          ? 0
          : Math.round(Math.min(1, 0.15 + position * 0.85) * 255);
  }
  return lut;
}
