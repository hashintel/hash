/**
 * Pure math behind the sweep surface view: turning sparse sampled grid cells
 * into a filled contour picture, Optuna-style.
 *
 * The surface fills progressively — one sampled combination at a time — so
 * the interpolator must produce something sensible at every stage: inverse
 * distance weighting over the sampled points gives smooth blobs around the
 * first few samples that converge to the true surface as the grid fills.
 * Iso-lines come from marching squares over the interpolated raster.
 */
import type { MonteCarloUserDefinedMetricFrame } from "@hashintel/petrinaut-core";

/** One sampled combination, in grid-index space. */
export type ContourSample = {
  /** Column index on the X axis. */
  x: number;
  /** Row index on the Y axis. */
  y: number;
  value: number;
};

/**
 * The order to sample an `nx × ny` grid: corners and midpoints of ever finer
 * subdivisions before their neighbours, so the surface's coarse shape appears
 * after a handful of cells instead of filling row by row.
 *
 * Cells are ranked by the finest power-of-two lattice they sit on (a
 * bit-interleaved refinement depth), ties broken row-major.
 */
export function coarseToFineOrder(
  nx: number,
  ny: number,
): { x: number; y: number }[] {
  const depthOf = (index: number, count: number): number => {
    if (count <= 1 || index === 0 || index === count - 1) {
      return 0;
    }
    // The finest subdivision level at which `index / (count - 1)` is a lattice
    // point: level d has lattice spacing (count - 1) / 2^d.
    for (let depth = 1; depth <= 30; depth++) {
      const spacing = (count - 1) / 2 ** depth;
      if (spacing < 1) {
        return depth;
      }
      if (Number.isInteger(index / spacing)) {
        return depth;
      }
    }
    return 30;
  };

  const cells: { x: number; y: number; rank: number }[] = [];
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      cells.push({ x, y, rank: Math.max(depthOf(x, nx), depthOf(y, ny)) });
    }
  }

  return cells
    .sort((left, right) => left.rank - right.rank)
    .map(({ x, y }) => ({ x, y }));
}

/**
 * Interpolates the sampled points onto a `width × height` raster spanning the
 * grid's index space, by inverse distance weighting (power 2).
 *
 * A raster point sitting exactly on a sample takes its value; with a single
 * sample the whole raster is flat at that value, which is the honest picture
 * of one data point.
 */
export function idwRaster(options: {
  samples: readonly ContourSample[];
  /** Grid extent in index space: samples lie in [0, nx-1] × [0, ny-1]. */
  nx: number;
  ny: number;
  width: number;
  height: number;
}): Float64Array {
  const { samples, nx, ny, width, height } = options;
  const raster = new Float64Array(width * height);
  if (samples.length === 0) {
    return raster;
  }

  for (let py = 0; py < height; py++) {
    // Raster rows run top-to-bottom; grid rows bottom-to-top (y up).
    const gy = ((height - 1 - py) / Math.max(height - 1, 1)) * (ny - 1);
    for (let px = 0; px < width; px++) {
      const gx = (px / Math.max(width - 1, 1)) * (nx - 1);

      let weightSum = 0;
      let valueSum = 0;
      let exact: number | null = null;
      for (const sample of samples) {
        const distanceSquared =
          (sample.x - gx) * (sample.x - gx) + (sample.y - gy) * (sample.y - gy);
        if (distanceSquared < 1e-9) {
          exact = sample.value;
          break;
        }
        const weight = 1 / distanceSquared;
        weightSum += weight;
        valueSum += weight * sample.value;
      }

      raster[py * width + px] = exact ?? valueSum / weightSum;
    }
  }

  return raster;
}

/**
 * Incremental inverse-distance weighting over a growing sample list.
 *
 * The surface streams one sampled combination at a time and repaints per
 * sample; recomputing the whole raster is O(raster × samples), which grows
 * quadratically over a walk (~48M distance evaluations for a full 11×11
 * grid). Folding only the new samples into persistent weight and value
 * sums makes each repaint O(raster × new samples) — ~0.8M for the same
 * walk — with results identical to `idwRaster`.
 *
 * `update` expects the previous call's samples to be a prefix of the next
 * call's (the walk only appends); anything else folds from scratch.
 */
export type IdwAccumulator = {
  update(samples: readonly ContourSample[]): Float64Array;
  /** Increments whenever `update` changes the raster; a cache key. */
  readonly version: number;
};

export function createIdwAccumulator(options: {
  nx: number;
  ny: number;
  width: number;
  height: number;
}): IdwAccumulator {
  const { nx, ny, width, height } = options;
  const weightSum = new Float64Array(width * height);
  const valueSum = new Float64Array(width * height);
  const exact = new Float64Array(width * height);
  const hasExact = new Uint8Array(width * height);
  const raster = new Float64Array(width * height);
  let folded: ContourSample[] = [];
  let version = 0;

  const reset = () => {
    weightSum.fill(0);
    valueSum.fill(0);
    exact.fill(0);
    hasExact.fill(0);
    folded = [];
  };

  const fold = (sample: ContourSample) => {
    for (let py = 0; py < height; py++) {
      // Raster rows run top-to-bottom; grid rows bottom-to-top (y up).
      const gy = ((height - 1 - py) / Math.max(height - 1, 1)) * (ny - 1);
      const dy = (sample.y - gy) * (sample.y - gy);
      for (let px = 0; px < width; px++) {
        const gx = (px / Math.max(width - 1, 1)) * (nx - 1);
        const distanceSquared = (sample.x - gx) * (sample.x - gx) + dy;
        const index = py * width + px;
        if (distanceSquared < 1e-9) {
          exact[index] = sample.value;
          hasExact[index] = 1;
        } else {
          const weight = 1 / distanceSquared;
          weightSum[index]! += weight;
          valueSum[index]! += weight * sample.value;
        }
      }
    }
    folded.push(sample);
  };

  const isPrefix = (samples: readonly ContourSample[]): boolean => {
    if (samples.length < folded.length) {
      return false;
    }
    for (let index = 0; index < folded.length; index++) {
      const previous = folded[index]!;
      const next = samples[index]!;
      if (
        previous.x !== next.x ||
        previous.y !== next.y ||
        previous.value !== next.value
      ) {
        return false;
      }
    }
    return true;
  };

  return {
    get version() {
      return version;
    },
    update(samples) {
      if (!isPrefix(samples)) {
        reset();
      }
      const firstNew = folded.length;
      for (let index = firstNew; index < samples.length; index++) {
        fold(samples[index]!);
      }
      if (samples.length !== firstNew || version === 0) {
        version += 1;
        for (let index = 0; index < raster.length; index++) {
          raster[index] = hasExact[index]
            ? exact[index]!
            : weightSum[index]! > 0
              ? valueSum[index]! / weightSum[index]!
              : 0;
        }
      }
      return raster;
    },
  };
}

/**
 * Marching squares: the iso-lines of `raster` at `level`, as polyline segments
 * in raster pixel coordinates. Segments rather than joined paths — the canvas
 * strokes them identically and joining buys nothing here.
 */
export function marchingSquaresSegments(
  raster: Float64Array,
  width: number,
  height: number,
  level: number,
): [number, number, number, number][] {
  const segments: [number, number, number, number][] = [];
  const at = (x: number, y: number): number => raster[y * width + x]!;
  /** Where `level` sits between two corner values, clamped to the edge. */
  const t = (a: number, b: number): number =>
    a === b ? 0.5 : Math.min(1, Math.max(0, (level - a) / (b - a)));

  for (let y = 0; y < height - 1; y++) {
    for (let x = 0; x < width - 1; x++) {
      const topLeft = at(x, y);
      const topRight = at(x + 1, y);
      const bottomRight = at(x + 1, y + 1);
      const bottomLeft = at(x, y + 1);

      const caseIndex =
        (topLeft >= level ? 8 : 0) +
        (topRight >= level ? 4 : 0) +
        (bottomRight >= level ? 2 : 0) +
        (bottomLeft >= level ? 1 : 0);
      if (caseIndex === 0 || caseIndex === 15) {
        continue;
      }

      // Edge midpoints, interpolated to where the level crosses.
      const top: [number, number] = [x + t(topLeft, topRight), y];
      const right: [number, number] = [x + 1, y + t(topRight, bottomRight)];
      const bottom: [number, number] = [x + t(bottomLeft, bottomRight), y + 1];
      const left: [number, number] = [x, y + t(topLeft, bottomLeft)];

      const push = (a: [number, number], b: [number, number]) => {
        segments.push([a[0], a[1], b[0], b[1]]);
      };

      switch (caseIndex) {
        case 1:
        case 14:
          push(left, bottom);
          break;
        case 2:
        case 13:
          push(bottom, right);
          break;
        case 3:
        case 12:
          push(left, right);
          break;
        case 4:
        case 11:
          push(top, right);
          break;
        case 6:
        case 9:
          push(top, bottom);
          break;
        case 7:
        case 8:
          push(left, top);
          break;
        // The two saddles: resolve by the cell-centre average, matching the
        // corner majority so lines never cross.
        case 5:
        case 10: {
          const centreHigh =
            (topLeft + topRight + bottomRight + bottomLeft) / 4 >= level;
          const flipped = (caseIndex === 5) === centreHigh;
          if (flipped) {
            push(left, top);
            push(bottom, right);
          } else {
            push(left, bottom);
            push(top, right);
          }
          break;
        }
        default:
          break;
      }
    }
  }

  return segments;
}

/** `count` evenly spaced levels strictly inside [min, max]. */
export function contourLevels(
  min: number,
  max: number,
  count: number,
): number[] {
  if (!(max > min) || count < 1) {
    return [];
  }
  const step = (max - min) / (count + 1);
  return Array.from({ length: count }, (_, index) => min + step * (index + 1));
}

/**
 * Optuna's contour look: light for low values, deep blue for high.
 * `t` in [0, 1].
 */
export function bluesColor(t: number): string {
  const clamped = Math.min(1, Math.max(0, t));
  // Endpoints sampled from the ColorBrewer Blues ramp Optuna uses.
  const stops: [number, number, number][] = [
    [247, 251, 255],
    [198, 219, 239],
    [107, 174, 214],
    [33, 113, 181],
    [8, 48, 107],
  ];
  const position = clamped * (stops.length - 1);
  const index = Math.min(Math.floor(position), stops.length - 2);
  const fraction = position - index;
  const from = stops[index]!;
  const to = stops[index + 1]!;
  const channel = (i: number): number =>
    Math.round(from[i]! + (to[i]! - from[i]!) * fraction);
  return `rgb(${channel(0)}, ${channel(1)}, ${channel(2)})`;
}

/**
 * The Blues ramp as a 256-entry RGB lookup table, for painting the filled
 * bands as one `ImageData` instead of a `fillRect` and an `rgb(...)` string
 * parse per raster cell.
 */
export function bluesLut(): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256 * 3);
  for (let index = 0; index < 256; index++) {
    const color = bluesColor(index / 255);
    const [r = 0, g = 0, b = 0] = color
      .slice(4, -1)
      .split(",")
      .map((channel) => Number(channel.trim()));
    lut[index * 3] = r;
    lut[index * 3 + 1] = g;
    lut[index * 3 + 2] = b;
  }
  return lut;
}

/**
 * One combination's objective: the metric's value on its final frame.
 *
 * Matches what a single run reports as the metric's result — a distribution
 * frame reduces to the mean of its bins, a scalar frame to its frame value.
 */
export function sweepCellObjective(
  frames: readonly MonteCarloUserDefinedMetricFrame[],
  metricId: string,
): number | null {
  for (let index = frames.length - 1; index >= 0; index--) {
    const frame = frames[index]!;
    if (frame.metricId !== metricId) {
      continue;
    }
    if (frame.outputType === "scalar") {
      return frame.frameValue;
    }
    let weight = 0;
    let sum = 0;
    for (const [value, frequency] of frame.bins) {
      weight += frequency;
      sum += value * frequency;
    }
    return weight > 0 ? sum / weight : null;
  }
  return null;
}
