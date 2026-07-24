import { describe, expect, it } from "vitest";

import {
  buildEndpointPropertyFilter,
  buildPropertyFilterClause,
} from "./build-property-filter-clause";

import type { PropertyFilter } from "./property-filter";
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
    const cases: Partial<PropertyFilter>[] = [
      { operator: "equals", value: "30" },
      { operator: "equals", value: undefined },
      { operator: "hasAnyValue", value: undefined },
      { operator: "greaterThan", value: "30" },
      { operator: "greaterThan", value: "not a number" },
      { kind: "string", operator: "greaterThan", value: "a" },
      { kind: "number", operator: "startsWith", value: "3" },
      { kind: "string", operator: "contains", value: " x " },
      { kind: "string", operator: "endsWith", value: "" },
    ];

    for (const overrides of cases) {
      const filter = propertyFilter(overrides);
      expect(buildEndpointPropertyFilter(filter) === null).toBe(
        buildPropertyFilterClause(filter) === null,
      );
    }
  });
});
