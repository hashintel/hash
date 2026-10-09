import { describe, expect, expectTypeOf, it } from "vitest";

import { evaluateIf, filterList } from "./filter-values.js";

import type { FilterCondition, FilterLeaf } from "./evaluate-condition.js";
import type { FilterListResult, IfResult } from "./filter-values.js";
import type { Url } from "@blockprotocol/type-system";

const and = (...conditions: FilterLeaf[]): FilterCondition => ({
  kind: "group",
  combinator: "and",
  conditions,
});

const leaf: FilterLeaf = {
  kind: "condition",
  subject: { kind: "input", payloadKind: "Number" },
  operator: "greaterThan",
  value: { kind: "Number", value: 5 },
};
const condition = and(leaf);

describe("evaluateIf", () => {
  it.each([
    { value: 6, outputName: "true" },
    { value: 5, outputName: "false" },
  ])("routes $value only to $outputName", ({ value, outputName }) => {
    const input = Object.freeze({ kind: "Number" as const, value });
    const result = evaluateIf(input, condition);
    expectTypeOf(result).toEqualTypeOf<IfResult<"Number">>();
    expect(result).toEqual({ status: "success", outputName, payload: input });
    if (result.status === "success") {
      expect(result.payload).toBe(input);
    }
  });

  it("preserves the original object and payload kind when filtering a field", () => {
    const input = {
      kind: "WebPage" as const,
      value: {
        url: "https://example.com" as Url,
        title: "HASH",
        htmlContent: "",
        innerText: "",
      },
    };
    const result = evaluateIf(
      input,
      and({
        kind: "condition",
        subject: { kind: "field", path: ["title"], payloadKind: "Text" },
        operator: "equals",
        value: { kind: "Text", value: "HASH" },
      }),
    );
    expectTypeOf(result).toEqualTypeOf<IfResult<"WebPage">>();
    expect(result).toEqual({
      status: "success",
      outputName: "true",
      payload: input,
    });
    if (result.status === "success") {
      expect(result.payload.value).toBe(input.value);
    }
  });

  it("does not emit either branch for invalid conditions", () => {
    const result = evaluateIf(
      { kind: "Number", value: 6 },
      and({ ...leaf, operator: "contains" }),
    );
    expect(result).toMatchObject({ status: "error", code: "invalidCondition" });
    expect(result).not.toHaveProperty("payload");
  });
});

describe("filterList", () => {
  it.each([
    { values: [8, 1, 7, 8, 5, 0], matching: [8, 7, 8], nonMatching: [1, 5, 0] },
    { values: [7, 9], matching: [7, 9], nonMatching: [] },
    { values: [0, 5], matching: [], nonMatching: [0, 5] },
    { values: [], matching: [], nonMatching: [] },
  ])(
    "partitions $values without dropping order or duplicates",
    ({ values, matching, nonMatching }) => {
      const input = { kind: "Number" as const, value: Object.freeze(values) };
      const result = filterList(input, condition);
      expectTypeOf(result).toEqualTypeOf<FilterListResult<"Number">>();
      expect(result).toEqual({
        status: "success",
        matching: { kind: "Number", value: matching },
        nonMatching: { kind: "Number", value: nonMatching },
      });
    },
  );

  it("validates the condition even when there are no items", () => {
    expect(
      filterList(
        { kind: "Number", value: [] },
        and({ ...leaf, operator: "contains" }),
      ),
    ).toMatchObject({ status: "error", code: "invalidCondition" });
  });

  it("does not return partial arrays when an item is invalid", () => {
    const result = filterList(
      { kind: "Number", value: [9, Number.NaN] },
      condition,
    );
    expect(result).toMatchObject({ status: "error", code: "invalidValue" });
    expect(result).not.toHaveProperty("matching");
  });
});
