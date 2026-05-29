import type { PropertyFilter } from "./types";
import type { BaseUrl } from "@blockprotocol/type-system";
import type { Filter } from "@local/hash-graph-client";

const propertyPath = (baseUrl: BaseUrl) => ["properties", baseUrl];

/**
 * Coerces the raw string value of a filter to the parameter to send to the
 * graph, with the correct JS type for its kind. Returns `null` when the value
 * is missing or invalid for the kind (so the filter is treated as incomplete).
 *
 * Numbers are returned as JS numbers so that `greater` / `less` comparisons are
 * numeric rather than lexical. Strings are returned untrimmed so that the
 * (case-sensitive) match honours any intentional surrounding whitespace.
 */
const coerceValueParameter = (
  filter: PropertyFilter
): string | number | null => {
  const rawValue = filter.value;

  if (rawValue === undefined) {
    return null;
  }

  if (filter.kind === "number") {
    // Whitespace-only / non-numeric input is invalid for a number.
    if (rawValue.trim() === "") {
      return null;
    }

    const numericValue = Number(rawValue);

    if (Number.isNaN(numericValue) || !Number.isFinite(numericValue)) {
      return null;
    }

    return numericValue;
  }

  // Strings: an empty string is "no value", but anything else (including
  // intentional surrounding/whitespace) is kept untrimmed for the
  // case-sensitive match.
  if (rawValue === "") {
    return null;
  }

  return rawValue;
};

/**
 * Translates a single property filter into a graph {@link Filter} clause, or
 * returns `null` when the filter contributes no constraint (it is incomplete or
 * its value is invalid for its kind). Null clauses are omitted from the query,
 * so an unfinished pill is inert rather than matching nothing.
 *
 * This is the correctness core of the property-filter feature: it owns
 * parameter typing and the `exists` / `not exists` composition. It is authored
 * as a pure function so the behaviour can be unit-tested in isolation.
 */
export const buildPropertyFilterClause = (
  filter: PropertyFilter
): Filter | null => {
  const path = propertyPath(filter.baseUrl);

  switch (filter.operator) {
    // Existence operators apply regardless of kind and need no value.
    case "hasAnyValue":
      return { exists: { path } };
    case "isEmpty":
      return { not: { exists: { path } } };

    // Boolean operators carry the value themselves.
    case "isTrue":
      return { equal: [{ path }, { parameter: true }] };
    case "isFalse":
      return { equal: [{ path }, { parameter: false }] };

    default:
      break;
  }

  // Remaining operators require a (valid) value.
  const parameter = coerceValueParameter(filter);

  if (parameter === null) {
    return null;
  }

  switch (filter.operator) {
    case "equals":
      return { equal: [{ path }, { parameter }] };
    case "notEquals":
      return { notEqual: [{ path }, { parameter }] };
    case "greaterThan":
      return { greater: [{ path }, { parameter }] };
    case "greaterThanOrEqual":
      return { greaterOrEqual: [{ path }, { parameter }] };
    case "lessThan":
      return { less: [{ path }, { parameter }] };
    case "lessThanOrEqual":
      return { lessOrEqual: [{ path }, { parameter }] };
    case "contains":
      return { containsSegment: [{ path }, { parameter }] };
    case "startsWith":
      return { startsWith: [{ path }, { parameter }] };
    case "endsWith":
      return { endsWith: [{ path }, { parameter }] };
    default:
      return null;
  }
};

/**
 * Whether a filter currently contributes a clause to the query – i.e. whether
 * it is "active". A filter that builds no clause (incomplete / invalid) is not
 * active and is shown in a muted state in the ribbon.
 */
export const isPropertyFilterActive = (filter: PropertyFilter): boolean =>
  buildPropertyFilterClause(filter) !== null;
