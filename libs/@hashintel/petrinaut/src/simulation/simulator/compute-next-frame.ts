import { computePlaceNextState } from "./compute-place-next-state";
import { executeTransitions } from "./execute-transitions";
import type { SimulationInstance } from "./types";

/**
 * Result of computing the next frame.
 */
export type ComputeNextFrameResult = {
  /**
   * The updated simulation instance with the new frame appended.
   */
  simulation: SimulationInstance;

  /**
   * Whether any transition fired during this frame.
   * When false, the token distribution did not change due to discrete events.
   */
  transitionFired: boolean;
};

/**
 * Computes the next frame of the simulation by:
 * 1. Applying differential equations to all places with dynamics enabled (that have a type)
 * 2. Executing all possible transitions
 *
 * This integrates continuous dynamics (ODEs) and discrete transitions into a single step.
 *
 * @param simulation - The simulation instance containing the current state
 * @returns An object containing the updated SimulationInstance and whether any transition fired
 */
export function computeNextFrame(
  simulation: SimulationInstance,
): ComputeNextFrameResult {
  // Get the current frame
  const currentFrame = simulation.frames[simulation.currentFrameNumber]!;

  // Step 1: Apply differential equations to places with dynamics enabled
  let frameAfterDynamics = currentFrame;

  // Only apply dynamics if there are places with differential equations
  if (simulation.differentialEquationFns.size > 0) {
    const newBuffer = new Float64Array(currentFrame.buffer);

    // Apply differential equations to each place that has dynamics enabled
    for (const [placeId, placeState] of currentFrame.places) {
      // Skip places without dynamics enabled
      if (!placeState.instance.dynamicsEnabled) {
        continue;
      }

      // Skip places without a type (no dimensions to work with)
      if (!placeState.instance.colorId) {
        continue;
      }

      // Get the differential equation function for this place
      const diffEqFn = simulation.differentialEquationFns.get(placeId);
      if (!diffEqFn) {
        // No differential equation defined for this place, skip
        continue;
      }

      const { offset, count, dimensions } = placeState;
      const placeSize = count * dimensions;

      // Extract the current state for this place from the buffer
      const placeBuffer = currentFrame.buffer.slice(offset, offset + placeSize);

      // Get the type definition to access dimension names
      const typeId = placeState.instance.colorId;
      if (!typeId) {
        continue; // This shouldn't happen due to earlier check, but be safe
      }

      const type = simulation.types.get(typeId);
      if (!type) {
        throw new Error(
          `Type with ID ${typeId} referenced by place ${placeId} does not exist in simulation`,
        );
      }

      // ADAPTER
      // This could also allow for different modes, like:
      // - Buffer mode: passing Float64Array directly
      // - Object mode: passing array of objects
      // Right now, we pass objects with named dimensions

      // Convert buffer to token array with named dimensions (Record<string, number>[])
      const tokens: Record<string, number>[] = [];
      for (let tokenIdx = 0; tokenIdx < count; tokenIdx++) {
        const tokenStart = tokenIdx * dimensions;
        const token: Record<string, number> = {};
        for (let dimIdx = 0; dimIdx < dimensions; dimIdx++) {
          const dimensionName = type.elements[dimIdx]!.name;
          token[dimensionName] = placeBuffer[tokenStart + dimIdx]!;
        }
        tokens.push(token);
      }

      // Compute the next state using the differential equation
      // The DifferentialEquationFn now expects tokens as Record<string, number>[]
      const wrappedDiffEq = (
        currentState: Float64Array,
        _dimensions: number,
        _numberOfTokens: number,
      ): Float64Array => {
        // Convert Float64Array to token array for the user function
        const inputTokens: Record<string, number>[] = [];
        for (let tokenIdx = 0; tokenIdx < count; tokenIdx++) {
          const tokenStart = tokenIdx * dimensions;
          const token: Record<string, number> = {};
          for (let dimIdx = 0; dimIdx < dimensions; dimIdx++) {
            const dimensionName = type.elements[dimIdx]!.name;
            token[dimensionName] = currentState[tokenStart + dimIdx]!;
          }
          inputTokens.push(token);
        }

        // Call the user's differential equation function with token array
        const resultTokens = diffEqFn(inputTokens, simulation.parameterValues);

        // Convert result back to Float64Array
        const result = new Float64Array(count * dimensions);
        for (let tokenIdx = 0; tokenIdx < resultTokens.length; tokenIdx++) {
          const token = resultTokens[tokenIdx]!;
          for (let dimIdx = 0; dimIdx < dimensions; dimIdx++) {
            const dimensionName = type.elements[dimIdx]!.name;
            result[tokenIdx * dimensions + dimIdx] = token[dimensionName]!;
          }
        }
        return result;
      };

      const nextPlaceBuffer = computePlaceNextState(
        placeBuffer,
        dimensions,
        count,
        wrappedDiffEq,
        "euler", // Currently only Euler method is implemented
        simulation.dt,
      );

      // Copy the updated values back into the new buffer
      newBuffer.set(nextPlaceBuffer, offset);
    }

    // Create frame with updated buffer after applying dynamics
    frameAfterDynamics = {
      ...currentFrame,
      buffer: newBuffer,
    };
  }

  // Step 2: Execute all transitions on the frame with updated dynamics
  const frameAfterTransitions = executeTransitions(frameAfterDynamics);

  // Detect if any transition fired by checking if time changed
  // (executeTransitions only increments time when transitions fire)
  const transitionFired = frameAfterTransitions.time !== currentFrame.time;

  // Step 3: Ensure time is always incremented (executeTransitions only increments if transitions fire)
  const finalFrame = transitionFired
    ? frameAfterTransitions
    : {
        ...frameAfterTransitions,
        time: currentFrame.time + simulation.dt,
        // Also update transition timeSinceLastFiring since time advanced
        transitions: new Map(
          Array.from(frameAfterTransitions.transitions).map(([id, state]) => [
            id,
            {
              ...state,
              timeSinceLastFiring: state.timeSinceLastFiring + simulation.dt,
            },
          ]),
        ),
      };

  // Step 4: Return updated simulation instance with new frame added
  return {
    simulation: {
      ...simulation,
      frames: [...simulation.frames, finalFrame],
      currentFrameNumber: simulation.currentFrameNumber + 1,
    },
    transitionFired,
  };
}
