import { isIsoDate } from "@local/hash-isomorphic-utils/flows/datetime";
import {
  binaryFilterOperatorsByPrimitive,
  unaryFilterOperators,
} from "@local/hash-isomorphic-utils/flows/evaluate-filter";

import {
  getSavedSubjectKind,
  hasOnlyKeys,
  isRecord,
  readTarget,
  toSubject,
} from "../shared/condition-targets";

import type { PropertyValueKind } from "../shared/condition-properties";
import type { ConditionTarget } from "../shared/condition-targets";
import type {
  BinaryFilterOperator,
  UnaryFilterOperator,
} from "@local/hash-isomorphic-utils/flows/evaluate-filter";
import type {
  FilterCondition,
  FilterLeaf,
} from "@local/hash-isomorphic-utils/flows/filter-condition";
import type { PayloadKind } from "@local/hash-isomorphic-utils/flows/types";

export type RowOperator = BinaryFilterOperator | UnaryFilterOperator;

/** A row's value: text for text and dates, a number, or true or false. */
type RowValue = string | number | boolean;

export type ConditionRow =
  | { targetKey: string; operator: UnaryFilterOperator }
  | { targetKey: string; operator: BinaryFilterOperator; value: RowValue };

/** A condition as the rows build it: leaves on the value or its entity's properties, all joined the same way. */
export type ConditionForm = { join: "all" | "any"; rows: ConditionRow[] };

export const emptyConditionForm: ConditionForm = { join: "all", rows: [] };

const primitives = {
  Text: "text",
  Number: "number",
  Date: "date",
  Boolean: "boolean",
} as const satisfies Record<PropertyValueKind["kind"], string>;

/**
 * The operators the engine has for a kind of value, the first being picked for a new row. A status only matches its
 * options, so it's compared whole.
 */
export const getRowOperators = (
  valueKind: PropertyValueKind,
): RowOperator[] => [
  ...(valueKind.kind === "Text" && valueKind.options
    ? (["equals", "notEquals"] as const)
    : binaryFilterOperatorsByPrimitive[primitives[valueKind.kind]]),
  ...unaryFilterOperators,
];

const operatorLabels: Record<RowOperator, string> = {
  equals: "is",
  notEquals: "is not",
  contains: "contains",
  startsWith: "starts with",
  endsWith: "ends with",
  greaterThan: "greater than",
  greaterThanOrEqual: "at least",
  lessThan: "less than",
  lessThanOrEqual: "at most",
  onSameUtcDate: "is on the same day as",
  isEmpty: "is empty",
  isNotEmpty: "is not empty",
};

/** Dates compare as before and after, not greater and less. */
const dateOperatorLabels: Partial<Record<RowOperator, string>> = {
  greaterThan: "is after",
  greaterThanOrEqual: "is on or after",
  lessThan: "is before",
  lessThanOrEqual: "is on or before",
};

export const getOperatorLabel = (
  operator: RowOperator,
  valueKind: PropertyValueKind,
) =>
  (valueKind.kind === "Date" ? dateOperatorLabels[operator] : undefined) ??
  operatorLabels[operator];

/**
 * The kind a saved condition was built for, read from its first row: the value's own kind, or an entity's. Lets its
 * rows show while nothing is connected to the value.
 */
export const getSavedConditionKind = (
  condition: unknown,
): PayloadKind | null => {
  const first: unknown =
    isRecord(condition) && Array.isArray(condition.conditions)
      ? (condition.conditions as unknown[])[0]
      : undefined;

  return getSavedSubjectKind(first);
};

/** Whether a typed value is one of a kind's: a number, true or false, a date, a status's option, or any text. */
const isRowValue = (valueKind: PropertyValueKind, value: unknown) => {
  switch (valueKind.kind) {
    case "Number":
      return typeof value === "number" && Number.isFinite(value);
    case "Boolean":
      return typeof value === "boolean";
    case "Date":
      return typeof value === "string" && isIsoDate(value);
    case "Text":
      return (
        typeof value === "string" &&
        (!valueKind.options || valueKind.options.includes(value))
      );
  }
};

const readRow = (
  leaf: unknown,
  targets: ReadonlyMap<string, ConditionTarget>,
): ConditionRow | undefined => {
  if (
    !isRecord(leaf) ||
    leaf.kind !== "condition" ||
    !hasOnlyKeys(leaf, ["kind", "subject", "operator", "value"])
  ) {
    return undefined;
  }

  const target = readTarget(leaf.subject, targets);
  const operator =
    target &&
    getRowOperators(target.valueKind).find(
      (offered) => offered === leaf.operator,
    );

  if (!target || !operator) {
    return undefined;
  }

  if (operator === "isEmpty" || operator === "isNotEmpty") {
    return leaf.value === undefined
      ? { targetKey: target.key, operator }
      : undefined;
  }

  const { value } = leaf;

  return isRecord(value) &&
    hasOnlyKeys(value, ["kind", "value"]) &&
    value.kind === target.valueKind.kind &&
    isRowValue(target.valueKind, value.value)
    ? { targetKey: target.key, operator, value: value.value as RowValue }
    : undefined;
};

/**
 * Reads a saved condition back into rows, or `null` if the rows can't show it: one with nested groups, `not`, an
 * entity type check, a subject that isn't one of `targets`, or an operator or value its kind doesn't offer.
 */
export const readConditionForm = (
  condition: unknown,
  targets: ReadonlyMap<string, ConditionTarget>,
): ConditionForm | null => {
  if (
    !isRecord(condition) ||
    (condition.kind !== "all" && condition.kind !== "any") ||
    !hasOnlyKeys(condition, ["kind", "conditions"]) ||
    !Array.isArray(condition.conditions) ||
    condition.conditions.length === 0
  ) {
    return null;
  }

  const rows = (condition.conditions as unknown[]).map((leaf) =>
    readRow(leaf, targets),
  );

  return rows.every((row) => row !== undefined)
    ? { join: condition.kind, rows }
    : null;
};

/** The condition the step checks, or `null` for no rows, as a group needs at least one condition. */
export const toFilterCondition = (
  { join, rows }: ConditionForm,
  targets: ReadonlyMap<string, ConditionTarget>,
): FilterCondition | null => {
  const conditions = rows.flatMap((row): FilterLeaf[] => {
    const target = targets.get(row.targetKey);

    if (!target) {
      return [];
    }

    const subject = toSubject(target);

    /* The leaf types correlate a subject's kind with its operator and value, which the row's union can't express. */
    return [
      ("value" in row
        ? {
            kind: "condition",
            subject,
            operator: row.operator,
            value: { kind: subject.payloadKind, value: row.value },
          }
        : { kind: "condition", subject, operator: row.operator }) as FilterLeaf,
    ];
  });

  return conditions.length > 0 ? { kind: join, conditions } : null;
};
