type PlaceSpec = {
  count: number; // number of tokens in this place
  weight: number; // how many tokens to pick
};

/* eslint-disable no-param-reassign -- rewriting the caller's reusable
   combination array in place is the point of these helpers: enumeration must
   not allocate per combination */
/**
 * Reset `combo` to the first k-combination of `[0..n-1]` in lexicographic
 * order: `[0, 1, ..., k-1]`. Returns false when no combination exists
 * (`k > n`).
 */
function firstIndexCombination(combo: number[], n: number, k: number): boolean {
  if (k > n) {
    return false;
  }
  combo.length = k;
  for (let index = 0; index < k; index++) {
    combo[index] = index;
  }
  return true;
}

/**
 * Advance `combo` to its lexicographic successor over `[0..n-1]`, in place.
 * Returns false when `combo` is the last combination.
 */
function nextIndexCombination(combo: number[], n: number): boolean {
  const k = combo.length;
  for (let index = k - 1; index >= 0; index--) {
    if (combo[index]! < n - k + index) {
      combo[index]!++;
      for (let rest = index + 1; rest < k; rest++) {
        combo[rest] = combo[rest - 1]! + 1;
      }
      return true;
    }
  }
  return false;
}
/* eslint-enable no-param-reassign */

/**
 * Enumerate every weighted marking lazily: one k-combination of token indices
 * per place, in lexicographic order per place, with the last place advancing
 * fastest.
 *
 * Nothing is materialised up front — a place holding `n` tokens under a
 * weight-`w` arc has `C(n, w)` combinations, and building them eagerly made
 * transition evaluation quadratic in the token count (see "Weighted-arc
 * enumeration" in
 * `libs/@local/petrinaut-arch-docs/content/simulation/performance.mdx`).
 * Cost is proportional to the combinations the caller actually consumes.
 *
 * The enumeration order is a contract: the engine fires the first passing
 * combination, so a different order changes which tokens a firing consumes
 * and diverges seeded trajectories, and `webgpu/pair-selection.ts` reproduces
 * this order on the GPU by combinatorial unranking.
 *
 * The yielded array and its inner arrays are reused between iterations.
 * Copy anything kept past the next `next()` call; both engines copy on
 * accept and stop iterating.
 */
export function* enumerateWeightedMarkingIndicesGenerator(
  places: PlaceSpec[],
): Generator<number[][], void, undefined> {
  if (places.length === 0) {
    yield [];
    return;
  }

  const current: number[][] = places.map(() => []);
  for (let place = 0; place < places.length; place++) {
    const { count, weight } = places[place]!;
    if (!firstIndexCombination(current[place]!, count, weight)) {
      return;
    }
  }

  for (;;) {
    yield current;

    let place = places.length - 1;
    while (
      place >= 0 &&
      !nextIndexCombination(current[place]!, places[place]!.count)
    ) {
      firstIndexCombination(
        current[place]!,
        places[place]!.count,
        places[place]!.weight,
      );
      place--;
    }
    if (place < 0) {
      return;
    }
  }
}

/**
 * Enumerate all weighted combinations eagerly, returning indices only.
 *
 * Each marking is a flat array of indices, concatenated per place.
 *
 * Example:
 *   [
 *     { tokenCount: 3, weight: 2 },
 *     { tokenCount: 3, weight: 2 }
 *   ]
 * -> [
 *     [0,1,0,1], [0,1,0,2], [0,1,1,2],
 *     [0,2,0,1], [0,2,0,2], [0,2,1,2],
 *     [1,2,0,1], [1,2,0,2], [1,2,1,2]
 *   ]
 */
export function enumerateWeightedMarkingIndices(
  places: PlaceSpec[],
): number[][] {
  const result: number[][] = [];
  for (const marking of enumerateWeightedMarkingIndicesGenerator(places)) {
    result.push(marking.flat());
  }
  return result;
}
