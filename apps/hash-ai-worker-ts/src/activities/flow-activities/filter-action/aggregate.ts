import { validateAggregation } from "@local/hash-isomorphic-utils/flows/aggregation";

import { resolveSubject } from "./evaluate-condition.js";

import type { ConditionContext } from "./evaluate-condition.js";
import type { FilterListPayload } from "./filter-values.js";
import type {
  Aggregation,
  AggregationError,
} from "@local/hash-isomorphic-utils/flows/aggregation";
import type { ConditionError } from "@local/hash-isomorphic-utils/flows/filter-condition";
import type { PayloadKind } from "@local/hash-isomorphic-utils/flows/types";

export type AggregateResult =
  | { status: "success"; result?: number }
  | ConditionError
  | AggregationError;

/**
 * Sum, average, min and max read a Number from each item, ignoring missing and empty values (undefined, null or "").
 * With no values, sum gives 0, and average, min and max give no result. Errors never return a result: a value that
 * isn't a finite number, a property with several values, or an entity that isn't in `context` (one the user can't
 * read). The activity counts a list itself, from its length.
 */
export const aggregate = (
  input: FilterListPayload<PayloadKind>,
  aggregation: Exclude<Aggregation, { operation: "count" }>,
  context: ConditionContext = {},
): AggregateResult => {
  const error = validateAggregation(aggregation, input.kind);
  if (error) {
    return error;
  }
  const { operation, subject } = aggregation;

  const values: number[] = [];
  for (const item of input.value) {
    const resolved = resolveSubject(
      subject,
      { kind: input.kind, value: item },
      context,
    );
    if (resolved.status === "error") {
      return resolved;
    }
    const { value } = resolved;
    if (Array.isArray(value)) {
      return {
        status: "error",
        code: "invalidValue",
        message: "The value to aggregate has several values.",
      };
    }
    if (value === undefined || value === null || value === "") {
      continue;
    }
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return {
        status: "error",
        code: "invalidValue",
        message: "The value to aggregate does not have kind Number.",
      };
    }
    values.push(value);
  }

  const sum = values.reduce((total, value) => total + value, 0);

  if (operation === "sum") {
    return { status: "success", result: sum };
  }
  /* Average, min and max of no values are missing, so steps reading `result` with `whenMissing: "skip"` are skipped. */
  if (values.length === 0) {
    return { status: "success" };
  }
  switch (operation) {
    case "average":
      return { status: "success", result: sum / values.length };
    /* Reduced rather than spread into Math.min and Math.max, which run out of stack on very long lists. */
    case "min":
      return {
        status: "success",
        result: values.reduce((min, value) => Math.min(min, value)),
      };
    case "max":
      return {
        status: "success",
        result: values.reduce((max, value) => Math.max(max, value)),
      };
  }
};
