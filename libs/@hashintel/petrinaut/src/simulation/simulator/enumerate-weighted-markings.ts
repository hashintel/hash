/* eslint-disable id-length */
type PlaceSpec = {
  count: number; // number of tokens in this place
  weight: number; // how many tokens to pick
};

/**
 * Generate all k-combinations of indices [0..n-1].
 * Example: indexCombinations(3, 2) -> [ [0,1], [0,2], [1,2] ]
 */
function indexCombinations(n: number, k: number): number[][] {
  if (k === 0) {
    return [[]];
  }
  if (k > n) {
    return [];
  }

  const result: number[][] = [];

  function backtrack(start: number, combo: number[]) {
    if (combo.length === k) {
      result.push(combo.slice());
      return;
    }

    for (let i = start; i <= n - (k - combo.length); i++) {
      combo.push(i);
      backtrack(i + 1, combo);
      combo.pop();
    }
  }

  backtrack(0, []);
  return result;
}

/**
 * Enumerate all weighted combinations, returning indices only.
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
  // 1. combinations per place (of indices)
  const perPlaceCombos = places.map((p) =>
    indexCombinations(p.count, p.weight),
  );

  // 2. check for invalid places
  if (perPlaceCombos.some((set) => set.length === 0)) {
    return [];
  }

  // 3. Cartesian product
  let acc: number[][] = [[]];
  for (const comboSet of perPlaceCombos) {
    const nextAcc: number[][] = [];
    for (const partial of acc) {
      for (const combo of comboSet) {
        nextAcc.push([...partial, ...combo]);
      }
    }
    acc = nextAcc;
  }

  return acc;
}

export function* enumerateWeightedMarkingIndicesGenerator(
  places: PlaceSpec[],
): Generator<number[][], void, undefined> {
  const perPlaceCombos = places.map((p) =>
    indexCombinations(p.count, p.weight),
  );

  if (perPlaceCombos.some((set) => set.length === 0)) {
    return;
  }

  if (perPlaceCombos.length === 0) {
    yield [];
    return;
  }

  const current: number[][] = [];

  function* backtrack(index: number): Generator<number[][], void, undefined> {
    if (index === perPlaceCombos.length) {
      yield current.map((combo) => combo.slice());
      return;
    }

    for (const combo of perPlaceCombos[index]!) {
      current.push(combo);
      yield* backtrack(index + 1);
      current.pop();
    }
  }

  yield* backtrack(0);
}
