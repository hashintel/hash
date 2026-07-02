/* eslint-disable no-param-reassign -- Monte Carlo frame buffers are mutable by design. */
import type {
  EngineFrameLayout,
  EngineFrameView,
} from "../frames/internal-frame";

export type MonteCarloFrameBuffer = {
  buffer: ArrayBuffer;
  /** Allocated token region capacity, in bytes (multiple of 8). */
  tokenByteCapacity: number;
  /** Used token region length, in bytes. */
  tokenByteCount: number;
  placeCounts: Uint32Array;
  /** Per-place byte offsets within the token region. */
  placeOffsets: Uint32Array;
  transitionElapsedFrames: Float64Array;
  transitionElapsed: Float64Array;
  transitionFiringCounts: Uint32Array;
  transitionFiredFlags: Uint8Array;
  /** u8 view over the whole token region capacity. */
  tokenBytes: Uint8Array;
  /** f64 view over the whole token region capacity. */
  tokenF64: Float64Array;
};

const alignTo = (value: number, alignment: number): number =>
  Math.ceil(value / alignment) * alignment;

/**
 * Creates typed-array views over one Monte Carlo frame buffer.
 *
 * The buffer contains fixed-size place and transition metadata followed by the
 * variable-capacity token byte region. Keeping all views over one ArrayBuffer
 * makes frame swapping cheap and keeps ownership explicit. The token region
 * starts at an 8-aligned offset and spans a multiple of 8 bytes, so both the
 * u8 and f64 views address the same packed-struct token bytes.
 */
function createViews(
  layout: EngineFrameLayout,
  buffer: ArrayBuffer,
  tokenByteCapacity: number,
): Omit<
  MonteCarloFrameBuffer,
  "buffer" | "tokenByteCapacity" | "tokenByteCount"
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
  const transitionElapsedFramesOffset =
    transitionElapsedOffset + transitionCount * Float64Array.BYTES_PER_ELEMENT;
  const transitionFiringCountsOffset =
    transitionElapsedFramesOffset +
    transitionCount * Float64Array.BYTES_PER_ELEMENT;
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
    transitionElapsedFrames: new Float64Array(
      buffer,
      transitionElapsedFramesOffset,
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
    tokenBytes: new Uint8Array(buffer, tokenValuesOffset, tokenByteCapacity),
    tokenF64: new Float64Array(
      buffer,
      tokenValuesOffset,
      tokenByteCapacity / 8,
    ),
  };
}

/**
 * Computes the ArrayBuffer byte length required for a frame with this layout
 * and token byte capacity.
 *
 * `tokenByteCapacity` is measured in bytes, not token count, because colored
 * places can have different token strides.
 */
export function getMonteCarloFrameBufferByteLength(
  layout: EngineFrameLayout,
  tokenByteCapacity: number,
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
    transitionCount * Float64Array.BYTES_PER_ELEMENT +
    transitionCount * Uint32Array.BYTES_PER_ELEMENT +
    transitionCount * Uint8Array.BYTES_PER_ELEMENT;
  const tokenValuesOffset = alignTo(
    transitionElapsedOffset + transitionBytes,
    Float64Array.BYTES_PER_ELEMENT,
  );

  return tokenValuesOffset + tokenByteCapacity;
}

/**
 * Allocates an empty Monte Carlo frame buffer and attaches its typed-array
 * views.
 *
 * The returned frame owns one ArrayBuffer and starts with zero used token
 * bytes, even if a larger capacity was allocated.
 */
export function createMonteCarloFrameBuffer(
  layout: EngineFrameLayout,
  tokenByteCapacity: number,
): MonteCarloFrameBuffer {
  const normalizedCapacity = alignTo(
    Math.max(0, Math.ceil(tokenByteCapacity)),
    8,
  );
  const buffer = new ArrayBuffer(
    getMonteCarloFrameBufferByteLength(layout, normalizedCapacity),
  );

  return {
    buffer,
    tokenByteCapacity: normalizedCapacity,
    tokenByteCount: 0,
    ...createViews(layout, buffer, normalizedCapacity),
  };
}

/**
 * Copies the used portion of one Monte Carlo frame into another existing frame
 * buffer.
 *
 * The target must already have enough token byte capacity. This is used for
 * current/next frame swapping without allocating on every simulation step.
 */
export function copyMonteCarloFrameBuffer(
  source: MonteCarloFrameBuffer,
  target: MonteCarloFrameBuffer,
): void {
  if (target.tokenByteCapacity < source.tokenByteCount) {
    throw new Error(
      `Target MonteCarloFrameBuffer capacity ${target.tokenByteCapacity} cannot hold ${source.tokenByteCount} token bytes`,
    );
  }

  target.placeCounts.set(source.placeCounts);
  target.placeOffsets.set(source.placeOffsets);
  target.transitionElapsedFrames.set(source.transitionElapsedFrames);
  target.transitionElapsed.set(source.transitionElapsed);
  target.transitionFiringCounts.set(source.transitionFiringCounts);
  target.transitionFiredFlags.set(source.transitionFiredFlags);
  target.tokenBytes.set(source.tokenBytes.subarray(0, source.tokenByteCount));
  target.tokenByteCount = source.tokenByteCount;
}

/**
 * Allocates a new Monte Carlo frame buffer and copies an existing frame into
 * it.
 *
 * This is the resize path used when a run outgrows its current token byte
 * capacity.
 */
export function cloneMonteCarloFrameBuffer(
  layout: EngineFrameLayout,
  source: MonteCarloFrameBuffer,
  tokenByteCapacity: number,
): MonteCarloFrameBuffer {
  const target = createMonteCarloFrameBuffer(layout, tokenByteCapacity);
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
  dt: number,
): void {
  const tokenByteCount = source.tokenBytes.byteLength;
  if (target.tokenByteCapacity < tokenByteCount) {
    throw new Error(
      `Target MonteCarloFrameBuffer capacity ${target.tokenByteCapacity} cannot hold ${tokenByteCount} token bytes`,
    );
  }

  for (let index = 0; index < layout.placeIds.length; index++) {
    const placeId = layout.placeIds[index]!;
    const placeState = source.getPlaceState(placeId);
    if (!placeState) {
      throw new Error(`Place ${placeId} not found in source frame`);
    }

    target.placeCounts[index] = placeState.count;
    target.placeOffsets[index] = placeState.byteOffset;
  }

  for (let index = 0; index < layout.transitionIds.length; index++) {
    const transitionId = layout.transitionIds[index]!;
    const transitionState = source.getTransitionState(transitionId);
    if (!transitionState) {
      throw new Error(`Transition ${transitionId} not found in source frame`);
    }

    const elapsedFrames = Math.max(
      0,
      Math.round(transitionState.timeSinceLastFiringMs / dt),
    );

    target.transitionElapsedFrames[index] = elapsedFrames;
    target.transitionElapsed[index] = elapsedFrames * dt;
    target.transitionFiringCounts[index] = transitionState.firingCount;
    target.transitionFiredFlags[index] = transitionState.firedInThisFrame
      ? 1
      : 0;
  }

  target.tokenBytes.set(source.tokenBytes);
  target.tokenByteCount = tokenByteCount;
}
