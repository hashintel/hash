import {
  hasOnlyKeys,
  isRecord,
  readTarget,
  toSubject,
} from "../shared/condition-targets";

import type { ConditionTarget } from "../shared/condition-targets";
import type { Aggregation } from "@local/hash-isomorphic-utils/flows/aggregation";

export type AggregationOperation = Aggregation["operation"];

/** In the order Calculate lists them. */
export const aggregationOperations: {
  value: AggregationOperation;
  text: string;
}[] = [
  { value: "count", text: "Count" },
  { value: "sum", text: "Sum" },
  { value: "average", text: "Average" },
  { value: "min", text: "Minimum" },
  { value: "max", text: "Maximum" },
];

/** Count, or an operation on a number that may not be picked yet. */
export type AggregationForm =
  | { operation: "count" }
  | {
      operation: Exclude<AggregationOperation, "count">;
      targetKey: string | null;
    };

/** Operations other than count read a number. */
export const isNumberTarget = (target: ConditionTarget) =>
  target.valueKind.kind === "Number";

/** Reads a saved aggregation back, or `null` if the fields can't show it, such as one on a field of the items. */
export const readAggregationForm = (
  aggregation: unknown,
  targets: ReadonlyMap<string, ConditionTarget>,
): AggregationForm | null => {
  if (!isRecord(aggregation)) {
    return null;
  }

  const { operation } = aggregation;

  if (operation === "count") {
    return hasOnlyKeys(aggregation, ["operation"]) ? { operation } : null;
  }

  if (
    (operation !== "sum" &&
      operation !== "average" &&
      operation !== "min" &&
      operation !== "max") ||
    !hasOnlyKeys(aggregation, ["operation", "subject"])
  ) {
    return null;
  }

  const target = readTarget(aggregation.subject, targets);

  return target && isNumberTarget(target)
    ? { operation, targetKey: target.key }
    : null;
};

/** The aggregation the step runs, or `null` until an operation other than count has a number to read. */
export const toAggregation = (
  form: AggregationForm,
  targets: ReadonlyMap<string, ConditionTarget>,
): Aggregation | null => {
  if (form.operation === "count") {
    return { operation: "count" };
  }

  const target =
    form.targetKey === null ? undefined : targets.get(form.targetKey);

  return target
    ? { operation: form.operation, subject: toSubject(target) }
    : null;
};
