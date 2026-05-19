export type ODEType = "euler" | "midpoint" | "rk4";

export type PlaceDifferentialEquation = (
  currentState: Float64Array,
  dimensions: number,
  numberOfTokens: number,
) => Float64Array;

/**
 * Takes current Place state, a differential equation defining its dynamics,
 * an ODE solving method, and a time step (dt), and computes the next state
 * of the Place using the specified ODE method.
 *
 * Currently, only the Euler method is implemented.
 */
export function computePlaceNextState(
  placeState: Float64Array,
  dimensions: number,
  numberOfTokens: number,
  differentialEquation: PlaceDifferentialEquation,
  odeType: ODEType,
  dt: number,
): Float64Array {
  if (odeType !== "euler") {
    throw new Error(
      `ODE type ${odeType} not implemented yet. Use Euler method.`,
    );
  }

  const derivatives = differentialEquation(
    placeState,
    dimensions,
    numberOfTokens,
  );

  return (
    placeState
      // Apply Euler method: nextState = currentState + derivative * dt
      .map((value, index) => value + derivatives[index]! * dt)
  );
}
