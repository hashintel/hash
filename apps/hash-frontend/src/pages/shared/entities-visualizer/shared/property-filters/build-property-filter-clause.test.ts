import { describe, expect, it } from "vitest";

import {
  buildEndpointPropertyFilter,
  buildPropertyFilterClause,
} from "./build-property-filter-clause";

import type {
  FilterValueKind,
  PropertyFilter,
  PropertyFilterOperator,
} from "./property-filter";
import type { BaseUrl } from "@blockprotocol/type-system";

const baseUrl = "https://example.com/types/property-type/age/" as BaseUrl;

const propertyFilter = (
  overrides: Partial<PropertyFilter>,
): PropertyFilter => ({
  id: "filter",
  baseUrl,
  title: "Age",
  kind: "number",
  operator: "equals",
  value: "30",
  ...overrides,
});

describe("buildEndpointPropertyFilter", () => {
  it("builds value-less operators without a value", () => {
    expect(
      buildEndpointPropertyFilter(
        propertyFilter({ operator: "hasAnyValue", value: undefined }),
      ),
    ).toEqual({ type: "hasAnyValue", property: baseUrl });
  });

  it("coerces number-kind values into numbers", () => {
    expect(
      buildEndpointPropertyFilter(
        propertyFilter({ operator: "greaterThan", value: "30" }),
      ),
    ).toEqual({ type: "greaterThan", property: baseUrl, value: 30 });
  });

  it("keeps string-kind values untrimmed", () => {
    expect(
      buildEndpointPropertyFilter(
        propertyFilter({
          kind: "string",
          operator: "startsWith",
          value: " Alice",
        }),
      ),
    ).toEqual({ type: "startsWith", property: baseUrl, value: " Alice" });
  });

  it("renders an incomplete filter inert", () => {
    expect(
      buildEndpointPropertyFilter(
        propertyFilter({ operator: "equals", value: undefined }),
      ),
    ).toBeNull();
    expect(
      buildEndpointPropertyFilter(
        propertyFilter({ operator: "greaterThan", value: "not a number" }),
      ),
    ).toBeNull();
  });

  it("renders a kind and operator mismatch inert instead of sending it", () => {
    // A string-kind value on an ordering comparator would be rejected by the
    // graph's Real-typed wire field as a whole-query error.
    expect(
      buildEndpointPropertyFilter(
        propertyFilter({ kind: "string", operator: "greaterThan", value: "a" }),
      ),
    ).toBeNull();
    expect(
      buildEndpointPropertyFilter(
        propertyFilter({ kind: "number", operator: "startsWith", value: "3" }),
      ),
    ).toBeNull();
  });

  it("agrees with the subgraph builder on which filters are inert", () => {
    // `isPropertyFilterActive` answers for both query paths through the
    // subgraph builder, so the two must never disagree on null-ness — a
    // divergence shows an active-looking pill whose filter the table drops.
    // Both unions are closed, so the whole space is enumerated rather than
    // sampled.
    const operators: PropertyFilterOperator[] = [
      "equals",
      "notEquals",
      "greaterThan",
      "greaterThanOrEqual",
      "lessThan",
      "lessThanOrEqual",
      "contains",
      "startsWith",
      "endsWith",
      "isTrue",
      "isFalse",
      "isEmpty",
      "hasAnyValue",
    ];
    const kinds: FilterValueKind[] = ["number", "string", "boolean"];
    const values = [undefined, "", "  ", "30", "not a number", "true"];

    for (const operator of operators) {
      for (const kind of kinds) {
        for (const value of values) {
          const filter = propertyFilter({ operator, kind, value });

          expect(
            buildEndpointPropertyFilter(filter) === null,
            `${kind} / ${operator} / ${JSON.stringify(value)}`,
          ).toBe(buildPropertyFilterClause(filter) === null);
        }
      }
    }
  });
});
