import { describe, expect, expectTypeOf, it } from "vitest";

import { filterableKinds } from "@local/hash-isomorphic-utils/flows/filter-condition";

import { evaluateIf, filterList } from "./filter-values.js";

import type { FilterListResult, IfResult } from "./filter-values.js";
import type { Url } from "@blockprotocol/type-system";
import type {
  ConditionNode,
  FilterCondition,
  FilterLeaf,
} from "@local/hash-isomorphic-utils/flows/filter-condition";
import type { PayloadKind } from "@local/hash-isomorphic-utils/flows/types";

const all = (...conditions: ConditionNode[]): FilterCondition => ({
  kind: "all",
  conditions,
});

const leaf: FilterLeaf = {
  kind: "condition",
  subject: { kind: "input", payloadKind: "Number" },
  operator: "greaterThan",
  value: { kind: "Number", value: 5 },
};
const condition = all(leaf);

describe("evaluateIf", () => {
  it.each([
    { value: 6, outputName: "true" },
    { value: 5, outputName: "false" },
  ])("routes $value only to $outputName", ({ value, outputName }) => {
    const result = evaluateIf({ kind: "Number", value }, condition);
    expectTypeOf(result).toEqualTypeOf<IfResult>();
    expect(result).toStrictEqual({ status: "success", outputName });
  });

  it("only reads the payload, so the caller can emit it unchanged", () => {
    const page = Object.freeze({
      url: "https://example.com" as Url,
      title: "HASH",
      htmlContent: "",
      innerText: "",
    });
    const input = Object.freeze({ kind: "WebPage" as const, value: page });
    const snapshot = structuredClone(input);
    const result = evaluateIf(
      input,
      all({
        kind: "condition",
        subject: { kind: "field", path: ["title"], payloadKind: "Text" },
        operator: "equals",
        value: { kind: "Text", value: "HASH" },
      }),
    );
    expect(result).toStrictEqual({ status: "success", outputName: "true" });
    expect(input).toStrictEqual(snapshot);
    expect(input.value).toBe(page);
  });

  it("does not choose a branch for invalid conditions", () => {
    const result = evaluateIf(
      { kind: "Number", value: 6 },
      all({ ...leaf, operator: "contains" }),
    );
    expect(result).toMatchObject({ status: "error", code: "invalidCondition" });
    expect(result).not.toHaveProperty("outputName");
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

  it("keeps a stable split for nested conditions", () => {
    const below = (value: number): FilterLeaf => ({
      ...leaf,
      operator: "lessThan",
      value: { kind: "Number", value },
    });
    // Matches values in (5, 9) or exactly 0.
    const nested: FilterCondition = {
      kind: "any",
      conditions: [
        all(leaf, below(9)),
        all({
          ...leaf,
          operator: "equals",
          value: { kind: "Number", value: 0 },
        }),
      ],
    };
    expect(
      filterList({ kind: "Number", value: [8, 0, 9, 6, 1, 8, 0] }, nested),
    ).toEqual({
      status: "success",
      matching: { kind: "Number", value: [8, 0, 6, 8, 0] },
      nonMatching: { kind: "Number", value: [9, 1] },
    });
  });

  it("validates the condition even when there are no items", () => {
    expect(
      filterList(
        { kind: "Number", value: [] },
        all({ ...leaf, operator: "contains" }),
      ),
    ).toMatchObject({ status: "error", code: "invalidCondition" });
  });

  const isPresent = (payloadKind: PayloadKind): FilterCondition =>
    all({
      kind: "condition",
      subject: { kind: "input", payloadKind },
      operator: "isNotEmpty",
    });

  it.each(filterableKinds)("accepts %s items", (kind) => {
    expect(filterList({ kind, value: [] }, isPresent(kind))).toMatchObject({
      status: "success",
    });
  });

  it.each(["FailedEntityProposal", "FilterCondition"] as const)(
    "rejects %s items, even for a condition that fits them",
    (kind) => {
      expect(filterList({ kind, value: [] }, isPresent(kind))).toMatchObject({
        status: "error",
        code: "invalidCondition",
      });
    },
  );

  it("does not return partial arrays when an item is invalid", () => {
    const result = filterList(
      { kind: "Number", value: [9, Number.NaN] },
      condition,
    );
    expect(result).toMatchObject({ status: "error", code: "invalidValue" });
    expect(result).not.toHaveProperty("matching");
  });
});
