import type { DifferentialEquationFn } from "../engine/types";
import type { EngineFrameLayout } from "../frames/internal-frame";

/** The parts of a frame a differential equation reads. */
export type TokenRegion = {
  placeCounts: ArrayLike<number>;
  placeOffsets: ArrayLike<number>;
  tokenBytes: Uint8Array;
};

/**
 * Evaluates every place's differential equation on the tokens of `region`:
 * one `Float64Array` per frame place index, laid out `tokens × real fields`
 * as the equation returns it, or `null` for a place without dynamics.
 *
 * The derivative is what the engine would integrate from this state, so a
 * reader can continue the continuous evolution without the equation.
 */
export function computeDerivatives(
  layout: EngineFrameLayout,
  differentialEquationFns: ReadonlyMap<string, DifferentialEquationFn>,
  region: TokenRegion,
): (Float64Array | null)[] {
  return layout.placeIds.map((placeId, placeIndex) => {
    const equation = differentialEquationFns.get(placeId);
    if (!equation) {
      return null;
    }
    const count = region.placeCounts[placeIndex] ?? 0;
    const stride = layout.placeStrideBytes[placeIndex] ?? 0;
    const offset = region.placeOffsets[placeIndex] ?? 0;
    // The compiled equation addresses the region it is given from byte 0,
    // and may hand back a buffer it reuses, so both sides are copied.
    return new Float64Array(
      equation(region.tokenBytes.slice(offset, offset + count * stride), count),
    );
  });
}
