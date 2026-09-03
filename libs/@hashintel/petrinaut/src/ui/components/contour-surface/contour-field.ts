/**
 * The field behind a contour plot: sparse grid samples interpolated onto a
 * raster by inverse distance weighting, iso-lines by marching squares.
 */

/** One sampled cell, in grid-index space (y up). */
export type ContourSample = {
  x: number;
  y: number;
  value: number;
};

/**
 * Interpolates `samples` onto a `width × height` raster spanning the grid's
 * index space, by inverse distance weighting (power 2). A raster point on a
 * sample takes its value; a single sample gives a flat raster.
 */
export const idwRaster = (options: {
  samples: readonly ContourSample[];
  /** Grid extent in index space: samples lie in [0, nx-1] × [0, ny-1]. */
  nx: number;
  ny: number;
  width: number;
  height: number;
}): Float64Array => {
  const { samples, nx, ny, width, height } = options;
  const raster = new Float64Array(width * height);
  if (samples.length === 0) {
    return raster;
  }

  for (let py = 0; py < height; py++) {
    // Raster rows run top-to-bottom; grid rows bottom-to-top.
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
};

/**
 * Inverse distance weighting over a growing sample list, folding only the
 * samples appended since the last `update` into persistent weight and value
 * sums. Each repaint costs O(raster × new samples) instead of
 * O(raster × all samples), with results identical to `idwRaster`. An
 * `update` whose samples do not extend the previous list refolds from
 * scratch.
 */
export type IdwAccumulator = {
  update(samples: readonly ContourSample[]): Float64Array;
  /** Increments whenever `update` changes the raster; a cache key. */
  readonly version: number;
};

export const createIdwAccumulator = (options: {
  nx: number;
  ny: number;
  width: number;
  height: number;
}): IdwAccumulator => {
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

  const extendsFolded = (samples: readonly ContourSample[]): boolean =>
    samples.length >= folded.length &&
    folded.every((previous, index) => {
      const next = samples[index]!;
      return (
        previous.x === next.x &&
        previous.y === next.y &&
        previous.value === next.value
      );
    });

  return {
    get version() {
      return version;
    },
    update(samples) {
      if (!extendsFolded(samples)) {
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
};

/** A line segment `[x1, y1, x2, y2]` in raster pixel coordinates. */
export type ContourSegment = [number, number, number, number];

/** Marching squares: the iso-line of `raster` at `level`, as segments. */
export const marchingSquaresSegments = (
  raster: Float64Array,
  width: number,
  height: number,
  level: number,
): ContourSegment[] => {
  const segments: ContourSegment[] = [];
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
};

/** `count` evenly spaced levels strictly inside [min, max]. */
export const contourLevels = (
  min: number,
  max: number,
  count: number,
): number[] => {
  if (!(max > min) || count < 1) {
    return [];
  }
  const step = (max - min) / (count + 1);
  return Array.from({ length: count }, (_, index) => min + step * (index + 1));
};
