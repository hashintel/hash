import { filterableKinds, validateSubject } from "./filter-condition.js";

import type { ConditionSubject } from "./filter-condition.js";
import type { ActionStepCheck, PayloadKind } from "./types.js";

/**
 * How Aggregate turns a list into one number: its length, or the sum, average, minimum or maximum of a Number read
 * from each item, as in a filter condition.
 */
export type Aggregation =
  | { operation: "count" }
  | {
      operation: "sum" | "average" | "min" | "max";
      subject: Exclude<ConditionSubject, { kind: "entityType" }>;
    };

const aggregationOperations: readonly string[] = [
  "count",
  "sum",
  "average",
  "min",
  "max",
] satisfies Aggregation["operation"][];

export type AggregationError = {
  status: "error";
  code: "invalidAggregation";
  message: string;
};

const invalidAggregation = (message: string): AggregationError => ({
  status: "error",
  code: "invalidAggregation",
  message,
});

/**
 * Checks an aggregation against the kind of the items it aggregates. Run when the flow is defined for a constant
 * aggregation, and by the step for one from an earlier step.
 */
export const validateAggregation = (
  aggregation: Aggregation,
  itemKind: PayloadKind,
): AggregationError | undefined => {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Persisted definitions may be malformed.
  if (typeof aggregation !== "object" || aggregation === null) {
    return invalidAggregation("An aggregation must be an object.");
  }
  if (!(filterableKinds as readonly PayloadKind[]).includes(itemKind)) {
    return invalidAggregation(`${itemKind} payloads cannot be aggregated.`);
  }
  if (!aggregationOperations.includes(aggregation.operation)) {
    return invalidAggregation(
      `An aggregation's operation must be one of ${aggregationOperations.join(", ")}.`,
    );
  }
  if (aggregation.operation === "count") {
    return "subject" in aggregation
      ? invalidAggregation("A count aggregation takes no subject.")
      : undefined;
  }
  const { subject } = aggregation;
  const subjectError = validateSubject(subject, itemKind);
  if (subjectError) {
    return invalidAggregation(subjectError);
  }
  if (
    (subject as ConditionSubject).kind === "entityType" ||
    subject.payloadKind !== "Number"
  ) {
    return invalidAggregation(
      "An aggregation's subject must be of kind Number.",
    );
  }
  return undefined;
};

/**
 * Checks an Aggregate step's `aggregation` input against the kind connected to its `items` input, when the flow is
 * defined and the aggregation is a constant. An aggregation from an earlier step, or one whose items' kind doesn't
 * resolve, is checked by the step when it runs.
 */
export const checkAggregationInput: ActionStepCheck = ({
  step,
  getInputKind,
  report,
}) => {
  const source = step.inputs.aggregation;

  const kind = getInputKind("items");

  /* A constant of another kind is reported as an incompatible connection. */
  if (
    source?.kind !== "constant" ||
    source.payload.kind !== "Aggregation" ||
    !kind
  ) {
    return;
  }

  const error = validateAggregation(source.payload.value as Aggregation, kind);

  if (error) {
    report("aggregation", error.message);
  }
};
