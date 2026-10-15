import { conditionLeaves, validateCondition } from "./filter-condition.js";
import { validateSortKey } from "./sort-key.js";

import type { FilterCondition } from "./filter-condition.js";
import type { SortKey } from "./sort-key.js";
import type { ActionStepCheck } from "./types.js";

/** The most entities a Query entities step returns, and the most it reads to sort them. */
export const maxQueryEntities = 100_000;

/**
 * Checks the filter of a Query entities step: a condition on an entity's types and properties, so that it can be
 * translated into a graph filter. Run when the flow is defined, and by the step.
 */
export const validateQueryFilter = (
  filter: FilterCondition,
): string | undefined => {
  const error = validateCondition(filter, "EntityId");
  if (error) {
    return error.message;
  }
  if (
    conditionLeaves(filter).some(
      ({ subject }) =>
        subject.kind !== "entityType" && subject.kind !== "entityProperty",
    )
  ) {
    return "A query can only filter on an entity's types and properties.";
  }
  return undefined;
};

/** Checks the sort keys of a Query entities step, each of which must read an entity property. */
export const validateQuerySort = (
  sort: readonly SortKey[],
): string | undefined =>
  sort
    .map((sortKey) => validateSortKey(sortKey, "EntityId")?.message)
    .find((message) => message !== undefined);

/** Checks the limit of a Query entities step: a whole number from 1 to {@link maxQueryEntities}. */
export const validateQueryLimit = (limit: number): string | undefined =>
  Number.isInteger(limit) && limit >= 1 && limit <= maxQueryEntities
    ? undefined
    : `The limit must be a whole number from 1 to ${maxQueryEntities.toLocaleString("en")}.`;

/**
 * Checks a Query entities step when the flow is defined. The filter must be a constant for now. A sort or limit from
 * an earlier step is checked by the step when it runs.
 */
export const checkQueryEntitiesInputs: ActionStepCheck = ({ step, report }) => {
  const { filter, sort, limit } = step.inputs;

  /*
   * A missing filter is reported as a missing input, and a constant of another kind or shape as an incompatible
   * connection.
   */
  if (filter && filter.kind !== "constant") {
    report("filter", "The filter must be a constant for now");
  } else if (filter?.payload.kind === "FilterCondition") {
    const error = validateQueryFilter(filter.payload.value as FilterCondition);
    if (error) {
      report("filter", error);
    }
  }

  if (
    sort?.kind === "constant" &&
    sort.payload.kind === "SortKey" &&
    Array.isArray(sort.payload.value)
  ) {
    const error = validateQuerySort(sort.payload.value as SortKey[]);
    if (error) {
      report("sort", error);
    }
  }

  if (
    limit?.kind === "constant" &&
    limit.payload.kind === "Number" &&
    typeof limit.payload.value === "number"
  ) {
    const error = validateQueryLimit(limit.payload.value);
    if (error) {
      report("limit", error);
    }
  }
};
