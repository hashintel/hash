/**
 * Pure transitions over a place's composed dynamics terms, the list the
 * Composed dynamics subview edits. Each returns a new list; the subview
 * writes it back through `updatePlace`.
 */
import { placeUsesDifferentialEquation } from "@hashintel/petrinaut-core";

import type {
  DifferentialEquation,
  ID,
  Place,
  PlaceDynamicsTerm,
} from "@hashintel/petrinaut-core";

export const addTerm = (
  terms: readonly PlaceDynamicsTerm[],
  equationId: ID,
): PlaceDynamicsTerm[] => [...terms, { differentialEquationId: equationId }];

export const removeTerm = (
  terms: readonly PlaceDynamicsTerm[],
  index: number,
): PlaceDynamicsTerm[] =>
  terms.filter((_term, termIndex) => termIndex !== index);

/**
 * The list with the term at `index` swapped one position up (`-1`) or down
 * (`1`); the same list when the move would leave the list.
 */
export const moveTerm = (
  terms: readonly PlaceDynamicsTerm[],
  index: number,
  direction: -1 | 1,
): PlaceDynamicsTerm[] => {
  const target = index + direction;
  const term = terms[index];
  const other = terms[target];
  if (term === undefined || other === undefined) {
    return [...terms];
  }
  const moved = [...terms];
  moved[index] = other;
  moved[target] = term;
  return moved;
};

/**
 * The equations the place could add: those of its colour that it does not
 * compose yet, as the selected equation or as a term.
 */
export const composableEquations = (
  place: Pick<Place, "colorId" | "differentialEquationId" | "dynamics">,
  equations: readonly DifferentialEquation[],
): DifferentialEquation[] =>
  place.colorId === null
    ? []
    : equations.filter(
        (equation) =>
          equation.colorId === place.colorId &&
          !placeUsesDifferentialEquation(place, equation.id),
      );

/** How the equation sees tokens: "Whole place", "1 token", "2 tokens". */
export const describeEquationForm = (
  equation: Pick<DifferentialEquation, "arity">,
): string =>
  equation.arity === undefined
    ? "Whole place"
    : `${equation.arity} token${equation.arity === 1 ? "" : "s"}`;
