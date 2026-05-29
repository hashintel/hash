import type { FilterValueKind, PropertyFilterOperator } from "./types";

export type OperatorDescriptor = {
  operator: PropertyFilterOperator;
  /** Human-readable label shown in the operator dropdown. */
  label: string;
  /**
   * The connector shown in the pill. For value-requiring operators this sits
   * between the property title and the value (e.g. `Age >`{value}); for
   * value-less operators it is the whole condition (e.g. `is true`, `is empty`).
   */
  pillConnector: string;
  /** Whether the operator needs a value input (false for boolean / existence). */
  requiresValue: boolean;
};

const isEmptyOperator: OperatorDescriptor = {
  operator: "isEmpty",
  label: "is empty",
  pillConnector: "is empty",
  requiresValue: false,
};

const hasAnyValueOperator: OperatorDescriptor = {
  operator: "hasAnyValue",
  label: "has any value",
  pillConnector: "has any value",
  requiresValue: false,
};

/**
 * Existence operators are available for every kind, and always come last.
 */
const existenceOperators: OperatorDescriptor[] = [
  isEmptyOperator,
  hasAnyValueOperator,
];

const numberOperators: OperatorDescriptor[] = [
  {
    operator: "equals",
    label: "equals",
    pillConnector: "=",
    requiresValue: true,
  },
  {
    operator: "notEquals",
    label: "not equals",
    pillConnector: "≠",
    requiresValue: true,
  },
  {
    operator: "greaterThan",
    label: "greater than",
    pillConnector: ">",
    requiresValue: true,
  },
  {
    operator: "greaterThanOrEqual",
    label: "greater than or equal",
    pillConnector: "≥",
    requiresValue: true,
  },
  {
    operator: "lessThan",
    label: "less than",
    pillConnector: "<",
    requiresValue: true,
  },
  {
    operator: "lessThanOrEqual",
    label: "less than or equal",
    pillConnector: "≤",
    requiresValue: true,
  },
  ...existenceOperators,
];

const stringOperators: OperatorDescriptor[] = [
  {
    operator: "contains",
    label: "contains",
    pillConnector: "contains",
    requiresValue: true,
  },
  {
    operator: "equals",
    label: "equals",
    pillConnector: "equals",
    requiresValue: true,
  },
  {
    operator: "notEquals",
    label: "not equals",
    pillConnector: "does not equal",
    requiresValue: true,
  },
  {
    operator: "startsWith",
    label: "starts with",
    pillConnector: "starts with",
    requiresValue: true,
  },
  {
    operator: "endsWith",
    label: "ends with",
    pillConnector: "ends with",
    requiresValue: true,
  },
  ...existenceOperators,
];

const booleanOperators: OperatorDescriptor[] = [
  {
    operator: "isTrue",
    label: "is true",
    pillConnector: "is true",
    requiresValue: false,
  },
  {
    operator: "isFalse",
    label: "is false",
    pillConnector: "is false",
    requiresValue: false,
  },
  ...existenceOperators,
];

const operatorsByKind: Record<FilterValueKind, OperatorDescriptor[]> = {
  number: numberOperators,
  string: stringOperators,
  boolean: booleanOperators,
};

/**
 * Returns the operator descriptors for a value kind, ordered so that the first
 * entry is the sensible default (`equals` for numbers, `contains` for text,
 * `is true` for booleans).
 */
export const getOperatorsForKind = (
  kind: FilterValueKind,
): OperatorDescriptor[] => operatorsByKind[kind];

/** The default operator for a kind (the first in its catalog). */
export const getDefaultOperatorForKind = (
  kind: FilterValueKind,
): PropertyFilterOperator => operatorsByKind[kind][0]!.operator;

/** Look up a single operator descriptor for a kind, if it exists. */
export const getOperatorDescriptor = (
  kind: FilterValueKind,
  operator: PropertyFilterOperator,
): OperatorDescriptor | undefined =>
  operatorsByKind[kind].find((descriptor) => descriptor.operator === operator);
