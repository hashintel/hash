import {
  readEngineFrame,
  type EngineFrame,
  type EngineFrameLayout,
} from "../frames/internal-frame";

import type { TraceEvent } from "./trace";

/**
 * Cubic Hermite interpolation between `(y0, slope0)` at the start of a span
 * and `(y1, slope1)` at its end, evaluated at the fraction `s` of the span.
 * The curve passes through both endpoints with both slopes, so a trajectory
 * sampled at two events is reconstructed to fourth order in the span.
 */
export const hermite = (
  y0: number,
  slope0: number,
  y1: number,
  slope1: number,
  span: number,
  s: number,
): number => {
  const s2 = s * s;
  const s3 = s2 * s;
  return (
    (2 * s3 - 3 * s2 + 1) * y0 +
    (s3 - 2 * s2 + s) * span * slope0 +
    (-2 * s3 + 3 * s2) * y1 +
    (s3 - s2) * span * slope1
  );
};

/**
 * The state at `time`, carried forward from the event `from` (the last event
 * at or before `time`) towards `to` (the event after it, when known).
 *
 * Only `real` attributes of places with dynamics move; counts and discrete
 * attributes are those of `from`. Per place:
 *
 * - When `to` holds the same tokens (same count, and no firing at `to`
 *   touched the place), each attribute follows the Hermite curve through
 *   the two recorded values and derivatives.
 * - Otherwise the attribute follows its recorded derivative linearly from
 *   `from`: the place's tokens at `to` cannot be matched to the ones at
 *   `from`, so the segment is extrapolated rather than interpolated.
 *
 * Returns `from.frame` itself when nothing moves, and a fresh buffer
 * otherwise; the input frames are never modified.
 */
export function interpolateFrame(
  layout: EngineFrameLayout,
  from: TraceEvent,
  to: TraceEvent | null,
  time: number,
): EngineFrame {
  const elapsed = time - from.time;
  if (elapsed <= 0 || from.derivatives.every((slopes) => slopes === null)) {
    return from.frame;
  }

  const frame = from.frame.slice(0);
  const view = readEngineFrame(layout, frame);
  const toView = to === null ? null : readEngineFrame(layout, to.frame);
  const touchedAtTo = new Set(to?.touchedPlaceIndices ?? []);
  const span = to === null ? 0 : to.time - from.time;
  const fraction = span > 0 ? Math.min(1, elapsed / span) : 0;

  for (const [placeIndex, slopes] of from.derivatives.entries()) {
    const tokenLayout = layout.placeTokenLayouts[placeIndex];
    const count = view.placeCounts[placeIndex] ?? 0;
    if (slopes === null || !tokenLayout || count === 0) {
      continue;
    }

    const endSlopes =
      to !== null &&
      toView !== null &&
      !touchedAtTo.has(placeIndex) &&
      toView.placeCounts[placeIndex] === count
        ? to.derivatives[placeIndex]
        : null;

    const fieldOffsets = tokenLayout.realFieldF64Offsets;
    const fieldCount = fieldOffsets.length;
    const strideF64 = tokenLayout.strideBytes / 8;
    const base = (view.placeByteOffsets[placeIndex] ?? 0) / 8;
    const endBase =
      toView === null ? 0 : (toView.placeByteOffsets[placeIndex] ?? 0) / 8;

    for (let tokenIndex = 0; tokenIndex < count; tokenIndex++) {
      for (let field = 0; field < fieldCount; field++) {
        const tokenOffset = tokenIndex * strideF64 + fieldOffsets[field]!;
        const slopeIndex = tokenIndex * fieldCount + field;
        const value = view.tokenViews.f64[base + tokenOffset]!;
        const slope = slopes[slopeIndex]!;

        view.tokenViews.f64[base + tokenOffset] =
          endSlopes === null || endSlopes === undefined || toView === null
            ? value + slope * elapsed
            : hermite(
                value,
                slope,
                toView.tokenViews.f64[endBase + tokenOffset]!,
                endSlopes[slopeIndex]!,
                span,
                fraction,
              );
      }
    }
  }

  return frame;
}
