import type { BaseUrl } from "@blockprotocol/type-system";

/**
 * The primitive kinds a property value can resolve to for filtering purposes.
 * Other primitive kinds (null, object, array) are not filterable in v1.
 */
export type FilterValueKind = "number" | "string" | "boolean";

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
  // string only
  | "contains"
  | "startsWith"
  | "endsWith"
  // boolean only (value-less – the operator carries the value)
  | "isTrue"
  | "isFalse"
  // existence checks, available for every kind (value-less)
  | "isEmpty"
  | "hasAnyValue";

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
   * value-less operators (boolean / existence).
   */
  value?: string;
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
