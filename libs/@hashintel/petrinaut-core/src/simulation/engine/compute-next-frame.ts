import {
  createEngineFrame,
  materializeEngineFrame,
} from "../frames/internal-frame";
import { checkTransitionEnablement } from "./check-transition-enablement";
import { computePlaceNextState } from "./compute-place-next-state";
import { executeTransitions } from "./execute-transitions";

import type { SimulationInstance } from "./types";

/**
 * Reason why the simulation completed.
 */
export type SimulationCompletionReason = "maxTime" | "deadlock";

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

  /**
   * If set, the simulation has completed and should not continue.
   * - "maxTime": The simulation reached the configured maximum time.
   * - "deadlock": No transitions are enabled and no further progress is possible.
   */
  completionReason: SimulationCompletionReason | null;
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

  // Check if maxTime has been reached before computing
  if (
    simulation.maxTime !== null &&
    simulation.currentTime >= simulation.maxTime
  ) {
    return {
      simulation,
      transitionFired: false,
      completionReason: "maxTime",
    };
  }

  const currentSnapshot = materializeEngineFrame(
    simulation.frameLayout,
    currentFrame,
  );

  // Step 1: Apply differential equations to places with dynamics enabled
  let frameAfterDynamics = currentFrame;

  // Only apply dynamics if there are places with differential equations
  if (simulation.differentialEquationFns.size > 0) {
    const newBuffer = new Uint8Array(currentSnapshot.buffer);

    for (const [
      placeId,
      differentialEquation,
    ] of simulation.differentialEquationFns) {
      const placeState = currentSnapshot.places[placeId];
      if (!placeState) {
        throw new Error(`Place with ID ${placeId} not found in frame`);
      }
      const placeIndex = simulation.frameLayout.placeIndexById.get(placeId);
      const tokenLayout =
        placeIndex === undefined
          ? null
          : simulation.frameLayout.placeTokenLayouts[placeIndex];
      if (!tokenLayout) {
        throw new Error(
          `Place with ID ${placeId} has no token layout but has dynamics`,
        );
      }
      const { byteOffset, count, strideBytes } = placeState;
      const placeByteSize = count * strideBytes;
      const placeBytes = currentSnapshot.buffer.slice(
        byteOffset,
        byteOffset + placeByteSize,
      );

      const nextPlaceBytes = computePlaceNextState(
        placeBytes,
        tokenLayout,
        count,
        differentialEquation,
        "euler", // Currently only Euler method is implemented
        simulation.dt,
      );

      // Copy the updated bytes back into the new buffer
      newBuffer.set(nextPlaceBytes, byteOffset);
    }

    // Create frame with updated buffer after applying dynamics
    frameAfterDynamics = createEngineFrame(simulation.frameLayout, {
      ...currentSnapshot,
      buffer: newBuffer,
    });
  }

  // Step 2: Execute all transitions on the frame with updated dynamics
  const transitionsResult = executeTransitions(
    frameAfterDynamics,
    simulation,
    simulation.dt,
    simulation.rngState,
  );
  const frameAfterTransitions = transitionsResult.frame;
  const transitionFired = transitionsResult.transitionFired;
  const nextTime = simulation.currentTime + simulation.dt;

  // Step 3: Ensure transition timers advance when no transition fired.
  let finalFrame = frameAfterTransitions;
  if (!transitionFired) {
    const frameAfterTransitionsSnapshot = materializeEngineFrame(
      simulation.frameLayout,
      frameAfterTransitions,
    );
    finalFrame = createEngineFrame(simulation.frameLayout, {
      ...frameAfterTransitionsSnapshot,
      transitions: Object.fromEntries(
        Object.entries(frameAfterTransitionsSnapshot.transitions).map(
          ([id, state]) => [
            id,
            {
              ...state,
              timeSinceLastFiringMs:
                state.timeSinceLastFiringMs + simulation.dt,
              firedInThisFrame: false,
            },
          ],
        ),
      ),
    });
  }

  // Step 4: Build updated simulation instance with new frame added
  const updatedSimulation: SimulationInstance = {
    ...simulation,
    frames: [...simulation.frames, finalFrame],
    currentFrameNumber: simulation.currentFrameNumber + 1,
    currentTime: nextTime,
    rngState: transitionsResult.rngState,
  };

  // Step 5: Check for completion conditions
  let completionReason: SimulationCompletionReason | null = null;

  // Check if maxTime was reached with this new frame
  if (simulation.maxTime !== null && nextTime >= simulation.maxTime) {
    completionReason = "maxTime";
  }
  // Check for deadlock if no transition fired
  else if (!transitionFired) {
    const enablementResult = checkTransitionEnablement(
      finalFrame,
      simulation.transitions,
      simulation.frameLayout,
    );
    if (!enablementResult.hasEnabledTransition) {
      completionReason = "deadlock";
    }
  }

  return {
    simulation: updatedSimulation,
    transitionFired,
    completionReason,
  };
}
