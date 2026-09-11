import type {
  FilterInput,
  FilterMultiSelectInput,
  FilterOperator,
  FilterSingleSelectInput,
} from "@hashintel/ds-components";

/**
 * Generic operator vocabulary for the step-table filters: reusable operator
 * configs grouped by value type, `pick*` helpers to materialise a subset into
 * the keyed list the `Filter` component takes, and the matching evaluators.
 *
 * Evaluation semantics shared by every operator: a row that lacks the filtered
 * property (a null/absent derived value) fails the filter, so "not applicable"
 * rows drop out while the filter is active instead of silently passing.
 * Filters wanting total semantics (e.g. yes/no presence checks) define custom
 * operators with their own predicates instead.
 */

/**
 * Operator shape shared by every step filter. The heterogeneous filter set is
 * managed generically, so the per-operator value types are `unknown` and the
 * evaluators narrow at the boundary (mirroring the Filter component itself).
 */
export type StepFilterOperator = FilterOperator<Record<string, unknown>>;

type OperatorConfig = Omit<StepFilterOperator, "key">;

const numberInput: FilterInput = { type: "float" };

export const stringOperators = {
  contains: { label: "contains", input: { type: "string" } },
  notContains: { label: "does not contain", input: { type: "string" } },
  is: { label: "is", input: { type: "string" } },
} satisfies Record<string, OperatorConfig>;

export const numberOperators = {
  gte: { label: "at least", input: numberInput },
  lte: { label: "at most", input: numberInput },
  between: { label: "between", input: [numberInput, "and", numberInput] },
} satisfies Record<string, OperatorConfig>;

type SingleSelectItems = FilterSingleSelectInput["items"];
type MultiSelectItems = FilterMultiSelectInput["items"];

/** Single-select operators; items vary per filter, so these are factories. */
export const selectOperators = {
  is: (items: SingleSelectItems): OperatorConfig => ({
    label: "is",
    input: { type: "select", items },
  }),
  isNot: (items: SingleSelectItems): OperatorConfig => ({
    label: "is not",
    input: { type: "select", items },
  }),
};

/** Multi-select operators; items vary per filter, so these are factories. */
export const multiSelectOperators = {
  isAnyOf: (
    items: MultiSelectItems,
    opts?: { searchable?: boolean },
  ): OperatorConfig => ({
    label: "is any of",
    input: {
      type: "select",
      items,
      multiple: true,
      searchable: opts?.searchable ?? false,
    },
  }),
  isNoneOf: (
    items: MultiSelectItems,
    opts?: { searchable?: boolean },
  ): OperatorConfig => ({
    label: "is none of",
    input: {
      type: "select",
      items,
      multiple: true,
      searchable: opts?.searchable ?? false,
    },
  }),
};

export const pickOperators = <
  OperatorMap extends Record<string, OperatorConfig>,
>(
  map: OperatorMap,
  keys: ReadonlyArray<keyof OperatorMap & string>,
): StepFilterOperator[] =>
  keys.flatMap((key) => {
    const config = map[key] as OperatorConfig | undefined;
    return config ? [{ key, label: config.label, input: config.input }] : [];
  });

export const pickSingleSelectOperators = (
  keys: ReadonlyArray<keyof typeof selectOperators>,
  items: SingleSelectItems,
): StepFilterOperator[] =>
  keys.map((key) => ({ key, ...selectOperators[key](items) }));

export const pickMultiSelectOperators = (
  keys: ReadonlyArray<keyof typeof multiSelectOperators>,
  items: MultiSelectItems,
  opts?: { searchable?: boolean },
): StepFilterOperator[] =>
  keys.map((key) => ({ key, ...multiSelectOperators[key](items, opts) }));

export const matchesStringOperator = (
  operatorKey: string,
  rowValue: string | null | undefined,
  filterValue: unknown,
): boolean => {
  if (typeof filterValue !== "string" || filterValue === "") {
    return true;
  }
  if (!rowValue) {
    return false;
  }
  const haystack = rowValue.toLowerCase();
  const needle = filterValue.toLowerCase();
  switch (operatorKey) {
    case "contains":
      return haystack.includes(needle);
    case "notContains":
      return !haystack.includes(needle);
    case "is":
      return haystack === needle;
    default:
      return true;
  }
};

export const matchesNumberOperator = (
  operatorKey: string,
  rowValue: number | null | undefined,
  filterValue: unknown,
): boolean => {
  if (rowValue == null || Number.isNaN(rowValue)) {
    return false;
  }
  if (operatorKey === "between") {
    if (!Array.isArray(filterValue)) {
      return true;
    }
    const bounds = filterValue.filter(
      (entry): entry is number => typeof entry === "number",
    );
    const [first, second] = bounds;
    if (bounds.length !== 2 || first === undefined || second === undefined) {
      return true;
    }
    return (
      rowValue >= Math.min(first, second) && rowValue <= Math.max(first, second)
    );
  }
  if (typeof filterValue !== "number") {
    return true;
  }
  switch (operatorKey) {
    case "gte":
      return rowValue >= filterValue;
    case "lte":
      return rowValue <= filterValue;
    default:
      return true;
  }
};

/**
 * Membership test for select operators. `isNot`/`isNoneOf` invert the match;
 * rows with no values fail either way (strict not-applicable semantics).
 */
export const matchesSelectionOperator = (
  operatorKey: string,
  rowValues: ReadonlyArray<string> | null | undefined,
  filterValue: unknown,
): boolean => {
  const selected = Array.isArray(filterValue)
    ? filterValue.filter((entry): entry is string => typeof entry === "string")
    : typeof filterValue === "string"
      ? [filterValue]
      : [];
  if (selected.length === 0) {
    return true;
  }
  if (!rowValues || rowValues.length === 0) {
    return false;
  }
  const hasMatch = rowValues.some((value) => selected.includes(value));
  return operatorKey === "isNot" || operatorKey === "isNoneOf"
    ? !hasMatch
    : hasMatch;
};
