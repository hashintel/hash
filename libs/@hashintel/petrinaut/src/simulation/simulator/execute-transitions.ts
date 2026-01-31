import type { ID } from "../../core/types/sdcpn";
import { computePossibleTransition } from "./compute-possible-transition";
import { removeTokensFromSimulationFrame } from "./remove-tokens-from-simulation-frame";
import type { SimulationFrame, SimulationInstance } from "./types";

type PlaceID = ID;

/**
 * Adds tokens to multiple places in the simulation frame.
 *
 * Takes a SimulationFrame and a Map of Place IDs to arrays of token values,
 * and returns a new SimulationFrame with:
 * - The specified tokens added to each place's section in the buffer
 * - Each place's count incremented by the number of added tokens
 * - All subsequent places' offsets adjusted accordingly
 *
 * @param frame - The simulation frame to modify
 * @param tokensToAdd - Map from Place ID to array of token values to add (each token is an array of numbers)
 * @returns A new SimulationFrame with the tokens added
 * @throws Error if a place is not found or token dimensions don't match
 */
function addTokensToSimulationFrame(
  frame: SimulationFrame,
  tokensToAdd: Map<PlaceID, number[][]>,
): SimulationFrame {
  // If no tokens to add, return frame as-is
  if (tokensToAdd.size === 0) {
    return frame;
  }

  // Validate all places and token dimensions first
  for (const [placeId, tokens] of tokensToAdd) {
    const placeState = frame.places.get(placeId);
    if (!placeState) {
      throw new Error(
        `Place with ID ${placeId} not found in simulation frame.`,
      );
    }

    // Validate that all tokens have the correct dimensions
    const expectedDimensions = placeState.dimensions;
    for (const token of tokens) {
      if (token.length !== expectedDimensions) {
        throw new Error(
          `Token dimension mismatch for place ${placeId}. Expected ${expectedDimensions}, got ${token.length}.`,
        );
      }
    }
  }

  // Calculate total size increase needed in buffer
  let totalSizeIncrease = 0;
  for (const [placeId, tokens] of tokensToAdd) {
    const placeState = frame.places.get(placeId)!;
    const tokenSize = placeState.dimensions;
    totalSizeIncrease += tokens.length * tokenSize;
  }

  // Create a new buffer with increased size
  const newBuffer = new Float64Array(frame.buffer.length + totalSizeIncrease);

  // Process places in order of their offsets to build the new buffer
  const placesByOffset = Array.from(frame.places.entries()).sort(
    (a, b) => a[1].offset - b[1].offset,
  );

  const newPlaces = new Map(frame.places);
  let sourceIndex = 0;
  let targetIndex = 0;

  for (const [placeId, placeState] of placesByOffset) {
    const { count, dimensions } = placeState;
    const tokenSize = dimensions;
    const placeSize = count * tokenSize;

    // Copy existing tokens from this place
    for (let i = 0; i < placeSize; i++) {
      newBuffer[targetIndex++] = frame.buffer[sourceIndex++]!;
    }

    // Add new tokens for this place if any
    const newTokens = tokensToAdd.get(placeId);
    if (newTokens) {
      for (const token of newTokens) {
        for (const value of token) {
          newBuffer[targetIndex++] = value;
        }
      }

      // Update this place's count
      newPlaces.set(placeId, {
        ...placeState,
        count: count + newTokens.length,
      });
    }
  }

  // Recalculate all offsets based on the new buffer layout
  let currentOffset = 0;
  for (const [placeId, _placeState] of placesByOffset) {
    const updatedState = newPlaces.get(placeId)!;
    const tokenSize = updatedState.dimensions;
    const placeSize = updatedState.count * tokenSize;

    newPlaces.set(placeId, {
      ...updatedState,
      offset: currentOffset,
    });

    currentOffset += placeSize;
  }

  return {
    ...frame,
    buffer: newBuffer,
    places: newPlaces,
  };
}

/**
 * Result of executing transitions on a frame.
 */
export type ExecuteTransitionsResult = {
  /** The updated simulation frame */
  frame: SimulationFrame;
  /** The updated RNG state after all transitions */
  rngState: number;
  /** Whether any transition fired */
  transitionFired: boolean;
};

/**
 * Executes all transitions sequentially on a simulation frame.
 *
 * This function:
 * 1. Iterates through all transitions in the frame
 * 2. For each transition, computes if it can fire using computePossibleTransition
 * 3. Immediately removes tokens after each transition fires (so subsequent transitions see the updated state)
 * 4. Accumulates all token additions across all transitions
 * 5. At the end, adds all accumulated tokens at once
 *
 * @param frame - The simulation frame to execute transitions on
 * @param simulation - The simulation instance containing compiled functions
 * @param dt - Time step for the simulation
 * @param rngState - Current state of the random number generator
 * @returns Result containing the updated frame, new RNG state, and whether any transition fired
 */
export function executeTransitions(
  frame: SimulationFrame,
  simulation: SimulationInstance,
  dt: number,
  rngState: number,
): ExecuteTransitionsResult {
  // Map to accumulate all tokens to add: PlaceID -> array of token values
  const tokensToAdd = new Map<PlaceID, number[][]>();

  // Keep track of which transitions fired for updating timeSinceLastFiringMs
  const transitionsFired = new Set<ID>();

  // Start with the current frame and update it as transitions fire
  let currentFrame = frame;

  // Track current RNG state
  let currentRngState = rngState;

  // Iterate through all transitions in the frame
  for (const [transitionId, _transitionState] of currentFrame.transitions) {
    // Compute if this transition can fire based on the current state
    const result = computePossibleTransition(
      currentFrame,
      simulation,
      transitionId,
    );

    if (result !== null) {
      // Transition fired!
      transitionsFired.add(transitionId);

      // Update RNG state for deterministic randomness
      currentRngState = result.newRngState;

      // Immediately remove tokens from the current frame
      // Convert the result.remove Record to a Map
      const tokensToRemove = new Map<PlaceID, Set<number> | number>(
        Object.entries(result.remove),
      );
      currentFrame = removeTokensFromSimulationFrame(
        currentFrame,
        tokensToRemove,
      );

      // Accumulate tokens to add
      for (const [placeId, tokenValues] of Object.entries(result.add)) {
        if (!tokensToAdd.has(placeId)) {
          tokensToAdd.set(placeId, []);
        }
        const existingTokens = tokensToAdd.get(placeId)!;
        existingTokens.push(...tokenValues);
      }
    }
  }

  // If no transitions fired, return the original frame with unchanged RNG state
  if (transitionsFired.size === 0) {
    return { frame, rngState, transitionFired: false };
  }

  // Add all new tokens at once
  const newFrame = addTokensToSimulationFrame(currentFrame, tokensToAdd);

  // Update transition timeSinceLastFiringMs, firedInThisFrame, and firingCount
  const newTransitions = new Map(newFrame.transitions);
  for (const [transitionId, transitionState] of newFrame.transitions) {
    if (transitionsFired.has(transitionId)) {
      // Reset time since last firing and increment firing count for transitions that fired
      newTransitions.set(transitionId, {
        ...transitionState,
        timeSinceLastFiringMs: 0,
        firedInThisFrame: true,
        firingCount: transitionState.firingCount + 1,
      });
    } else {
      // Increment time for transitions that didn't fire
      newTransitions.set(transitionId, {
        ...transitionState,
        timeSinceLastFiringMs: transitionState.timeSinceLastFiringMs + dt,
        firedInThisFrame: false,
      });
    }
  }

  return {
    frame: {
      ...newFrame,
      transitions: newTransitions,
      time: frame.time + dt,
    },
    rngState: currentRngState,
    transitionFired: true,
  };
}
