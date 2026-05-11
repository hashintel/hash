/* eslint-disable no-param-reassign -- Monte Carlo frame buffers are mutable by design. */
import type {
  EngineFrameLayout,
  EngineFrameView,
} from "../frames/internal-frame";

export type MonteCarloFrameBuffer = {
  buffer: ArrayBuffer;
  tokenValueCapacity: number;
  tokenValueCount: number;
  placeCounts: Uint32Array;
  placeOffsets: Uint32Array;
  transitionElapsed: Float64Array;
  transitionFiringCounts: Uint32Array;
  transitionFiredFlags: Uint8Array;
  tokenValues: Float64Array;
};

const alignTo = (value: number, alignment: number): number =>
  Math.ceil(value / alignment) * alignment;

/**
 * Creates typed-array views over one Monte Carlo frame buffer.
 *
 * The buffer contains fixed-size place and transition metadata followed by the
 * variable-capacity token value region. Keeping all views over one ArrayBuffer
 * makes frame swapping cheap and keeps ownership explicit.
 */
function createViews(
  layout: EngineFrameLayout,
  buffer: ArrayBuffer,
  tokenValueCapacity: number,
): Omit<
  MonteCarloFrameBuffer,
  "buffer" | "tokenValueCapacity" | "tokenValueCount"
> {
  const placeCount = layout.placeIds.length;
  const transitionCount = layout.transitionIds.length;

  const placeCountsOffset = 0;
  const placeOffsetsOffset =
    placeCountsOffset + placeCount * Uint32Array.BYTES_PER_ELEMENT;
  const transitionElapsedOffset = alignTo(
    placeOffsetsOffset + placeCount * Uint32Array.BYTES_PER_ELEMENT,
    Float64Array.BYTES_PER_ELEMENT,
  );
  const transitionFiringCountsOffset =
    transitionElapsedOffset + transitionCount * Float64Array.BYTES_PER_ELEMENT;
  const transitionFiredFlagsOffset =
    transitionFiringCountsOffset +
    transitionCount * Uint32Array.BYTES_PER_ELEMENT;
  const tokenValuesOffset = alignTo(
    transitionFiredFlagsOffset + transitionCount * Uint8Array.BYTES_PER_ELEMENT,
    Float64Array.BYTES_PER_ELEMENT,
  );

  return {
    placeCounts: new Uint32Array(buffer, placeCountsOffset, placeCount),
    placeOffsets: new Uint32Array(buffer, placeOffsetsOffset, placeCount),
    transitionElapsed: new Float64Array(
      buffer,
      transitionElapsedOffset,
      transitionCount,
    ),
    transitionFiringCounts: new Uint32Array(
      buffer,
      transitionFiringCountsOffset,
      transitionCount,
    ),
    transitionFiredFlags: new Uint8Array(
      buffer,
      transitionFiredFlagsOffset,
      transitionCount,
    ),
    tokenValues: new Float64Array(
      buffer,
      tokenValuesOffset,
      tokenValueCapacity,
    ),
  };
}

/**
 * Computes the ArrayBuffer byte length required for a frame with this layout
 * and token value capacity.
 *
 * `tokenValueCapacity` is measured in Float64 values, not token count, because
 * colored places can have different dimensionality.
 */
export function getMonteCarloFrameBufferByteLength(
  layout: EngineFrameLayout,
  tokenValueCapacity: number,
): number {
  const placeCount = layout.placeIds.length;
  const transitionCount = layout.transitionIds.length;
  const placeBytes = placeCount * Uint32Array.BYTES_PER_ELEMENT * 2;
  const transitionElapsedOffset = alignTo(
    placeBytes,
    Float64Array.BYTES_PER_ELEMENT,
  );
  const transitionBytes =
    transitionCount * Float64Array.BYTES_PER_ELEMENT +
    transitionCount * Uint32Array.BYTES_PER_ELEMENT +
    transitionCount * Uint8Array.BYTES_PER_ELEMENT;
  const tokenValuesOffset = alignTo(
    transitionElapsedOffset + transitionBytes,
    Float64Array.BYTES_PER_ELEMENT,
  );

  return (
    tokenValuesOffset + tokenValueCapacity * Float64Array.BYTES_PER_ELEMENT
  );
}

/**
 * Allocates an empty Monte Carlo frame buffer and attaches its typed-array
 * views.
 *
 * The returned frame owns one ArrayBuffer and starts with zero used token
 * values, even if a larger capacity was allocated.
 */
export function createMonteCarloFrameBuffer(
  layout: EngineFrameLayout,
  tokenValueCapacity: number,
): MonteCarloFrameBuffer {
  const normalizedCapacity = Math.max(0, Math.ceil(tokenValueCapacity));
  const buffer = new ArrayBuffer(
    getMonteCarloFrameBufferByteLength(layout, normalizedCapacity),
  );

  return {
    buffer,
    tokenValueCapacity: normalizedCapacity,
    tokenValueCount: 0,
    ...createViews(layout, buffer, normalizedCapacity),
  };
}

/**
 * Copies the used portion of one Monte Carlo frame into another existing frame
 * buffer.
 *
 * The target must already have enough token value capacity. This is used for
 * current/next frame swapping without allocating on every simulation step.
 */
export function copyMonteCarloFrameBuffer(
  source: MonteCarloFrameBuffer,
  target: MonteCarloFrameBuffer,
): void {
  if (target.tokenValueCapacity < source.tokenValueCount) {
    throw new Error(
      `Target MonteCarloFrameBuffer capacity ${target.tokenValueCapacity} cannot hold ${source.tokenValueCount} token values`,
    );
  }

  target.placeCounts.set(source.placeCounts);
  target.placeOffsets.set(source.placeOffsets);
  target.transitionElapsed.set(source.transitionElapsed);
  target.transitionFiringCounts.set(source.transitionFiringCounts);
  target.transitionFiredFlags.set(source.transitionFiredFlags);
  target.tokenValues.set(
    source.tokenValues.subarray(0, source.tokenValueCount),
  );
  target.tokenValueCount = source.tokenValueCount;
}

/**
 * Allocates a new Monte Carlo frame buffer and copies an existing frame into
 * it.
 *
 * This is the resize path used when a run outgrows its current token value
 * capacity.
 */
export function cloneMonteCarloFrameBuffer(
  layout: EngineFrameLayout,
  source: MonteCarloFrameBuffer,
  tokenValueCapacity: number,
): MonteCarloFrameBuffer {
  const target = createMonteCarloFrameBuffer(layout, tokenValueCapacity);
  copyMonteCarloFrameBuffer(source, target);
  return target;
}

/**
 * Converts the regular engine frame reader output into a mutable Monte Carlo
 * frame buffer.
 *
 * Monte Carlo runs only retain their current and next frames, so initialization
 * copies the engine-produced initial frame into the reusable buffer format and
 * then discards the retained engine frame history.
 */
export function copyEngineFrameViewToMonteCarloFrameBuffer(
  layout: EngineFrameLayout,
  source: EngineFrameView,
  target: MonteCarloFrameBuffer,
): void {
  const tokenValueCount = source.tokenValues.length;
  if (target.tokenValueCapacity < tokenValueCount) {
    throw new Error(
      `Target MonteCarloFrameBuffer capacity ${target.tokenValueCapacity} cannot hold ${tokenValueCount} token values`,
    );
  }

  for (let index = 0; index < layout.placeIds.length; index++) {
    const placeId = layout.placeIds[index]!;
    const placeState = source.getPlaceState(placeId);
    if (!placeState) {
      throw new Error(`Place ${placeId} not found in source frame`);
    }

    target.placeCounts[index] = placeState.count;
    target.placeOffsets[index] = placeState.offset;
  }

  for (let index = 0; index < layout.transitionIds.length; index++) {
    const transitionId = layout.transitionIds[index]!;
    const transitionState = source.getTransitionState(transitionId);
    if (!transitionState) {
      throw new Error(`Transition ${transitionId} not found in source frame`);
    }

    target.transitionElapsed[index] = transitionState.timeSinceLastFiringMs;
    target.transitionFiringCounts[index] = transitionState.firingCount;
    target.transitionFiredFlags[index] = transitionState.firedInThisFrame
      ? 1
      : 0;
  }

  target.tokenValues.set(source.tokenValues);
  target.tokenValueCount = tokenValueCount;
}
