import { describe, expect, it } from "vitest";

import { evaluateFilter } from "./evaluate-filter.js";

import type { FilterValue, ScalarFilterCondition } from "./evaluate-filter.js";
import type { EntityId } from "@blockprotocol/type-system";

const entityId =
  "00000000-0000-4000-8000-000000000001~00000000-0000-4000-8000-000000000002" as EntityId;
const otherEntityId =
  "00000000-0000-4000-8000-000000000001~00000000-0000-4000-8000-000000000003" as EntityId;

const values: FilterValue[] = [
  { kind: "Text", value: "hello" },
  { kind: "Number", value: 4 },
  { kind: "Boolean", value: true },
  { kind: "Date", value: "2026-10-07" },
  { kind: "EntityId", value: entityId },
];

describe("evaluateFilter", () => {
  it("returns an error for an unknown operator instead of choosing a branch", () => {
    expect(
      evaluateFilter({
        value: { kind: "Text", value: "hello" },
        condition: {
          operator: "unknown" as ScalarFilterCondition["operator"],
          operand: "hello",
        },
      }),
    ).toMatchObject({ status: "error", code: "unsupportedOperator" });
  });

  it.each([
    { kind: "Text", value: 42 },
    { kind: "Boolean", value: "false" },
    { kind: "EntityId", value: 42 },
  ] as const)("rejects incorrectly tagged $kind input", (value) => {
    expect(
      evaluateFilter({
        value: value as unknown as FilterValue,
        condition: { operator: "equals", operand: value.value },
      }),
    ).toMatchObject({ status: "error", code: "invalidValue" });
  });

  describe.each<{
    value: FilterValue;
    equal: ScalarFilterCondition["operand"];
    different: ScalarFilterCondition["operand"];
  }>([
    { value: { kind: "Text", value: "" }, equal: "", different: "hello" },
    { value: { kind: "Number", value: 0 }, equal: 0, different: 1 },
    { value: { kind: "Boolean", value: false }, equal: false, different: true },
    {
      value: { kind: "Date", value: "2026-10-07" },
      equal: "2026-10-07",
      different: "2026-10-08",
    },
    {
      value: { kind: "EntityId", value: entityId },
      equal: entityId,
      different: otherEntityId,
    },
  ])("equality for $value.kind", ({ value, equal, different }) => {
    it.each(["equals", "notEquals"] as const)("%s", (operator) => {
      expect(
        evaluateFilter({ value, condition: { operator, operand: equal } }),
      ).toEqual({
        status: "success",
        branch: operator === "equals" ? "matched" : "notMatched",
      });
      expect(
        evaluateFilter({ value, condition: { operator, operand: different } }),
      ).toEqual({
        status: "success",
        branch: operator === "equals" ? "notMatched" : "matched",
      });
    });
  });

  it.each([
    { text: "hello world", operand: "world", branch: "matched" },
    { text: "hello world", operand: "World", branch: "notMatched" },
    { text: "", operand: "hello", branch: "notMatched" },
    { text: "", operand: "", branch: "matched" },
    { text: "hello", operand: "", branch: "matched" },
  ])("contains: $text / $operand", ({ text, operand, branch }) => {
    expect(
      evaluateFilter({
        value: { kind: "Text", value: text },
        condition: { operator: "contains", operand },
      }),
    ).toEqual({ status: "success", branch });
  });

  describe.each(["startsWith", "endsWith"] as const)("%s", (operator) => {
    it.each([
      { text: "HASH", operand: "HASH", branch: "matched" },
      { text: "HASH", operand: "hash", branch: "notMatched" },
      { text: "", operand: "HASH", branch: "notMatched" },
      { text: "HASH", operand: "", branch: "matched" },
    ])("$text / $operand", ({ text, operand, branch }) => {
      expect(
        evaluateFilter({
          value: { kind: "Text", value: text },
          condition: { operator, operand },
        }),
      ).toEqual({ status: "success", branch });
    });
  });

  describe.each<{
    value: FilterValue;
    smaller: ScalarFilterCondition["operand"];
    equal: ScalarFilterCondition["operand"];
    larger: ScalarFilterCondition["operand"];
  }>([
    { value: { kind: "Number", value: 0 }, smaller: -2, equal: 0, larger: 10 },
    {
      value: { kind: "Number", value: 2.5 },
      smaller: 2,
      equal: 2.5,
      larger: 10,
    },
    {
      value: { kind: "Date", value: "2024-02-29" },
      smaller: "2023-12-31",
      equal: "2024-02-29",
      larger: "2024-03-01",
    },
  ])("ordering for $value", ({ value, smaller, equal, larger }) => {
    it.each([
      {
        operator: "greaterThan",
        smaller: "matched",
        equal: "notMatched",
        larger: "notMatched",
      },
      {
        operator: "greaterThanOrEqual",
        smaller: "matched",
        equal: "matched",
        larger: "notMatched",
      },
      {
        operator: "lessThan",
        smaller: "notMatched",
        equal: "notMatched",
        larger: "matched",
      },
      {
        operator: "lessThanOrEqual",
        smaller: "notMatched",
        equal: "matched",
        larger: "matched",
      },
    ] as const)("$operator", ({ operator, ...branches }) => {
      expect(
        evaluateFilter({ value, condition: { operator, operand: smaller } }),
      ).toEqual({
        status: "success",
        branch: branches.smaller,
      });
      expect(
        evaluateFilter({ value, condition: { operator, operand: equal } }),
      ).toEqual({ status: "success", branch: branches.equal });
      expect(
        evaluateFilter({ value, condition: { operator, operand: larger } }),
      ).toEqual({
        status: "success",
        branch: branches.larger,
      });
    });
  });

  describe.each<{ value: FilterValue; empty: boolean }>([
    { value: { kind: "Text", value: "" }, empty: true },
    { value: { kind: "Text", value: " " }, empty: false },
    { value: { kind: "Text", value: "hello" }, empty: false },
    { value: { kind: "Number", value: 0 }, empty: false },
    { value: { kind: "Boolean", value: false }, empty: false },
    { value: { kind: "Date", value: "" }, empty: true },
    { value: { kind: "Date", value: "2026-10-07" }, empty: false },
    { value: { kind: "EntityId", value: "" as EntityId }, empty: true },
    { value: { kind: "EntityId", value: entityId }, empty: false },
  ])("emptiness for $value", ({ value, empty }) => {
    it.each(["isEmpty", "isNotEmpty"] as const)("%s", (operator) => {
      expect(evaluateFilter({ value, condition: { operator } })).toEqual({
        status: "success",
        branch: empty === (operator === "isEmpty") ? "matched" : "notMatched",
      });
    });
  });

  describe.each(values)("invalid conditions for $kind", (value) => {
    const unsupportedOperators: Record<
      FilterValue["kind"],
      ScalarFilterCondition["operator"][]
    > = {
      Text: [
        "greaterThan",
        "lessThan",
        "greaterThanOrEqual",
        "lessThanOrEqual",
      ],
      Number: ["contains", "startsWith", "endsWith"],
      Boolean: [
        "contains",
        "startsWith",
        "endsWith",
        "greaterThan",
        "lessThan",
        "greaterThanOrEqual",
        "lessThanOrEqual",
      ],
      Date: ["contains", "startsWith", "endsWith"],
      EntityId: [
        "contains",
        "startsWith",
        "endsWith",
        "greaterThan",
        "lessThan",
        "greaterThanOrEqual",
        "lessThanOrEqual",
      ],
    };

    it.each(unsupportedOperators[value.kind])("rejects %s", (operator) => {
      expect(
        evaluateFilter({
          value,
          condition: { operator, operand: value.value },
        }),
      ).toEqual({
        status: "error",
        code: "unsupportedOperator",
        message: expect.any(String) as unknown,
      });
    });

    it("rejects a mismatched operand instead of coercing it", () => {
      expect(
        evaluateFilter({
          value,
          condition: {
            operator: "equals",
            operand: value.kind === "Number" ? "4" : 4,
          },
        }),
      ).toEqual({
        status: "error",
        code: "invalidOperand",
        message: expect.any(String) as unknown,
      });
    });
  });

  it.each<{ value: FilterValue; operator: ScalarFilterCondition["operator"] }>([
    { value: { kind: "Text", value: "hello" }, operator: "equals" },
    { value: { kind: "Boolean", value: false }, operator: "notEquals" },
    { value: { kind: "Text", value: "hello" }, operator: "contains" },
    { value: { kind: "Text", value: "hello" }, operator: "startsWith" },
    { value: { kind: "Text", value: "hello" }, operator: "endsWith" },
    { value: { kind: "Number", value: 0 }, operator: "greaterThan" },
    { value: { kind: "Number", value: 0 }, operator: "greaterThanOrEqual" },
    { value: { kind: "Date", value: "2026-10-07" }, operator: "lessThan" },
    {
      value: { kind: "Date", value: "2026-10-07" },
      operator: "lessThanOrEqual",
    },
  ])("requires an operand for $operator", ({ value, operator }) => {
    expect(evaluateFilter({ value, condition: { operator } })).toEqual({
      status: "error",
      code: "missingOperand",
      message: expect.any(String) as unknown,
    });
  });

  describe.each<FilterValue>([
    { kind: "Date", value: "not a date" },
    { kind: "Date", value: "2025-02-29" },
    { kind: "Date", value: "2026-04-31" },
    { kind: "Date", value: "2026-13-01" },
    { kind: "Date", value: "2026-1-1" },
    { kind: "Date", value: "2026-10-07T00:00:00Z" },
    { kind: "Number", value: Number.NaN },
    { kind: "Number", value: Number.POSITIVE_INFINITY },
    { kind: "Number", value: Number.NEGATIVE_INFINITY },
  ])("invalid scalar $value", (value) => {
    it.each(["equals", "isEmpty"] as const)(
      "rejects the input for %s",
      (operator) => {
        expect(
          evaluateFilter({
            value,
            condition: { operator, operand: value.value },
          }),
        ).toEqual({
          status: "error",
          code: "invalidValue",
          message: expect.any(String) as unknown,
        });
      },
    );

    it("rejects an invalid operand", () => {
      expect(
        evaluateFilter({
          value:
            value.kind === "Date"
              ? { kind: "Date", value: "2026-10-07" }
              : { kind: "Number", value: 0 },
          condition: { operator: "equals", operand: value.value },
        }),
      ).toEqual({
        status: "error",
        code: "invalidOperand",
        message: expect.any(String) as unknown,
      });
    });
  });

  it("does not compare an empty date as a valid date", () => {
    expect(
      evaluateFilter({
        value: { kind: "Date", value: "" },
        condition: { operator: "equals", operand: "" },
      }),
    ).toEqual({
      status: "error",
      code: "invalidValue",
      message: expect.any(String) as unknown,
    });
  });

  it("ignores an operand for unary conditions without modifying the input", () => {
    const input = Object.freeze({
      value: Object.freeze({ kind: "Text" as const, value: "hello" }),
      condition: Object.freeze({ operator: "isNotEmpty" as const, operand: 0 }),
    });

    expect(evaluateFilter(input)).toEqual({
      status: "success",
      branch: "matched",
    });
    expect(input).toEqual({
      value: { kind: "Text", value: "hello" },
      condition: { operator: "isNotEmpty", operand: 0 },
    });
  });
});
