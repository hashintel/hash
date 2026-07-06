/**
 * Shared buffer-ABI transition helpers used by both the single-run engine
 * (`compute-possible-transition.ts`) and the Monte Carlo path
 * (`monte-carlo/transition-effect.ts`).
 *
 * Buffer-ABI lambdas read token attributes at statically-resolved byte
 * offsets from the frame's packed token structs (token format v2) — no
 * per-combination record decoding and no allocation. The per-transition
 * `slotBases` scratch lives on the `CompiledTransition` and is reused across
 * evaluations; the engine is single-threaded per simulation instance.
 */

/**
 * Fills `slotBases` with the base BYTE offset of each selected token within
 * the token region, in slot order (per colored non-inhibitor input arc,
 * `weight` slots each — matching the emitter's layout, see
 * `hir/surface-context.ts`).
 *
 * Returns `false` when the combination does not match the expected slot
 * count (stale artifact) — callers must fall back to the object path.
 */
export function fillSlotBases(
  slotBases: Int32Array,
  combinationIndices: readonly (readonly number[])[],
  places: readonly { byteOffset: number; strideBytes: number }[],
): boolean {
  let slot = 0;
  for (const [placeIndex, tokenIndices] of combinationIndices.entries()) {
    const place = places[placeIndex]!;
    for (const tokenIndex of tokenIndices) {
      if (slot >= slotBases.length) {
        return false;
      }
      // eslint-disable-next-line no-param-reassign -- writes into the reusable scratch buffer
      slotBases[slot] = place.byteOffset + tokenIndex * place.strideBytes;
      slot += 1;
    }
  }
  return slot === slotBases.length;
}
