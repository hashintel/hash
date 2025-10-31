import type { SimulationFrame } from "../types";

/**
 * Removes tokens from multiple places in the simulation frame.
 *
 * Takes a SimulationFrame and a Map of Place IDs to Sets of token indices to remove,
 * and returns a new SimulationFrame with:
 * - The specified tokens removed from each place's section in the buffer
 * - Each place's count decremented by the number of removed tokens
 * - All places' offsets adjusted accordingly
 *
 * The token indices in each Set should be relative to the place (not global buffer indices).
 *
 * @param frame - The simulation frame to modify
 * @param tokensToRemove - Map from Place ID to Set of token indices to remove from that place
 * @returns A new SimulationFrame with the tokens removed
 * @throws Error if a place is not found or indices are invalid
 */
export function removeTokensFromSimulationFrame(
  frame: SimulationFrame,
  tokensToRemove: Map<string, Set<number>>
): SimulationFrame {
  // If no tokens to remove, return frame as-is
  if (tokensToRemove.size === 0) {
    return frame;
  }

  // Validate all places and indices first
  for (const [placeId, indices] of tokensToRemove) {
    const placeState = frame.places.get(placeId);
    if (!placeState) {
      throw new Error(
        `Place with ID ${placeId} not found in simulation frame.`
      );
    }

    // Check that all indices are valid
    for (const index of indices) {
      if (index < 0 || index >= placeState.count) {
        throw new Error(
          `Invalid token index ${index} for place ${placeId}. Place has ${placeState.count} tokens.`
        );
      }
    }
  }

  // Build a set of all global buffer indices to remove
  const globalIndicesToRemove = new Set<number>();

  for (const [placeId, indices] of tokensToRemove) {
    const placeState = frame.places.get(placeId)!;
    const { offset } = placeState;
    const tokenSize = placeState.instance.dimensions;

    for (const tokenIndex of indices) {
      const tokenStartOffset = offset + tokenIndex * tokenSize;
      for (let i = 0; i < tokenSize; i++) {
        globalIndicesToRemove.add(tokenStartOffset + i);
      }
    }
  }

  // Create a new buffer without the removed tokens
  const newBufferSize = frame.buffer.length - globalIndicesToRemove.size;
  const newBuffer = new Float64Array(newBufferSize);

  // Copy buffer excluding removed indices
  let newBufferIndex = 0;
  for (let i = 0; i < frame.buffer.length; i++) {
    if (!globalIndicesToRemove.has(i)) {
      newBuffer[newBufferIndex++] = frame.buffer[i]!;
    }
  }

  // Calculate offset adjustments for each place
  // We need to track cumulative size removed before each place's offset
  const placesByOffset = Array.from(frame.places.entries()).sort(
    (a, b) => a[1].offset - b[1].offset
  );

  const newPlaces = new Map(frame.places);
  let cumulativeRemoved = 0;

  for (const [placeId, placeState] of placesByOffset) {
    const { offset, count, instance } = placeState;
    const tokenSize = instance.dimensions;

    // Count how many tokens are being removed from this place
    const tokensRemovedFromPlace = tokensToRemove.get(placeId)?.size ?? 0;
    const sizeRemovedFromPlace = tokensRemovedFromPlace * tokenSize;

    // Update this place with adjusted offset and count
    newPlaces.set(placeId, {
      ...placeState,
      offset: offset - cumulativeRemoved,
      count: count - tokensRemovedFromPlace,
    });

    // Add this place's removed size to cumulative for next places
    cumulativeRemoved += sizeRemovedFromPlace;
  }

  // Return new frame with updated buffer and places
  return {
    ...frame,
    buffer: newBuffer,
    places: newPlaces,
  };
}
