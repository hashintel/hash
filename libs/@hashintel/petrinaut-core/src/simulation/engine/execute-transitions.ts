import {
  createEngineFrame,
  materializeEngineFrame,
} from "../frames/internal-frame";
import { computePossibleTransition } from "./compute-possible-transition";
import { removeTokensFromSimulationFrame } from "./remove-tokens-from-simulation-frame";

import type { ID } from "../../types/sdcpn";
import type {
  EngineFrame,
  EngineFrameLayout,
  EngineFrameSnapshot,
  SimulationInstance,
} from "./types";

type PlaceID = ID;

/**
 * Adds tokens to multiple places in the simulation frame.
 *
 * Takes an EngineFrame and a Map of Place IDs to arrays of packed token byte
 * blocks, and returns a new EngineFrame with:
 * - The specified tokens appended to each place's section in the buffer
 * - Each place's count incremented by the number of added tokens
 * - All subsequent places' byte offsets adjusted accordingly
 *
 * @param frame - The simulation frame to modify
 * @param tokensToAdd - Map from Place ID to array of token byte blocks to add (each block is one packed token, strideBytes long)
 * @returns A new EngineFrame with the tokens added
 * @throws Error if a place is not found or token byte sizes don't match
 */
function addTokensToSimulationFrame(
  frame: EngineFrame,
  tokensToAdd: Map<PlaceID, Uint8Array[]>,
  layout: EngineFrameLayout,
): EngineFrame {
  // If no tokens to add, return frame as-is
  if (tokensToAdd.size === 0) {
    return frame;
  }

  const snapshot = materializeEngineFrame(layout, frame);

  // Validate all places and token byte sizes first
  for (const [placeId, tokens] of tokensToAdd) {
    const placeState = snapshot.places[placeId];
    if (!placeState) {
      throw new Error(
        `Place with ID ${placeId} not found in simulation frame.`,
      );
    }

    // Validate that all token blocks have the correct byte size
    const expectedStrideBytes = placeState.strideBytes;
    for (const token of tokens) {
      if (token.byteLength !== expectedStrideBytes) {
        throw new Error(
          `Token byte size mismatch for place ${placeId}. Expected ${expectedStrideBytes}, got ${token.byteLength}.`,
        );
      }
    }
  }

  // Calculate total byte size increase needed in buffer
  let totalByteSizeIncrease = 0;
  for (const [placeId, tokens] of tokensToAdd) {
    const placeState = snapshot.places[placeId]!;
    totalByteSizeIncrease += tokens.length * placeState.strideBytes;
  }

  // Create a new buffer with increased size
  const newBuffer = new Uint8Array(
    snapshot.buffer.byteLength + totalByteSizeIncrease,
  );

  // Process places in order of their byte offsets to build the new buffer
  const placesByOffset = Object.entries(snapshot.places).sort(
    (a, b) => a[1].byteOffset - b[1].byteOffset,
  );

  const newPlaces: EngineFrameSnapshot["places"] = { ...snapshot.places };
  let targetByteOffset = 0;

  for (const [placeId, placeState] of placesByOffset) {
    const { count, strideBytes } = placeState;
    const placeByteSize = count * strideBytes;

    // Copy existing tokens from this place, reading at the place's recorded
    // offset rather than a running counter so the copy stays correct even if
    // the source region ever contains gaps.
    if (placeByteSize > 0) {
      newBuffer.set(
        snapshot.buffer.subarray(
          placeState.byteOffset,
          placeState.byteOffset + placeByteSize,
        ),
        targetByteOffset,
      );
      targetByteOffset += placeByteSize;
    }

    // Add new tokens for this place if any
    const newTokens = tokensToAdd.get(placeId);
    if (newTokens) {
      for (const token of newTokens) {
        newBuffer.set(token, targetByteOffset);
        targetByteOffset += token.byteLength;
      }

      // Update this place's count
      newPlaces[placeId] = {
        ...placeState,
        count: count + newTokens.length,
      };
    }
  }

  // Recalculate all byte offsets based on the new buffer layout
  let currentByteOffset = 0;
  for (const [placeId, _placeState] of placesByOffset) {
    const updatedState = newPlaces[placeId]!;
    const placeByteSize = updatedState.count * updatedState.strideBytes;

    newPlaces[placeId] = {
      ...updatedState,
      byteOffset: currentByteOffset,
    };

    currentByteOffset += placeByteSize;
  }

  return createEngineFrame(layout, {
    ...snapshot,
    buffer: newBuffer,
    places: newPlaces,
  });
}

/**
 * Result of executing transitions on a frame.
 */
export type ExecuteTransitionsResult = {
  /** The updated simulation frame */
  frame: EngineFrame;
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
  frame: EngineFrame,
  simulation: SimulationInstance,
  dt: number,
  rngState: number,
): ExecuteTransitionsResult {
  // Map to accumulate all tokens to add: PlaceID -> array of token byte blocks
  const tokensToAdd = new Map<PlaceID, Uint8Array[]>();

  // Keep track of which transitions fired for updating timeSinceLastFiringMs
  const transitionsFired = new Set<ID>();

  // Start with the current frame and update it as transitions fire
  let currentFrame = frame;

  // Track current RNG state
  let currentRngState = rngState;

  // Iterate through all transitions in the frame
  for (const transitionId of simulation.frameLayout.transitionIds) {
    // Compute if this transition can fire based on the current state
    const result = computePossibleTransition(
      currentFrame,
      simulation,
      transitionId,
      currentRngState,
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
        simulation.frameLayout,
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
  const newFrame = addTokensToSimulationFrame(
    currentFrame,
    tokensToAdd,
    simulation.frameLayout,
  );
  const newFrameSnapshot = materializeEngineFrame(
    simulation.frameLayout,
    newFrame,
  );

  // Update transition timeSinceLastFiringMs, firedInThisFrame, and firingCount
  const newTransitions: EngineFrameSnapshot["transitions"] = {
    ...newFrameSnapshot.transitions,
  };
  for (const [transitionId, transitionState] of Object.entries(
    newFrameSnapshot.transitions,
  )) {
    if (transitionsFired.has(transitionId)) {
      // Reset time since last firing and increment firing count for transitions that fired
      newTransitions[transitionId] = {
        ...transitionState,
        timeSinceLastFiringMs: 0,
        firedInThisFrame: true,
        firingCount: transitionState.firingCount + 1,
      };
    } else {
      // Increment time for transitions that didn't fire
      newTransitions[transitionId] = {
        ...transitionState,
        timeSinceLastFiringMs: transitionState.timeSinceLastFiringMs + dt,
        firedInThisFrame: false,
      };
    }
  }

  return {
    frame: createEngineFrame(simulation.frameLayout, {
      ...newFrameSnapshot,
      transitions: newTransitions,
    }),
    rngState: currentRngState,
    transitionFired: true,
  };
}
