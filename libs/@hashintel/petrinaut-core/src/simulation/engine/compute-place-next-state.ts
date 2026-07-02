import type { TokenSlotLayout } from "./token-layout";

export type ODEType = "euler" | "midpoint" | "rk4";

export type PlaceDifferentialEquation = (
  placeBytes: Uint8Array,
  numberOfTokens: number,
) => Float64Array;

/**
 * Takes one place's token byte region, its packed token layout, a
 * differential equation defining its dynamics, an ODE solving method, and a
 * time step (dt), and computes the next state of the place using the
 * specified ODE method.
 *
 * Only `real` fields are integrated (via `layout.realFieldF64Offsets`);
 * discrete bytes (integers rounded on decode, booleans stored as u8) are
 * copied through untouched.
 *
 * Currently, only the Euler method is implemented.
 */
export function computePlaceNextState(
  placeBytes: Uint8Array,
  layout: TokenSlotLayout,
  numberOfTokens: number,
  differentialEquation: PlaceDifferentialEquation,
  odeType: ODEType,
  dt: number,
): Uint8Array {
  if (odeType !== "euler") {
    throw new Error(
      `ODE type ${odeType} not implemented yet. Use Euler method.`,
    );
  }

  const derivatives = differentialEquation(placeBytes, numberOfTokens);

  // Copy the whole region (including discrete bytes and padding) into a fresh
  // 8-aligned buffer, then integrate the real fields in place.
  const next = new Uint8Array(placeBytes.byteLength);
  next.set(placeBytes);

  const f64 = new Float64Array(next.buffer, 0, next.byteLength / 8);
  const strideF64 = layout.strideBytes / 8;
  const realOffsets = layout.realFieldF64Offsets;
  const realFieldCount = realOffsets.length;

  for (let tokenIndex = 0; tokenIndex < numberOfTokens; tokenIndex++) {
    for (let fieldIndex = 0; fieldIndex < realFieldCount; fieldIndex++) {
      // Apply Euler method: nextState = currentState + derivative * dt
      const valueIndex = tokenIndex * strideF64 + realOffsets[fieldIndex]!;
      f64[valueIndex] =
        (f64[valueIndex] ?? 0) +
        (derivatives[tokenIndex * realFieldCount + fieldIndex] ?? 0) * dt;
    }
  }

  return next;
}
