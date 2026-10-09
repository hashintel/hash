import {
  evaluateCondition,
  evaluateValidatedCondition,
  validateCondition,
} from "./evaluate-condition.js";

import type {
  ConditionContext,
  ConditionError,
  FilterCondition,
} from "./evaluate-condition.js";
import type {
  PayloadKind,
  PayloadKindValues,
} from "@local/hash-isomorphic-utils/flows/types";

export type FilterPayload<Kind extends PayloadKind> = {
  kind: Kind;
  value: PayloadKindValues[Kind];
};
export type FilterListPayload<Kind extends PayloadKind> = {
  kind: Kind;
  value: readonly PayloadKindValues[Kind][];
};

export type IfResult<Kind extends PayloadKind> =
  | { status: "success"; outputName: "true"; payload: FilterPayload<Kind> }
  | { status: "success"; outputName: "false"; payload: FilterPayload<Kind> }
  | ConditionError;

export type FilterListResult<Kind extends PayloadKind> =
  | {
      status: "success";
      matching: FilterListPayload<Kind>;
      nonMatching: FilterListPayload<Kind>;
    }
  | ConditionError;

/** Returns exactly one output, preserving the original payload rather than the subject. */
export const evaluateIf = <Kind extends PayloadKind>(
  input: FilterPayload<Kind>,
  condition: FilterCondition,
  context?: ConditionContext,
): IfResult<Kind> => {
  const result = evaluateCondition(condition, input, context);
  return result.status === "error"
    ? result
    : {
        status: "success",
        outputName: result.matches ? "true" : "false",
        payload: input,
      };
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
