/**
 * The imperative paint of a contour plot: the filled field blitted as one
 * raster-resolution image, iso-lines on top, dots where samples exist, and
 * markers for external points — amber rings or filled dots, a hollow grey ring
 * for a point without a value, and the navigation mark.
 *
 * A field needs three samples to say anything: below that, two samples
 * interpolate to a near-uniform wash, so the plot shows only its dots and
 * markers — or, after a restart (the caller clearing `values` for a new
 * slice), the previous field dimmed until the new samples can replace it.
 */
import {
  BLUES_STOPS,
  rampLut,
  rasterizeNormalized,
} from "../../shared/color-ramp";
import {
  type ContourSample,
  type ContourSegment,
  contourLevels,
  createIdwAccumulator,
  type IdwAccumulator,
  marchingSquaresSegments,
} from "./contour-field";

/** Values sampled so far, keyed `"x,y"` in grid-index space (y up). */
export type ContourSurfaceValues = ReadonlyMap<string, number>;

/** An externally supplied point drawn as a ring, in grid-index space. */
export type ContourSurfaceMarker = {
  x: number;
  y: number;
  /** Draw larger and stronger — e.g. a study's best trial. */
  emphasis?: boolean;
  /**
   * `point` is an amber ring over a field computed elsewhere; `dot` is the
   * same point filled, for a plot whose markers are the field's own samples.
   * `navigation` marks where the viewer's controls sit rather than a data
   * point: a dark ring with a centre dot, distinct from the amber data marks.
   * `muted` is a point that carries no value, such as a pruned trial: a faint
   * grey ring.
   */
  kind?: "point" | "dot" | "navigation" | "muted";
};

/** Whether the plot dots every sampled cell. */
export type ContourSurfaceSampleMarks = "dot" | "none";

/** Interpolation lattice points per grid cell. */
const RASTER_SUBDIVISION = 8;

/** Samples a field needs before it is painted, or replaces the ghost. */
const FIELD_MIN_SAMPLES = 3;

const ISO_LINE_COUNT = 10;

const BLUES_LUT = rampLut(BLUES_STOPS);

type RetainedField = {
  image: HTMLCanvasElement;
  segments: ContourSegment[][];
  rasterWidth: number;
  rasterHeight: number;
};

/** Everything one plot instance keeps between paints. */
export type PaintState = {
  contentKey: string | undefined;
  accumulator: IdwAccumulator | null;
  accumulatorSize: string;
  /** The field of one accumulator version and value range. */
  field: (RetainedField & { version: number; min: number; max: number }) | null;
  /** The last complete-enough field, shown dimmed across restarts. */
  ghost: RetainedField | null;
};

export const createPaintState = (): PaintState => ({
  contentKey: undefined,
  accumulator: null,
  accumulatorSize: "",
  field: null,
  ghost: null,
});

/* eslint-disable no-param-reassign -- draw helpers configure the caller's
   canvas context and mutate the retained paint state */

const drawField = (
  context: CanvasRenderingContext2D,
  field: RetainedField,
  width: number,
  height: number,
): void => {
  const cellWidth = width / (field.rasterWidth - 1);
  const cellHeight = height / (field.rasterHeight - 1);
  context.imageSmoothingEnabled = false;
  context.drawImage(field.image, 0, 0, width, height);
  context.imageSmoothingEnabled = true;
  context.strokeStyle = "rgba(15, 23, 42, 0.35)";
  context.lineWidth = 1;
  for (const levelSegments of field.segments) {
    context.beginPath();
    for (const [x1, y1, x2, y2] of levelSegments) {
      context.moveTo(x1 * cellWidth, y1 * cellHeight);
      context.lineTo(x2 * cellWidth, y2 * cellHeight);
    }
    context.stroke();
  }
};

const drawSamples = (
  context: CanvasRenderingContext2D,
  samples: readonly ContourSample[],
  toPixel: (x: number, y: number) => [number, number],
): void => {
  for (const sample of samples) {
    const [x, y] = toPixel(sample.x, sample.y);
    context.beginPath();
    context.arc(x, y, 2.5, 0, Math.PI * 2);
    context.fillStyle = "rgba(15, 23, 42, 0.75)";
    context.fill();
    context.strokeStyle = "rgba(255, 255, 255, 0.9)";
    context.lineWidth = 1;
    context.stroke();
  }
};

const drawMarkers = (
  context: CanvasRenderingContext2D,
  markers: readonly ContourSurfaceMarker[],
  toPixel: (x: number, y: number) => [number, number],
): void => {
  for (const marker of markers) {
    const [x, y] = toPixel(marker.x, marker.y);
    if (marker.kind === "navigation") {
      context.beginPath();
      context.arc(x, y, 6, 0, Math.PI * 2);
      context.strokeStyle = "rgba(15, 23, 42, 0.9)";
      context.lineWidth = 1.5;
      context.stroke();
      context.beginPath();
      context.arc(x, y, 1.5, 0, Math.PI * 2);
      context.fillStyle = "rgba(15, 23, 42, 0.9)";
      context.fill();
      continue;
    }
    if (marker.kind === "muted") {
      context.beginPath();
      context.arc(x, y, 3.5, 0, Math.PI * 2);
      context.strokeStyle = "rgba(100, 116, 139, 0.6)";
      context.lineWidth = 1;
      context.stroke();
      continue;
    }
    if (marker.kind === "dot") {
      context.beginPath();
      context.arc(x, y, marker.emphasis ? 5.5 : 3.5, 0, Math.PI * 2);
      context.fillStyle = marker.emphasis
        ? "rgba(217, 119, 6, 0.95)"
        : "rgba(217, 119, 6, 0.8)";
      context.fill();
      context.strokeStyle = "rgba(255, 255, 255, 0.9)";
      context.lineWidth = marker.emphasis ? 1.5 : 1;
      context.stroke();
      continue;
    }
    context.beginPath();
    context.arc(x, y, marker.emphasis ? 5 : 3.5, 0, Math.PI * 2);
    context.strokeStyle = marker.emphasis
      ? "rgba(217, 119, 6, 0.95)"
      : "rgba(217, 119, 6, 0.55)";
    context.lineWidth = marker.emphasis ? 2 : 1.25;
    context.stroke();
  }
};

/**
 * Brings `state.field` up to date with `samples`: refolds only the new
 * samples, re-rasterizes when the accumulator or the value range changed,
 * and snapshots the result as the ghost once it has enough samples.
 */
const updateField = (
  state: PaintState,
  samples: readonly ContourSample[],
  nx: number,
  ny: number,
): RetainedField => {
  const rasterWidth = Math.max(2, (nx - 1) * RASTER_SUBDIVISION + 1);
  const rasterHeight = Math.max(2, (ny - 1) * RASTER_SUBDIVISION + 1);
  const sizeKey = `${nx}|${ny}|${rasterWidth}|${rasterHeight}`;
  if (state.accumulator === null || state.accumulatorSize !== sizeKey) {
    state.accumulator = createIdwAccumulator({
      nx,
      ny,
      width: rasterWidth,
      height: rasterHeight,
    });
    state.accumulatorSize = sizeKey;
    state.field = null;
  }
  const accumulator = state.accumulator;
  const raster = accumulator.update(samples);

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const sample of samples) {
    min = Math.min(min, sample.value);
    max = Math.max(max, sample.value);
  }

  if (
    state.field !== null &&
    state.field.version === accumulator.version &&
    state.field.min === min &&
    state.field.max === max
  ) {
    return state.field;
  }

  // One pixel per filled cell, each taking its top-left lattice value.
  const columns = rasterWidth - 1;
  const rows = rasterHeight - 1;
  const pixels = rasterizeNormalized(
    raster,
    { columns, rows, sourceStride: rasterWidth },
    BLUES_LUT,
    { min, max },
  );
  const image = state.field?.image ?? document.createElement("canvas");
  image.width = columns;
  image.height = rows;
  image
    .getContext("2d")!
    .putImageData(new ImageData(pixels, columns, rows), 0, 0);

  const segments =
    max > min
      ? contourLevels(min, max, ISO_LINE_COUNT).map((level) =>
          marchingSquaresSegments(raster, rasterWidth, rasterHeight, level),
        )
      : [];

  state.field = {
    version: accumulator.version,
    min,
    max,
    image,
    segments,
    rasterWidth,
    rasterHeight,
  };
  // The live field's canvas is reused across versions, so the ghost copies
  // it rather than aliasing it.
  if (samples.length >= FIELD_MIN_SAMPLES) {
    const ghostImage = state.ghost?.image ?? document.createElement("canvas");
    ghostImage.width = image.width;
    ghostImage.height = image.height;
    ghostImage.getContext("2d")!.drawImage(image, 0, 0);
    state.ghost = { image: ghostImage, segments, rasterWidth, rasterHeight };
  }
  return state.field;
};

export const paintField = (options: {
  canvas: HTMLCanvasElement;
  state: PaintState;
  width: number;
  height: number;
  nx: number;
  ny: number;
  values: ContourSurfaceValues;
  markers: readonly ContourSurfaceMarker[];
  sampleMarks: ContourSurfaceSampleMarks;
  /** Identity of the plotted quantity; a change drops the ghost. */
  contentKey: string | undefined;
}): void => {
  const {
    canvas,
    state,
    width,
    height,
    nx,
    ny,
    values,
    markers,
    sampleMarks,
    contentKey,
  } = options;
  if (state.contentKey !== contentKey) {
    state.contentKey = contentKey;
    state.ghost = null;
  }

  const pixelRatio = globalThis.devicePixelRatio || 1;
  const deviceWidth = Math.max(1, Math.round(width * pixelRatio));
  const deviceHeight = Math.max(1, Math.round(height * pixelRatio));
  // Assigning width/height reallocates and clears the backing store.
  if (canvas.width !== deviceWidth || canvas.height !== deviceHeight) {
    canvas.width = deviceWidth;
    canvas.height = deviceHeight;
  }
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, width, height);

  const samples: ContourSample[] = [];
  for (const [key, value] of values) {
    const [x = 0, y = 0] = key.split(",").map(Number);
    samples.push({ x, y, value });
  }
  const toPixel = (x: number, y: number): [number, number] => [
    (x / Math.max(nx - 1, 1)) * width,
    height - (y / Math.max(ny - 1, 1)) * height,
  ];

  if (samples.length >= FIELD_MIN_SAMPLES) {
    drawField(context, updateField(state, samples, nx, ny), width, height);
  } else if (state.ghost !== null) {
    context.globalAlpha = 0.45;
    drawField(context, state.ghost, width, height);
    context.globalAlpha = 1;
  }
  if (sampleMarks === "dot") {
    drawSamples(context, samples, toPixel);
  }

  drawMarkers(context, markers, toPixel);
};

/* eslint-enable no-param-reassign */
