import { conditionLeaves, validateCondition } from "./filter-condition.js";
import { maxEntitiesPerStep } from "./limits.js";
import { validateSortKey } from "./sort-key.js";

import type { ConditionNode, FilterCondition } from "./filter-condition.js";
import type { SortKey } from "./sort-key.js";
import type { ActionStepCheck } from "./types.js";

const hasTypeCondition = (node: ConditionNode) =>
  conditionLeaves(node).some(({ operator }) => operator === "isOfType");

/**
 * Whether a node requires at most one entity type at a time, and never the absence of one. The graph matches an
 * entity's own types one at a time, so it can't tell that an entity has two types, nor that it lacks one when it has
 * others.
 */
const requiresOneTypeAtATime = (node: ConditionNode): boolean => {
  switch (node.kind) {
    case "condition":
      return true;
    case "not":
      return !hasTypeCondition(node.condition);
    case "any":
      return node.conditions.every(requiresOneTypeAtATime);
    case "all":
      return (
        node.conditions.every(requiresOneTypeAtATime) &&
        node.conditions.filter(hasTypeCondition).length <= 1
      );
  }
};

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
  if (!requiresOneTypeAtATime(filter)) {
    return 'A query can\'t negate an entity type condition, or require two in an "all" group. Use "any" to match one of several types.';
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

/** Checks the limit of a Query entities step: a whole number from 1 to {@link maxEntitiesPerStep}. */
export const validateQueryLimit = (limit: number): string | undefined =>
  Number.isInteger(limit) && limit >= 1 && limit <= maxEntitiesPerStep
    ? undefined
    : `The limit must be a whole number from 1 to ${maxEntitiesPerStep.toLocaleString("en")}.`;

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
