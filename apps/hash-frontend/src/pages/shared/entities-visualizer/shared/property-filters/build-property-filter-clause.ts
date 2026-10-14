import type { PropertyFilter } from "./property-filter";
import type { BaseUrl } from "@blockprotocol/type-system";
import type { Filter } from "@local/hash-graph-client";
import type { EntityTablePropertyFilter } from "@local/hash-graph-sdk/entity";

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
  filter: PropertyFilter,
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
 * The non-empty selected values of a multi-select filter (`isNoneOf`); an
 * empty result means the filter is incomplete and contributes no constraint.
 */
const selectedValues = (filter: PropertyFilter): string[] =>
  (filter.values ?? []).filter((value) => value !== "");

/**
 * Both of a `between` filter's bounds as numbers, or `null` when either is
 * missing or invalid for the kind (the kind-aware coercion yields strings for
 * a string-kind filter, rendering a mismatched `between` inert like the other
 * ordering comparators).
 */
const coerceBetweenBounds = (
  filter: PropertyFilter,
): [number, number] | null => {
  const lower = coerceValueParameter(filter);
  const upper = coerceValueParameter({ ...filter, value: filter.secondValue });

  return typeof lower === "number" && typeof upper === "number"
    ? [lower, upper]
    : null;
};

/**
 * Translates a single property filter into a graph {@link Filter} clause, or
 * returns `null` when the filter contributes no constraint (it is incomplete or
 * its value is invalid for its kind). Null clauses are omitted from the query,
 * so an unfinished pill is inert rather than matching nothing.
 */
export const buildPropertyFilterClause = (
  filter: PropertyFilter,
): Filter | null => {
  const path = propertyPath(filter.baseUrl);

  switch (filter.operator) {
    // The archived filter's default: no clause — the filter's presence flips
    // the query scope's `includeArchived` flag instead (see the ribbon).
    case "included":
      return null;

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

    // Both bounds inclusive (≥ and ≤), and both required.
    case "between": {
      const bounds = coerceBetweenBounds(filter);

      if (!bounds) {
        return null;
      }

      return {
        all: [
          { greaterOrEqual: [{ path }, { parameter: bounds[0] }] },
          { lessOrEqual: [{ path }, { parameter: bounds[1] }] },
        ],
      };
    }

    // Excludes every selected value — a conjunction of ≠, so it stays
    // expressible on the AND-only table endpoint too.
    case "isNoneOf": {
      const values = selectedValues(filter);

      if (values.length === 0) {
        return null;
      }

      return {
        all: values.map((value) => ({
          notEqual: [{ path }, { parameter: value }],
        })),
      };
    }

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
    // The ordering comparators take numbers and the text operators take
    // strings, mirroring the gates in {@link buildEndpointPropertyFilter} —
    // the two builders must agree on which filters are inert, since
    // {@link isPropertyFilterActive} answers for both.
    case "greaterThan":
      return typeof parameter === "number"
        ? { greater: [{ path }, { parameter }] }
        : null;
    case "greaterThanOrEqual":
      return typeof parameter === "number"
        ? { greaterOrEqual: [{ path }, { parameter }] }
        : null;
    case "lessThan":
      return typeof parameter === "number"
        ? { less: [{ path }, { parameter }] }
        : null;
    case "lessThanOrEqual":
      return typeof parameter === "number"
        ? { lessOrEqual: [{ path }, { parameter }] }
        : null;
    case "contains":
      return typeof parameter === "string"
        ? { containsSegment: [{ path }, { parameter }] }
        : null;
    case "startsWith":
      return typeof parameter === "string"
        ? { startsWith: [{ path }, { parameter }] }
        : null;
    case "endsWith":
      return typeof parameter === "string"
        ? { endsWith: [{ path }, { parameter }] }
        : null;
  }
};

/**
 * Translates a single property filter into the table endpoint's property
 * filters — the endpoint counterpart of {@link buildPropertyFilterClause}. A
 * list because `between` spans two endpoint conditions (the endpoint combines
 * property filters with AND); an empty list means the filter contributes no
 * constraint (it is incomplete or its value is invalid for its kind).
 */
export const buildEndpointPropertyFilter = (
  filter: PropertyFilter,
): EntityTablePropertyFilter[] => {
  const property = filter.baseUrl;

  switch (filter.operator) {
    // No constraint — the scope's `includeArchived` flag carries the effect.
    case "included":
      return [];
    case "hasAnyValue":
      return [{ type: "hasAnyValue", property }];
    case "isEmpty":
      return [{ type: "isEmpty", property }];
    case "isTrue":
      return [{ type: "isTrue", property }];
    case "isFalse":
      return [{ type: "isFalse", property }];
    // Both bounds inclusive (≥ and ≤), and both required.
    case "between": {
      const bounds = coerceBetweenBounds(filter);

      return bounds
        ? [
            { type: "greaterThanOrEqual", property, value: bounds[0] },
            { type: "lessThanOrEqual", property, value: bounds[1] },
          ]
        : [];
    }
    // Excludes every selected value — a conjunction of ≠ conditions.
    case "isNoneOf":
      return selectedValues(filter).map((value) => ({
        type: "notEquals",
        property,
        value,
      }));
    default:
      break;
  }

  const parameter = coerceValueParameter(filter);

  if (parameter === null) {
    return [];
  }

  switch (filter.operator) {
    case "equals":
      return [{ type: "equals", property, value: parameter }];
    case "notEquals":
      return [{ type: "notEquals", property, value: parameter }];
    // The ordering comparators take numbers and the text operators take
    // strings. Which operators a filter's kind offers is UI convention, so a
    // mismatched value renders the filter inert rather than a rejected query.
    case "greaterThan":
      return typeof parameter === "number"
        ? [{ type: "greaterThan", property, value: parameter }]
        : [];
    case "greaterThanOrEqual":
      return typeof parameter === "number"
        ? [{ type: "greaterThanOrEqual", property, value: parameter }]
        : [];
    case "lessThan":
      return typeof parameter === "number"
        ? [{ type: "lessThan", property, value: parameter }]
        : [];
    case "lessThanOrEqual":
      return typeof parameter === "number"
        ? [{ type: "lessThanOrEqual", property, value: parameter }]
        : [];
    case "contains":
      return typeof parameter === "string"
        ? [{ type: "containsSegment", property, value: parameter }]
        : [];
    case "startsWith":
      return typeof parameter === "string"
        ? [{ type: "startsWith", property, value: parameter }]
        : [];
    case "endsWith":
      return typeof parameter === "string"
        ? [{ type: "endsWith", property, value: parameter }]
        : [];
  }
};

/**
 * Whether a filter currently contributes a clause to the query – i.e. whether
 * it is "active". A filter that builds no clause (incomplete / invalid) is not
 * active and is shown in a muted state in the ribbon.
 */
export const isPropertyFilterActive = (filter: PropertyFilter): boolean =>
  buildPropertyFilterClause(filter) !== null;
