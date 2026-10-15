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

export type FindResult<Kind extends PayloadKind> =
  | {
      status: "success";
      match?: { kind: Kind; value: PayloadKindValues[Kind] };
    }
  | ConditionError;

/**
 * The first item that matches the condition, in input order, or the first item when there is no condition. Items
 * after the match aren't evaluated. An empty list, or one where nothing matches, has no match.
 */
export const find = <Kind extends PayloadKind>(
  input: FilterListPayload<Kind>,
  condition?: FilterCondition,
  context?: ConditionContext,
): FindResult<Kind> => {
  const error = condition && validateCondition(condition, input.kind);
  if (error) {
    return error;
  }
  for (const value of input.value) {
    if (!condition) {
      return { status: "success", match: { kind: input.kind, value } };
    }
    const result = evaluateValidatedCondition(
      condition,
      { kind: input.kind, value },
      context,
    );
    if (result.status === "error") {
      return result;
    }
    if (result.matches) {
      return { status: "success", match: { kind: input.kind, value } };
    }
  }
  return { status: "success" };
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
