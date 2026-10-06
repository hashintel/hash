import type {
  FilterValueKind,
  PropertyFilterOperator,
} from "./property-filter";

export type OperatorDescriptor = {
  operator: PropertyFilterOperator;
  /** Human-readable label shown in the operator dropdown. */
  label: string;
  /**
   * English reading of a symbolic label ("greater than" for ">"), shown as
   * subtle small text beside it in the dropdown — never in the chip. Worded
   * as the relation's predicate-adjective name (each completes "value is
   * ___"), so "equal" / "not equal" rather than "equals" / "does not equal".
   */
  description?: string;
  /** Whether the operator needs a value input (false for boolean / existence). */
  requiresValue: boolean;
  /** The operator takes two value inputs (`between`'s inclusive bounds). */
  range?: true;
  /** The operator takes a multi-select of values (`isNoneOf`). */
  multi?: true;
};

const hasAnyValueOperator: OperatorDescriptor = {
  operator: "hasAnyValue",
  label: "has any value",
  requiresValue: false,
};

const hasNoValueOperator: OperatorDescriptor = {
  operator: "isEmpty",
  label: "has no value",
  requiresValue: false,
};

/**
 * Existence operators are available for every kind, and always come last.
 * "has any value / has no value" rather than "is empty / is not empty": the
 * clauses are existence checks on the property (absent vs present at all),
 * and the phrasing matches the archived filter's lone operator.
 */
const existenceOperators: OperatorDescriptor[] = [
  hasAnyValueOperator,
  hasNoValueOperator,
];

/**
 * Comparisons as symbols, as Notion and Airtable label them: compact in the
 * chip ("Amount ≥ 5") and instantly scannable in the dropdown. Grouped
 * comparisons-then-equality, with the default (>) first.
 */
const numberOperators: OperatorDescriptor[] = [
  {
    operator: "greaterThan",
    label: ">",
    description: "greater than",
    requiresValue: true,
  },
  {
    operator: "greaterThanOrEqual",
    label: "≥",
    description: "greater than or equal",
    requiresValue: true,
  },
  {
    operator: "lessThan",
    label: "<",
    description: "less than",
    requiresValue: true,
  },
  {
    operator: "lessThanOrEqual",
    label: "≤",
    description: "less than or equal",
    requiresValue: true,
  },
  {
    operator: "equals",
    label: "=",
    description: "equal",
    requiresValue: true,
  },
  {
    operator: "notEquals",
    label: "≠",
    description: "not equal",
    requiresValue: true,
  },
  {
    operator: "between",
    label: "between",
    requiresValue: true,
    range: true,
  },
  ...existenceOperators,
];

const stringOperators: OperatorDescriptor[] = [
  {
    operator: "contains",
    label: "contains",
    requiresValue: true,
  },
  {
    operator: "equals",
    label: "is",
    requiresValue: true,
  },
  {
    operator: "notEquals",
    label: "is not",
    requiresValue: true,
  },
  {
    operator: "startsWith",
    label: "starts with",
    requiresValue: true,
  },
  {
    operator: "endsWith",
    label: "ends with",
    requiresValue: true,
  },
  ...existenceOperators,
];

const booleanOperators: OperatorDescriptor[] = [
  {
    operator: "isTrue",
    label: "is true",
    requiresValue: false,
  },
  {
    operator: "isFalse",
    label: "is false",
    requiresValue: false,
  },
  ...existenceOperators,
];

/**
 * Enum-kind properties pick their values from the data type's constants, so
 * their value inputs are selects rather than free text. "is not" is the
 * none-of multi-select (a single selection is just its one-value case; an
 * AND of ≠, so it stays expressible on the AND-only entities-table
 * endpoint). `is any of` awaits a disjunction on that endpoint.
 */
const enumOperators: OperatorDescriptor[] = [
  {
    operator: "equals",
    label: "is",
    requiresValue: true,
  },
  {
    operator: "isNoneOf",
    label: "is not",
    requiresValue: true,
    multi: true,
  },
  ...existenceOperators,
];

/**
 * Lists of plain text support `contains` — a substring match anywhere within
 * any element (verified against the entities-table endpoint) — plus the
 * existence operators. Equality is deliberately absent: the server compares
 * the whole list value, so it never matches a single element.
 */
const textListOperators: OperatorDescriptor[] = [
  {
    operator: "contains",
    label: "contains",
    requiresValue: true,
  },
  ...existenceOperators,
];

/**
 * Shapes we can only existence-check (nested objects, lists of non-text
 * values, multi-data-type properties): value comparisons on these are
 * misleading server-side — equality compares the whole JSONB value, and text
 * search on objects also matches JSON keys.
 */
const opaqueOperators: OperatorDescriptor[] = [...existenceOperators];

/**
 * The archived filter's catalog: a single value-less "has any value" — no
 * clause of its own, the filter's presence just widens the query scope to
 * archived entities, so everything matches. Narrowing operators ("is true" =
 * only archived) await first-class archived filtering on the entities-table
 * endpoint: its property filters hit the page-style archived *property*,
 * which entities archived via the metadata flag don't carry.
 */
export const archivedFilterOperators: OperatorDescriptor[] = [
  {
    operator: "included",
    label: "has any value",
    requiresValue: false,
  },
];

const operatorsByKind: Record<FilterValueKind, OperatorDescriptor[]> = {
  number: numberOperators,
  string: stringOperators,
  boolean: booleanOperators,
  enum: enumOperators,
  textList: textListOperators,
  opaque: opaqueOperators,
};

/**
 * Returns the operator descriptors for a value kind, ordered so that the first
 * entry is the sensible default (`contains` for text, `>` for numbers,
 * `is true` for booleans).
 */
export const getOperatorsForKind = (
  kind: FilterValueKind,
): OperatorDescriptor[] => operatorsByKind[kind];

/** The default operator for a kind (the first in its catalog). */
export const getDefaultOperatorForKind = (
  kind: FilterValueKind,
): PropertyFilterOperator => {
  const operator = operatorsByKind[kind][0]?.operator;

  if (!operator) {
    throw new Error(`No operator found for kind ${kind}`);
  }

  return operator;
};
