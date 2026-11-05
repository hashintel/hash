import { maxEntitiesPerStep } from "./limits.js";

import type { ActionStepCheck } from "./types.js";

/**
 * Checks the limit of a Query Entities step's query: a whole number from 1 to `maxEntitiesPerStep`. Run when the flow
 * is defined for a constant query, and by the step for a query from an earlier step.
 */
export const validateQueryLimit = (limit: number): string | undefined =>
  Number.isInteger(limit) && limit >= 1 && limit <= maxEntitiesPerStep
    ? undefined
    : `The limit must be a whole number from 1 to ${maxEntitiesPerStep.toLocaleString("en")}.`;

/** Checks the limit of a Query Entities step's constant `query` when the flow is defined, reporting it at the limit. */
export const checkQueryInput: ActionStepCheck = ({ step, report }) => {
  const source = step.inputs.query;

  /*
   * A query of another shape is reported as an incompatible connection, and a limit that isn't a whole number of 0
   * or more as an invalid constant.
   */
  if (source?.kind !== "constant" || source.payload.kind !== "EntityQuery") {
    return;
  }

  const { value } = source.payload;
  const limit =
    typeof value === "object" && value !== null && "limit" in value
      ? value.limit
      : undefined;

  if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 0) {
    return;
  }

  const error = validateQueryLimit(limit);

  if (error) {
    report("query", error, ["payload", "value", "limit"]);
  }
};
