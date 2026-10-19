import { scalarKinds, validateSubject } from "./filter-condition.js";

import type { ConditionSubject, ScalarKind } from "./filter-condition.js";
import type { ActionStepCheck, PayloadKind } from "./types.js";

/** What Order by sorts a list by: the item, one of its fields or an entity property, as in a filter condition. */
export type SortKey = {
  subject: Exclude<ConditionSubject, { kind: "entityType" }>;
  direction: "ascending" | "descending";
};

/** The kinds a sort key's subject can have: those with a primitive type, which Order by knows how to compare. */
export const sortKeyKinds = scalarKinds;

export type SortKeyKind = ScalarKind;

export type SortKeyError = {
  status: "error";
  code: "invalidSortKey";
  message: string;
};

const invalidSortKey = (message: string): SortKeyError => ({
  status: "error",
  code: "invalidSortKey",
  message,
});

/**
 * Checks a sort key against the kind of the items it sorts. Run when the flow is defined for a constant sort key,
 * and by the step for one from an earlier step.
 */
export const validateSortKey = (
  sortKey: SortKey,
  itemKind: PayloadKind,
): SortKeyError | undefined => {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Persisted definitions may be malformed.
  if (typeof sortKey !== "object" || sortKey === null) {
    return invalidSortKey("A sort key must be an object.");
  }
  const { subject, direction } = sortKey;
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Persisted definitions may be malformed.
  if (direction !== "ascending" && direction !== "descending") {
    return invalidSortKey(
      'A sort key\'s direction must be "ascending" or "descending".',
    );
  }
  const subjectError = validateSubject(subject, itemKind);
  if (subjectError) {
    return invalidSortKey(subjectError);
  }
  if (
    (subject as ConditionSubject).kind === "entityType" ||
    !sortKeyKinds.includes(subject.payloadKind)
  ) {
    return invalidSortKey(
      `A sort key's subject must be of kind ${sortKeyKinds.join(", ")}.`,
    );
  }
  return undefined;
};

/**
 * Checks an Order by step's `sortBy` input against the kind connected to its `items` input, when the flow is defined
 * and the sort key is a constant. A sort key from an earlier step, or one whose items' kind doesn't resolve, is
 * checked by the step when it runs.
 */
export const checkSortKeyInput: ActionStepCheck = ({
  step,
  getInputKind,
  report,
}) => {
  const source = step.inputs.sortBy;

  const kind = getInputKind("items");

  /* A constant of another kind is reported as an incompatible connection. */
  if (
    source?.kind !== "constant" ||
    source.payload.kind !== "SortKey" ||
    !kind
  ) {
    return;
  }

  const error = validateSortKey(source.payload.value as SortKey, kind);

  if (error) {
    report("sortBy", error.message);
  }
};
