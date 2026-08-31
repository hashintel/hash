/**
 * Turning a frame's bins into a pixel raster: the geometry and axis labels
 * behind the frame popover's histogram, kept pure so they can be tested
 * without a canvas.
 *
 * A frame carries `[value, frequency]` pairs — thousands of them for an
 * exact-binned metric — and the popover has a few hundred pixels. Rather
 * than one DOM row per bin (a scrolling list that showed a dozen bins at a
 * time), the bins are laid out as adjacent rectangles spanning the plot: a
 * bin wider than a pixel becomes a rectangle that wide, and bins narrower
 * than a pixel merge into one column holding all of their samples. Every
 * column touches its neighbours, so the raster has no gaps and every sample
 * is somewhere in it.
 *
 * Bars are drawn at each column's samples-per-bin rather than its raw sum,
 * because merging is not uniform: at 854 bins over 300 pixels most columns
 * take three bins and some take two, and summing turns that remainder into
 * spikes that are not in the data. Dividing by the bins merged removes them,
 * and where nothing merges — the common case — it changes nothing, since the
 * column is one bin and the height is that bin's own count.
 */

/** One drawn rectangle: a pixel span and the samples that fall in it. */
export type HistogramColumn = {
  /** Left edge in plot pixels, inclusive. */
  left: number;
  /** Right edge in plot pixels, exclusive; always greater than `left`. */
  right: number;
  /** Summed frequency of every bin merged into this column. */
  count: number;
  /** How many bins merged here; 1 when the column has a pixel to itself. */
  binCount: number;
  /** Lowest bin value in the column. */
  valueFrom: number;
  /** Highest bin value in the column. */
  valueTo: number;
};

export type HistogramRaster = {
  columns: HistogramColumn[];
  /**
   * The tallest column's samples-per-bin (`count / binCount`), which is the
   * y axis's top — and equals the largest bin frequency whenever no bins
   * merged.
   */
  maxDensity: number;
  /** Plot-space value domain: the outer edges of the first and last bins. */
  domainMin: number;
  domainMax: number;
};

const EMPTY_RASTER: HistogramRaster = {
  columns: [],
  maxDensity: 0,
  domainMin: 0,
  domainMax: 1,
};

/** What a column's bar shows: its samples spread over the bins it merged. */
export function columnDensity(column: HistogramColumn): number {
  return column.count / column.binCount;
}

/**
 * The width one bin occupies: the smallest gap between neighbouring values.
 *
 * Uniformly binned frames give their stride, exact-binned integer counts give
 * 1, and a single bin has no gap to measure, so it falls back to 1 — a bin of
 * unknown width drawn one unit wide rather than zero.
 */
function binStep(values: readonly number[]): number {
  let step = Number.POSITIVE_INFINITY;
  for (let index = 1; index < values.length; index++) {
    const gap = values[index]! - values[index - 1]!;
    if (gap > 0 && gap < step) {
      step = gap;
    }
  }
  return Number.isFinite(step) ? step : 1;
}

export function rasterizeBins(
  bins: readonly (readonly [number, number])[],
  plotWidth: number,
): HistogramRaster {
  if (bins.length === 0 || plotWidth < 1) {
    return EMPTY_RASTER;
  }

  const sorted = [...bins].sort((left, right) => left[0] - right[0]);
  const step = binStep(sorted.map(([value]) => value));
  const domainMin = sorted[0]![0] - step / 2;
  const domainMax = sorted.at(-1)![0] + step / 2;
  const span = domainMax - domainMin;

  const columns: HistogramColumn[] = [];
  for (const [value, frequency] of sorted) {
    const previous = columns.at(-1);
    const edge = Math.round(
      ((value + step / 2 - domainMin) / span) * plotWidth,
    );
    // Narrower than the pixel already covered (or past the last one): merge,
    // which widens the bin rather than dropping it.
    if (previous && (edge <= previous.right || previous.right >= plotWidth)) {
      previous.count += frequency;
      previous.binCount += 1;
      previous.valueTo = value;
      continue;
    }
    const left = previous?.right ?? 0;
    columns.push({
      left,
      right: Math.min(plotWidth, Math.max(edge, left + 1)),
      count: frequency,
      binCount: 1,
      valueFrom: value,
      valueTo: value,
    });
  }

  return {
    columns,
    maxDensity: columns.reduce(
      (max, column) => Math.max(max, columnDensity(column)),
      0,
    ),
    domainMin,
    domainMax,
  };
}

/**
 * Round tick values covering `[min, max]`, at a 1/2/5×10ⁿ step chosen so the
 * axis carries about `target` of them. Ticks land on readable numbers rather
 * than on the data's own extremes.
 *
 * `minStep` raises the floor: a count axis topping out at 1 should read 0
 * and 1, not 0, 0.5 and 1 — half a sample is not a thing to label.
 */
export function niceAxisTicks(
  min: number,
  max: number,
  target = 4,
  minStep = 0,
): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return [min];
  }

  const rawStep = (max - min) / Math.max(1, target);
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  // Rounded at the midpoints between 1, 2, 5 and 10 rather than at their
  // upper bounds: a raw step of 5.1 wants a step of 5 (one tick more than
  // asked for), not 10 (nearly half as many as asked for).
  const stepMultiple =
    normalized <= 1.5 ? 1 : normalized <= 3 ? 2 : normalized <= 7 ? 5 : 10;
  const step = Math.max(minStep, stepMultiple * magnitude);

  const ticks: number[] = [];
  const first = Math.ceil(min / step) * step;
  // The epsilon keeps a tick that lands exactly on `max` from falling out to
  // floating-point drift.
  for (let tick = first; tick <= max + step * 1e-9; tick += step) {
    ticks.push(Number(tick.toPrecision(12)));
  }
  return ticks;
}

/**
 * An axis tick as a short label: counts in the thousands and millions get a
 * suffix, since the popover's gutters are a few characters wide.
 */
export function formatAxisTick(value: number): string {
  const magnitude = Math.abs(value);
  if (magnitude >= 1_000_000) {
    return `${Number((value / 1_000_000).toPrecision(3))}M`;
  }
  if (magnitude >= 10_000) {
    return `${Number((value / 1_000).toPrecision(3))}k`;
  }
  return String(Number(value.toPrecision(6)));
}
