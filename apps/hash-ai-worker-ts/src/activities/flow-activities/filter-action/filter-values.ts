import { validateCondition } from "@local/hash-isomorphic-utils/flows/filter-condition";

import {
  evaluateCondition,
  evaluateValidatedCondition,
} from "./evaluate-condition.js";

import type { ConditionContext, ConditionInput } from "./evaluate-condition.js";
import type {
  ConditionError,
  FilterCondition,
} from "@local/hash-isomorphic-utils/flows/filter-condition";
import type {
  PayloadKind,
  PayloadKindValues,
} from "@local/hash-isomorphic-utils/flows/types";

export type FilterListPayload<Kind extends PayloadKind> = {
  kind: Kind;
  value: readonly PayloadKindValues[Kind][];
};

export type IfResult =
  | { status: "success"; outputName: "true" | "false" }
  | ConditionError;

type FilteredPayload<Kind extends PayloadKind> = {
  kind: Kind;
  value: PayloadKindValues[Kind][];
};

export type FilterListResult<Kind extends PayloadKind> =
  | {
      status: "success";
      matching: FilteredPayload<Kind>;
      nonMatching: FilteredPayload<Kind>;
    }
  | ConditionError;

/**
 * Picks the one output If produces. It only reads the resolved input: the caller emits its original
 * payload, which may be a stored reference, unchanged on that output.
 */
export const evaluateIf = (
  input: ConditionInput,
  condition: FilterCondition,
  context?: ConditionContext,
): IfResult => {
  const result = evaluateCondition(condition, input, context);
  return result.status === "error"
    ? result
    : { status: "success", outputName: result.matches ? "true" : "false" };
};

/** Stable partition. Empty inputs still validate; errors never return partial outputs. */
export const filterList = <Kind extends PayloadKind>(
  input: FilterListPayload<Kind>,
  condition: FilterCondition,
  context?: ConditionContext,
): FilterListResult<Kind> => {
  const error = validateCondition(condition, input.kind);
  if (error) {
    return error;
  }
  const matching: PayloadKindValues[Kind][] = [];
  const nonMatching: PayloadKindValues[Kind][] = [];
  for (const value of input.value) {
    const result = evaluateValidatedCondition(
      condition,
      { kind: input.kind, value },
      context,
    );
    if (result.status === "error") {
      return result;
    }
    (result.matches ? matching : nonMatching).push(value);
  }
  return {
    status: "success",
    matching: { kind: input.kind, value: matching },
    nonMatching: { kind: input.kind, value: nonMatching },
  };
};
