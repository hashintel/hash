import { validateSubject } from "./filter-condition.js";

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

export interface AggregationError {
  status: "error";
  code: "invalidAggregation";
  message: string;
}

const invalidAggregation = (message: string): AggregationError => ({
  status: "error",
  code: "invalidAggregation",
  message,
});

const isEntityTypeSubject = (subject: ConditionSubject): boolean =>
  subject.kind === "entityType";

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
  if (!aggregationOperations.includes(aggregation.operation)) {
    return invalidAggregation(
      `An aggregation's operation must be one of ${aggregationOperations.join(", ")}.`,
    );
  }
  if (aggregation.operation === "count") {
    if ("subject" in aggregation) {
      return invalidAggregation("A count aggregation takes no subject.");
    }
    return undefined;
  }
  const { subject } = aggregation;
  const subjectError = validateSubject(subject, itemKind);
  if (subjectError !== undefined && subjectError !== "") {
    return invalidAggregation(subjectError);
  }
  if (isEntityTypeSubject(subject) || subject.payloadKind !== "Number") {
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
    kind === null
  ) {
    return;
  }

  const error = validateAggregation(
    // SAFETY: a constant of kind `Aggregation` holds an aggregation; `validateAggregation` checks its shape.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the payload value is typed more broadly than the kind implies
    source.payload.value as Aggregation,
    kind,
  );

  if (error !== undefined) {
    report("aggregation", error.message);
  }
};
