import {
  createEngineFrame,
  materializeEngineFrame,
} from "../frames/internal-frame";

import type {
  EngineFrame,
  EngineFrameLayout,
  EngineFrameSnapshot,
} from "./types";

/**
 * Removes tokens from multiple places in the simulation frame.
 *
 * Takes an EngineFrame and a Map of Place IDs to Sets of token indices to remove,
 * and returns a new EngineFrame with:
 * - The specified tokens removed from each place's section in the buffer
 * - Each place's count decremented by the number of removed tokens
 * - All places' offsets adjusted accordingly
 *
 * The token indices in each Set should be relative to the place (not global buffer indices).
 *
 * @param frame - The simulation frame to modify
 * @param tokensToRemove - Map from Place ID to Set of token indices to remove from that place
 * @returns A new EngineFrame with the tokens removed
 * @throws Error if a place is not found or indices are invalid
 */
export function removeTokensFromSimulationFrame(
  frame: EngineFrame,
  tokensToRemove: Map<string, Set<number> | number>,
  layout: EngineFrameLayout,
): EngineFrame {
  // If no tokens to remove, return frame as-is
  if (tokensToRemove.size === 0) {
    return frame;
  }

  const snapshot = materializeEngineFrame(layout, frame);

  // Validate all places and indices first
  for (const [placeId, indices] of tokensToRemove) {
    const placeState = snapshot.places[placeId];
    if (!placeState) {
      throw new Error(
        `Place with ID ${placeId} not found in simulation frame.`,
      );
    }

    // If zero stride (no type), we expect indices to be a number (count to remove)
    if (placeState.strideBytes === 0) {
      if (typeof indices !== "number") {
        throw new Error(
          `For place ${placeId} with zero stride (uncoloured), expected number of tokens to remove, got Set.`,
        );
      }
      continue; // No further validation needed for zero-stride places
    } else {
      if (typeof indices === "number") {
        throw new Error(
          `For place ${placeId} with dimensions, expected Set of token indices to remove, got number.`,
        );
      }

      // Check that all indices are valid
      for (const index of indices) {
        if (index < 0 || index >= placeState.count) {
          throw new Error(
            `Invalid token index ${index} for place ${placeId}. Place has ${placeState.count} tokens.`,
          );
        }
      }
    }
  }

  // Compute the removed byte size to allocate the compacted buffer
  let removedByteSize = 0;
  for (const [placeId, indices] of tokensToRemove) {
    const placeState = snapshot.places[placeId]!;
    if (typeof indices !== "number") {
      removedByteSize += indices.size * placeState.strideBytes;
    }
  }

  // Create a new buffer without the removed tokens, compacting each place's
  // kept tokens as contiguous byte ranges
  const newBuffer = new Uint8Array(
    snapshot.buffer.byteLength - removedByteSize,
  );

  // Process places in order of their byte offsets
  const placesByOffset = Object.entries(snapshot.places).sort(
    (a, b) => a[1].byteOffset - b[1].byteOffset,
  );

  const newPlaces: EngineFrameSnapshot["places"] = { ...snapshot.places };
  let writeByteOffset = 0;

  for (const [placeId, placeState] of placesByOffset) {
    const { byteOffset, count, strideBytes } = placeState;
    const entryInMap = tokensToRemove.get(placeId);

    if (strideBytes === 0) {
      const removedCount = typeof entryInMap === "number" ? entryInMap : 0;
      newPlaces[placeId] = {
        ...placeState,
        byteOffset: writeByteOffset,
        count: count - removedCount,
      };
      continue;
    }

    const removedIndices =
      entryInMap instanceof Set ? entryInMap : new Set<number>();
    const newPlaceByteOffset = writeByteOffset;
    let keptCount = 0;

    for (let tokenIndex = 0; tokenIndex < count; tokenIndex++) {
      if (removedIndices.has(tokenIndex)) {
        continue;
      }

      const tokenByteOffset = byteOffset + tokenIndex * strideBytes;
      newBuffer.set(
        snapshot.buffer.subarray(
          tokenByteOffset,
          tokenByteOffset + strideBytes,
        ),
        writeByteOffset,
      );
      writeByteOffset += strideBytes;
      keptCount++;
    }

    newPlaces[placeId] = {
      ...placeState,
      byteOffset: newPlaceByteOffset,
      count: keptCount,
    };
  }

  // Return new frame with updated buffer and places
  return createEngineFrame(layout, {
    ...snapshot,
    buffer: newBuffer,
    places: newPlaces,
  });
}
