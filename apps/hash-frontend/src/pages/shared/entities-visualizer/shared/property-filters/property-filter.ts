import type { BaseUrl } from "@blockprotocol/type-system";

/**
 * The kinds a property value can resolve to for filtering purposes, which
 * determine the operators on offer:
 *
 * - `number` / `string` / `boolean` — scalar values with the full operator
 *   catalog for their kind.
 * - `enum` — a string value constrained to a fixed set of constants by its
 *   data type. Offered as select inputs (`is` / `is not` / `is none of`)
 *   alongside the existence operators. Number enums deliberately stay plain
 *   `number`: their select would commit strings, and a string parameter never
 *   equals a stored JSONB number.
 * - `textList` — a list whose elements are plain text. `contains` matches a
 *   substring anywhere within any element (verified against the entities-table
 *   endpoint), alongside the existence operators.
 * - `opaque` — any other shape (nested objects, lists of non-text values,
 *   properties permitting multiple data types). Value comparisons on these
 *   are misleading server-side (equality compares the whole JSONB value, and
 *   text search on objects also matches JSON keys), so only the existence
 *   operators are offered.
 *
 * Properties resolving to an explicit `null` kind remain unfilterable and are
 * omitted from the picker.
 */
export type FilterValueKind =
  | "number"
  | "string"
  | "boolean"
  | "enum"
  | "textList"
  | "opaque";

/**
 * The set of operators a property filter can use. Which operators are valid for
 * a given filter depends on its {@link FilterValueKind} – see
 * {@link getOperatorsForKind}.
 */
export type PropertyFilterOperator =
  // shared by number + string
  | "equals"
  | "notEquals"
  // number only
  | "greaterThan"
  | "greaterThanOrEqual"
  | "lessThan"
  | "lessThanOrEqual"
  /** Number only; takes two values, and both bounds are inclusive (≥ and ≤). */
  | "between"
  // string only
  | "contains"
  | "startsWith"
  | "endsWith"
  // boolean only (value-less – the operator carries the value)
  | "isTrue"
  | "isFalse"
  /** Enum only; excludes every one of a set of selected values (AND of ≠). */
  | "isNoneOf"
  // existence checks, available for every kind (value-less)
  | "isEmpty"
  | "hasAnyValue"
  /**
   * The archived filter only (value-less): contributes no clause of its own —
   * the filter's presence flips the query scope's `includeArchived` flag, so
   * archived entities show alongside everything else.
   */
  | "included";

export type PropertyFilter = {
  /** Stable client-side id, used for React keys and editing. */
  id: string;
  /**
   * Base URL of the target property type, used as the `["properties", baseUrl]`
   * query path.
   */
  baseUrl: BaseUrl;
  /** Property title, shown in the pill. */
  title: string;
  /** Resolved value kind, determines the available operators and parameter typing. */
  kind: FilterValueKind;
  /** The chosen operator. */
  operator: PropertyFilterOperator;
  /**
   * The raw value from the editor's input. Absent (or empty / invalid for the
   * kind) means the filter is incomplete and contributes no clause. Unused by
   * value-less operators (boolean / existence). For `between` it is the
   * inclusive lower bound.
   */
  value?: string;
  /**
   * The raw value of the second input — the inclusive upper bound for
   * `between`, which is incomplete unless both bounds are present and valid.
   * Unused by every other operator.
   */
  secondValue?: string;
  /**
   * The selected values of a multi-select operator (`isNoneOf`); an absent or
   * empty list means the filter is incomplete and contributes no clause.
   * Unused by every other operator.
   */
  values?: string[];
  /**
   * The constants an `enum`-kind property permits, snapshotted from its data
   * type when the filter is added — they populate the chip's select inputs.
   */
  enumOptions?: string[];
};

/**
 * Why a property cannot be filtered in v1. Properties that fail the filterable
 * gate are still listed in the picker, but disabled, with a reason-specific
 * tooltip.
 */
export type PropertyFilterDisabledReason =
  | "multiple-data-types"
  | "list"
  | "nested";

export type FilterableProperty = {
  baseUrl: BaseUrl;
  title: string;
  kind: FilterValueKind;
  /** The permitted constants of an `enum`-kind property. */
  enumOptions?: string[];
  filterable: true;
};

export type NonFilterableProperty = {
  baseUrl: BaseUrl;
  title: string;
  filterable: false;
  disabledReason: PropertyFilterDisabledReason;
};

export type FilterMetadataForProperty =
  | FilterableProperty
  | NonFilterableProperty;
