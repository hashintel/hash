import type { DifferentialEquationFn } from "./types";

/**
 * One derivative function for a place that composes several differential
 * equations: the sum of every term's derivatives, each over the same token
 * region and laid out the same way (`tokens × real fields`). A single term
 * is returned as it is, so a place with one equation pays nothing for the
 * composition.
 */
export const composeDerivatives = (
  terms: readonly DifferentialEquationFn[],
): DifferentialEquationFn => {
  const [first, ...rest] = terms;
  if (first === undefined) {
    throw new Error("A place's dynamics compose at least one equation");
  }
  if (rest.length === 0) {
    return first;
  }
  return (placeBytes, numberOfTokens) => {
    // The first term's result is a fresh buffer the program allocated for
    // this call, so the sum accumulates into it.
    const sum = first(placeBytes, numberOfTokens);
    for (const term of rest) {
      const derivatives = term(placeBytes, numberOfTokens);
      for (let index = 0; index < sum.length; index++) {
        sum[index] = (sum[index] ?? 0) + (derivatives[index] ?? 0);
      }
    }
    return sum;
  };
};
