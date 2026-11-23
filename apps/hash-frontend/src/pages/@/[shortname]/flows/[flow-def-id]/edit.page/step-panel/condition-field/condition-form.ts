import {
  isIsoDate,
  parseDateTime,
} from "@local/hash-isomorphic-utils/flows/datetime";
import {
  binaryFilterOperatorsByPrimitive,
  unaryFilterOperators,
} from "@local/hash-isomorphic-utils/flows/evaluate-filter";
import { payloadKindTraits } from "@local/hash-isomorphic-utils/flows/types";

import type {
  EntityProperty,
  PropertyValueKind,
} from "../shared/condition-properties";
import type { BaseUrl } from "@blockprotocol/type-system";
import type {
  BinaryFilterOperator,
  UnaryFilterOperator,
} from "@local/hash-isomorphic-utils/flows/evaluate-filter";
import type {
  FilterCondition,
  FilterLeaf,
} from "@local/hash-isomorphic-utils/flows/filter-condition";
import type { PayloadKind } from "@local/hash-isomorphic-utils/flows/types";

/** What a row checks: the value itself, or a property of the entity the value is or names. */
export type ConditionTarget = {
  /** Identifies the target among a step's by its subject: "input", or "property:" and the property's base URL. */
  key: string;
  label: string;
  subject:
    | { kind: "input" }
    | { kind: "entityProperty"; propertyTypeBaseUrl: BaseUrl };
  valueKind: PropertyValueKind;
};

export type RowOperator = BinaryFilterOperator | UnaryFilterOperator;

/** A row's value: text for text, dates and times, a number, or true or false. */
type RowValue = string | number | boolean;

export type ConditionRow =
  | { targetKey: string; operator: UnaryFilterOperator }
  | { targetKey: string; operator: BinaryFilterOperator; value: RowValue };

/** A condition as the rows build it: leaves on the value or its entity's properties, all joined the same way. */
export type ConditionForm = { join: "all" | "any"; rows: ConditionRow[] };

export const emptyConditionForm: ConditionForm = { join: "all", rows: [] };

const rowKinds = ["Text", "Number", "Date", "DateTime", "Boolean"] as const;

type RowKind = (typeof rowKinds)[number];

const isRowKind = (kind: PayloadKind): kind is RowKind =>
  (rowKinds as readonly PayloadKind[]).includes(kind);

const primitives = {
  Text: "text",
  Number: "number",
  Date: "date",
  DateTime: "datetime",
  Boolean: "boolean",
} as const satisfies Record<RowKind, string>;

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

/** Dates and times compare as before and after, not greater and less. */
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
  (valueKind.kind === "Date" || valueKind.kind === "DateTime"
    ? dateOperatorLabels[operator]
    : undefined) ?? operatorLabels[operator];

const subjectKeyOf = (subject: ConditionTarget["subject"]) =>
  subject.kind === "input"
    ? "input"
    : `property:${subject.propertyTypeBaseUrl}`;

/**
 * What a condition can check on a value of `kind`: the value itself when it's text, a number, a date, a date and time or true/false,
 * or the given properties when it's an entity. Nothing for any other kind, or nothing connected.
 */
export const getConditionTargets = ({
  kind,
  valueLabel,
  properties,
}: {
  kind: PayloadKind | null;
  /** What the value itself is called, e.g. "Value" or "Item". */
  valueLabel: string;
  properties: EntityProperty[];
}): ConditionTarget[] => {
  if (!kind) {
    return [];
  }

  if (isRowKind(kind)) {
    const subject = { kind: "input" } as const;

    return [
      {
        key: subjectKeyOf(subject),
        label: valueLabel,
        subject,
        valueKind: { kind },
      },
    ];
  }

  return "entity" in payloadKindTraits[kind]
    ? properties.map(({ baseUrl, title, valueKind }) => {
        const subject = {
          kind: "entityProperty",
          propertyTypeBaseUrl: baseUrl,
        } as const;

        return { key: subjectKeyOf(subject), label: title, subject, valueKind };
      })
    : [];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

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
  const subject = isRecord(first) ? first.subject : undefined;

  if (!isRecord(subject)) {
    return null;
  }

  if (subject.kind === "entityProperty") {
    return "EntityId";
  }

  return subject.kind === "input" &&
    typeof subject.payloadKind === "string" &&
    isRowKind(subject.payloadKind as PayloadKind)
    ? (subject.payloadKind as PayloadKind)
    : null;
};

const hasOnlyKeys = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).every((key) => keys.includes(key));

/** Whether a typed value is one of a kind's: a number, true or false, a date, an instant, a status's option, or any text. */
const isRowValue = (valueKind: PropertyValueKind, value: unknown) => {
  switch (valueKind.kind) {
    case "Number":
      return typeof value === "number" && Number.isFinite(value);
    case "Boolean":
      return typeof value === "boolean";
    case "Date":
      return typeof value === "string" && isIsoDate(value);
    case "DateTime":
      return typeof parseDateTime(value) === "number";
    case "Text":
      return (
        typeof value === "string" &&
        (!valueKind.options || valueKind.options.includes(value))
      );
  }
};

/** The target a saved subject names, if it's one of `targets` and of the kind the target's value is. */
const readTarget = (
  subject: unknown,
  targets: ReadonlyMap<string, ConditionTarget>,
) => {
  if (!isRecord(subject)) {
    return undefined;
  }

  const key =
    subject.kind === "input" && hasOnlyKeys(subject, ["kind", "payloadKind"])
      ? "input"
      : subject.kind === "entityProperty" &&
          hasOnlyKeys(subject, [
            "kind",
            "payloadKind",
            "propertyTypeBaseUrl",
          ]) &&
          typeof subject.propertyTypeBaseUrl === "string"
        ? `property:${subject.propertyTypeBaseUrl}`
        : undefined;
  const target = key === undefined ? undefined : targets.get(key);

  return target && subject.payloadKind === target.valueKind.kind
    ? target
    : undefined;
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

    const payloadKind = target.valueKind.kind;
    const subject = { ...target.subject, payloadKind };

    /* The leaf types correlate a subject's kind with its operator and value, which the row's union can't express. */
    return [
      ("value" in row
        ? {
            kind: "condition",
            subject,
            operator: row.operator,
            value: { kind: payloadKind, value: row.value },
          }
        : { kind: "condition", subject, operator: row.operator }) as FilterLeaf,
    ];
  });

  return conditions.length > 0 ? { kind: join, conditions } : null;
};
