import { enumerateWeightedMarkingIndices } from "./enumerate-weighted-markings";

export type TransitionTokenCombination<TToken> = {
  placeId: string;
  tokenIndices: number[];
  tokens: TToken[];
};

/**
 * Compute the hazard rate (λ) for every combination of tokens that can enable a transition.
 *
 * A transition may require multiple tokens per input place (or even zero). For each place we:
 *   1. Enumerate every unique combination of tokens that satisfies its weight (requirement).
 *   2. Take the Cartesian product across all input places, giving every possible joint marking.
 *   3. Invoke `lambda` with the concrete token data for that joint marking.
 *
 * The caller provides the available tokens per place, the number of tokens that must be selected
 * (weight), and a user supplied `lambda` function that evaluates the hazard for a specific
 * combination of tokens.
 *
 * @returns One entry per joint combination, preserving the ordering returned by
 *          `enumerateWeightedMarkingIndices`.
 */
export function computeHazardRate<TToken>({
  inputs,
  lambda,
}: {
  inputs: Array<TransitionInputTokens<TToken>>;
  lambda: HazardRateLambda<TToken>;
}): Array<HazardRateResult<TToken>> {
  if (inputs.length === 0) {
    return [
      {
        combination: [],
        hazardRate: lambda({ combination: [] }),
      },
    ];
  }

  const placeSpecs = inputs.map((input) => ({
    tokenCount: input.tokens.length,
    weight: input.weight,
  }));

  const enumerated = enumerateWeightedMarkingIndices(placeSpecs);

  if (enumerated.length === 0) {
    return [];
  }

  // Pre-compute offsets into the flattened index combinations so we can slice quickly per place.
  const offsets: number[] = [];
  let runningOffset = 0;
  for (const input of inputs) {
    offsets.push(runningOffset);
    runningOffset += input.weight;
  }

  return enumerated.map((flatCombination) => {
    const combination = inputs.map<TransitionTokenCombination<TToken>>(
      (input, index) => {
        const start = offsets[index] ?? 0;
        const end = start + input.weight;
        const tokenIndices = flatCombination.slice(start, end);
        const tokens = tokenIndices.map(
          (tokenIndex) => input.tokens[tokenIndex]!,
        );

        return {
          placeId: input.placeId,
          tokenIndices,
          tokens,
        };
      },
    );

    const hazardRate = lambda({ combination });

    return {
      combination,
      hazardRate,
    };
  });
}
