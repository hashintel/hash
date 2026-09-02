/**
 * Colour ramps as 256-entry RGBA lookup tables, and the one loop that turns
 * a normalized value grid into pixels through such a table.
 */

/** `[position in 0..1, r, g, b]`; positions ascend and span 0 to 1. */
export type RampStop = readonly [number, number, number, number];

/** Matplotlib's magma, subsampled; 0 is lightest, 1 darkest. */
export const MAGMA_STOPS: readonly RampStop[] = [
  [0, 252, 253, 191],
  [0.25, 254, 159, 109],
  [0.5, 222, 73, 104],
  [0.75, 129, 37, 129],
  [1, 11, 9, 36],
];

/** ColorBrewer Blues, the ramp Optuna draws contour surfaces with. */
export const BLUES_STOPS: readonly RampStop[] = [
  [0, 247, 251, 255],
  [0.25, 198, 219, 239],
  [0.5, 107, 174, 214],
  [0.75, 33, 113, 181],
  [1, 8, 48, 107],
];

/**
 * A 256-entry RGBA table over `stops`, alpha from `alphaAt(position)`
 * (opaque by default).
 */
export function rampLut(
  stops: readonly RampStop[],
  alphaAt: (position: number) => number = () => 1,
): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256 * 4);
  for (let index = 0; index < 256; index++) {
    const position = index / 255;
    let low = stops[0]!;
    let high = stops.at(-1)!;
    for (let stop = 0; stop < stops.length - 1; stop++) {
      if (position >= stops[stop]![0] && position <= stops[stop + 1]![0]) {
        low = stops[stop]!;
        high = stops[stop + 1]!;
        break;
      }
    }
    const span = high[0] - low[0];
    const mix = span === 0 ? 0 : (position - low[0]) / span;
    lut[index * 4] = Math.round(low[1] + (high[1] - low[1]) * mix);
    lut[index * 4 + 1] = Math.round(low[2] + (high[2] - low[2]) * mix);
    lut[index * 4 + 2] = Math.round(low[3] + (high[3] - low[3]) * mix);
    lut[index * 4 + 3] = Math.round(
      Math.min(1, Math.max(0, alphaAt(position))) * 255,
    );
  }
  return lut;
}

export type RasterLayout = {
  columns: number;
  rows: number;
  /** Row stride of `values` when wider than `columns`; defaults to `columns`. */
  sourceStride?: number;
  /** Put value row 0 at the bottom of the image. */
  flipY?: boolean;
};

/**
 * One RGBA pixel per cell, each value scaled from `range` onto the table.
 * Values are read row-major from `values` with the layout's stride; a
 * degenerate range paints every cell at the table's middle.
 */
export function rasterizeNormalized(
  values: ArrayLike<number>,
  layout: RasterLayout,
  lut: Uint8ClampedArray,
  range: { min: number; max: number } = { min: 0, max: 1 },
): Uint8ClampedArray<ArrayBuffer> {
  const { columns, rows, flipY = false } = layout;
  const stride = layout.sourceStride ?? columns;
  const span = range.max - range.min;
  const pixels = new Uint8ClampedArray(columns * rows * 4);
  for (let row = 0; row < rows; row++) {
    const imageRow = flipY ? rows - 1 - row : row;
    for (let column = 0; column < columns; column++) {
      const value = values[row * stride + column]!;
      const position = span > 0 ? (value - range.min) / span : 0.5;
      const entry = Math.min(255, Math.max(0, Math.round(position * 255))) * 4;
      const out = (imageRow * columns + column) * 4;
      pixels[out] = lut[entry]!;
      pixels[out + 1] = lut[entry + 1]!;
      pixels[out + 2] = lut[entry + 2]!;
      pixels[out + 3] = lut[entry + 3]!;
    }
  }
  return pixels;
}
