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
 * The list with the term at `from` moved to `to`, the other terms keeping
 * their order; the same list when either position is outside it.
 */
export const moveTerm = (
  terms: readonly PlaceDynamicsTerm[],
  from: number,
  to: number,
): PlaceDynamicsTerm[] => {
  const term = terms[from];
  if (term === undefined || to < 0 || to >= terms.length) {
    return [...terms];
  }
  const moved = [...terms];
  moved.splice(from, 1);
  moved.splice(to, 0, term);
  return moved;
};

/**
 * A stable key per term. The editor adds an equation once, but a file may
 * repeat one; a repeat is keyed by how many times its equation already
 * appeared above it.
 */
export const termKeys = (terms: readonly PlaceDynamicsTerm[]): string[] => {
  const occurrences = new Map<string, number>();
  return terms.map((term) => {
    const seen = occurrences.get(term.differentialEquationId) ?? 0;
    occurrences.set(term.differentialEquationId, seen + 1);
    return `${term.differentialEquationId}#${seen}`;
  });
};

/**
 * The equations the place could add: those of its colour that it does not
 * compose yet.
 */
export const composableEquations = (
  place: Pick<Place, "colorId" | "dynamics">,
  equations: readonly DifferentialEquation[],
): DifferentialEquation[] =>
  place.colorId === null
    ? []
    : equations.filter(
        (equation) =>
          equation.colorId === place.colorId &&
          !placeUsesDifferentialEquation(place, equation.id),
      );

/**
 * The update a change of the place's type implies, or `null` for the same
 * type: the composed equations are over the old type, so they go with it
 * and the dynamics switch off.
 */
export const placeTypeChange = (
  place: Pick<Place, "colorId">,
  nextColorId: ID | null,
): Pick<Place, "colorId" | "dynamicsEnabled" | "dynamics"> | null =>
  nextColorId === place.colorId
    ? null
    : { colorId: nextColorId, dynamicsEnabled: false, dynamics: [] };
