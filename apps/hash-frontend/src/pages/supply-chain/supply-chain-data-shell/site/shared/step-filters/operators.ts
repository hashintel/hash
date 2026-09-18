import type {
  FilterInput,
  FilterMultiSelectInput,
  FilterOperator,
  FilterSingleSelectInput,
} from "@hashintel/ds-components";

/** Generic operator vocabulary for the step-table filters */

export type StepFilterOperator = FilterOperator<Record<string, unknown>>;

type OperatorConfig = Omit<StepFilterOperator, "key">;

export const stringOperators = {
  contains: { label: "contains", input: { type: "string" } },
  notContains: { label: "does not contain", input: { type: "string" } },
  is: { label: "is", input: { type: "string" } },
} satisfies Record<string, OperatorConfig>;

/**
 * Number operators; the optional placeholder puts the value's unit ("days",
 * a currency code, …) inside the empty inputs.
 */
export const numberOperatorsFor = (placeholder?: string) => {
  const numberInput: FilterInput = { type: "float", placeholder };
  return {
    gte: { label: "at least", input: numberInput },
    lte: { label: "at most", input: numberInput },
    between: { label: "between", input: [numberInput, "and", numberInput] },
  } satisfies Record<string, OperatorConfig>;
};

export const numberOperators = numberOperatorsFor();

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

/** Passed through to the underlying multi select. */
interface MultiSelectOperatorOpts {
  searchable?: boolean;
  overflow?: FilterMultiSelectInput["overflow"];
}

/** Multi-select operators; items vary per filter, so these are factories. */
export const multiSelectOperators = {
  isAnyOf: (
    items: MultiSelectItems,
    opts?: MultiSelectOperatorOpts,
  ): OperatorConfig => ({
    label: "is any of",
    input: {
      type: "select",
      items,
      multiple: true,
      searchable: opts?.searchable ?? false,
      overflow: opts?.overflow,
    },
  }),
  isNoneOf: (
    items: MultiSelectItems,
    opts?: MultiSelectOperatorOpts,
  ): OperatorConfig => ({
    label: "is none of",
    input: {
      type: "select",
      items,
      multiple: true,
      searchable: opts?.searchable ?? false,
      overflow: opts?.overflow,
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
  opts?: MultiSelectOperatorOpts,
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
