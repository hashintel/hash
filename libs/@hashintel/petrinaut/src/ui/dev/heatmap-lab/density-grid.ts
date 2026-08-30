/**
 * Pure density-grid pipeline for the heatmap lab: per-time histograms in,
 * a normalized `rows × columns` grid of [0, 1] densities out.
 *
 * The pipeline has four independent stages, each a lab knob:
 *
 * 1. Rasterize — spread each histogram bin's count over the grid rows that
 *    cover its value (linear splat between the two nearest rows).
 * 2. Smooth — an optional Gaussian blur along the VALUE axis only. Columns
 *    are independent distributions, so blurring across time would invent
 *    correlations the data does not have.
 * 3. Transform — reshape counts before normalizing: `sqrt` and `log`
 *    compress heavy tails, `equalize` (histogram equalization) spends the
 *    whole ramp on the values that occur.
 * 4. Normalize — against each column's own maximum (every column readable,
 *    columns not comparable) or the global maximum (comparable, sparse
 *    columns fade).
 */

export type DistributionColumn = {
  time: number;
  /** `[value, count]` pairs, ascending by value. */
  bins: readonly (readonly [number, number])[];
};

export type DensityTransform = "linear" | "sqrt" | "log" | "equalize";
export type DensityNormalization = "column" | "global";

export type DensityGridOptions = {
  /** Grid rows along the value axis. */
  rows: number;
  transform: DensityTransform;
  normalization: DensityNormalization;
  /** Gaussian sigma along the value axis, in rows. 0 disables smoothing. */
  smoothingSigma: number;
};

export type DensityGrid = {
  columns: number;
  rows: number;
  /** Row-major `[row * columns + column]`; row 0 is `valueMin` (bottom). */
  densities: Float32Array;
  valueMin: number;
  valueMax: number;
};

/** The value range covered by any column's bins, padded to a span of ≥ 1. */
function valueRange(columns: readonly DistributionColumn[]): [number, number] {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const column of columns) {
    for (const [value] of column.bins) {
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
  }
  if (!Number.isFinite(min)) {
    return [0, 1];
  }
  return min === max ? [min - 0.5, max + 0.5] : [min, max];
}

/** One-dimensional Gaussian kernel, normalized to sum 1. */
function gaussianKernel(sigma: number): Float32Array {
  const radius = Math.max(1, Math.ceil(sigma * 3));
  const kernel = new Float32Array(radius * 2 + 1);
  let sum = 0;
  for (let offset = -radius; offset <= radius; offset++) {
    const weight = Math.exp(-(offset * offset) / (2 * sigma * sigma));
    kernel[offset + radius] = weight;
    sum += weight;
  }
  for (let index = 0; index < kernel.length; index++) {
    kernel[index]! /= sum;
  }
  return kernel;
}

/** Blur each column along the value axis; counts stay counts (kernel sums to 1). */
function blurColumns(
  counts: Float32Array<ArrayBuffer>,
  columns: number,
  rows: number,
  sigma: number,
): Float32Array<ArrayBuffer> {
  const kernel = gaussianKernel(sigma);
  const radius = (kernel.length - 1) / 2;
  const blurred = new Float32Array(counts.length);
  for (let column = 0; column < columns; column++) {
    for (let row = 0; row < rows; row++) {
      let sum = 0;
      for (let tap = -radius; tap <= radius; tap++) {
        const sourceRow = row + tap;
        if (sourceRow < 0 || sourceRow >= rows) {
          continue;
        }
        sum += counts[sourceRow * columns + column]! * kernel[tap + radius]!;
      }
      blurred[row * columns + column] = sum;
    }
  }
  return blurred;
}

/**
 * Histogram equalization over the non-zero counts: each count maps to its
 * quantile, so the ramp is spent evenly on the densities that occur.
 */
function equalize(
  counts: Float32Array<ArrayBuffer>,
): Float32Array<ArrayBuffer> {
  const nonZero: number[] = [];
  for (const count of counts) {
    if (count > 0) {
      nonZero.push(count);
    }
  }
  if (nonZero.length === 0) {
    return new Float32Array(counts.length);
  }
  nonZero.sort((left, right) => left - right);
  const ranks = new Map<number, number>();
  for (let index = 0; index < nonZero.length; index++) {
    // Equal counts share the highest rank, keeping the map monotonic.
    ranks.set(nonZero[index]!, (index + 1) / nonZero.length);
  }
  const out = new Float32Array(counts.length);
  for (let index = 0; index < counts.length; index++) {
    const count = counts[index]!;
    out[index] = count > 0 ? ranks.get(count)! : 0;
  }
  return out;
}

export function buildDensityGrid(
  distributionColumns: readonly DistributionColumn[],
  options: DensityGridOptions,
): DensityGrid {
  const { rows, transform, normalization, smoothingSigma } = options;
  const columns = distributionColumns.length;
  const [valueMin, valueMax] = valueRange(distributionColumns);
  const span = valueMax - valueMin;
  let counts = new Float32Array(rows * columns);

  for (let column = 0; column < columns; column++) {
    for (const [value, count] of distributionColumns[column]!.bins) {
      const position = ((value - valueMin) / span) * (rows - 1);
      const lowRow = Math.floor(position);
      const highRow = Math.min(lowRow + 1, rows - 1);
      const highWeight = position - lowRow;
      counts[lowRow * columns + column]! += count * (1 - highWeight);
      counts[highRow * columns + column]! += count * highWeight;
    }
  }

  if (smoothingSigma > 0) {
    counts = blurColumns(counts, columns, rows, smoothingSigma);
  }

  if (transform === "equalize") {
    // Equalization outputs quantiles in (0, 1]; normalization scope no
    // longer applies (the quantile is already global).
    return {
      columns,
      rows,
      densities: equalize(counts),
      valueMin,
      valueMax,
    };
  }

  const shaped = new Float32Array(counts.length);
  for (let index = 0; index < counts.length; index++) {
    const count = counts[index]!;
    shaped[index] =
      transform === "sqrt"
        ? Math.sqrt(count)
        : transform === "log"
          ? Math.log1p(count)
          : count;
  }

  const densities = new Float32Array(shaped.length);
  if (normalization === "global") {
    let max = 0;
    for (const value of shaped) {
      max = Math.max(max, value);
    }
    if (max > 0) {
      for (let index = 0; index < shaped.length; index++) {
        densities[index] = shaped[index]! / max;
      }
    }
  } else {
    for (let column = 0; column < columns; column++) {
      let max = 0;
      for (let row = 0; row < rows; row++) {
        max = Math.max(max, shaped[row * columns + column]!);
      }
      if (max > 0) {
        for (let row = 0; row < rows; row++) {
          const index = row * columns + column;
          densities[index] = shaped[index]! / max;
        }
      }
    }
  }

  return { columns, rows, densities, valueMin, valueMax };
}
