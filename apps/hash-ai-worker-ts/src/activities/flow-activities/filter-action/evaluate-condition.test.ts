import { describe, expect, it } from "vitest";

import { evaluateCondition, validateCondition } from "./evaluate-condition.js";

import type {
  ConditionInput,
  FilterCondition,
  FilterLeaf,
} from "./evaluate-condition.js";
import type {
  BaseUrl,
  EntityId,
  VersionedUrl,
} from "@blockprotocol/type-system";

const scoreUrl = "https://example.com/types/property-type/score/" as BaseUrl;
const companyType =
  "https://example.com/types/entity-type/company/v/1" as VersionedUrl;
const otherType =
  "https://example.com/types/entity-type/person/v/1" as VersionedUrl;
const entityId =
  "00000000-0000-4000-8000-000000000001~00000000-0000-4000-8000-000000000002" as EntityId;

const and = (...conditions: FilterLeaf[]): FilterCondition => ({
  kind: "group",
  combinator: "and",
  conditions,
});

const scoreCondition: FilterLeaf = {
  kind: "condition",
  subject: { kind: "field", path: ["score"], payloadKind: "Number" },
  operator: "greaterThan",
  value: { kind: "Number", value: 8 },
};

describe("evaluateCondition", () => {
  it.each<{
    input: ConditionInput;
    operator: FilterLeaf["operator"];
    operand: FilterLeaf["value"];
    matches: boolean;
  }>([
    {
      input: { kind: "Text", value: "prefix-tail" },
      operator: "startsWith",
      operand: { kind: "Text", value: "prefix" },
      matches: true,
    },
    {
      input: { kind: "Text", value: "prefix-tail" },
      operator: "startsWith",
      operand: { kind: "Text", value: "tail" },
      matches: false,
    },
    {
      input: { kind: "Text", value: "prefix-tail" },
      operator: "endsWith",
      operand: { kind: "Text", value: "tail" },
      matches: true,
    },
    {
      input: { kind: "Text", value: "prefix-tail" },
      operator: "endsWith",
      operand: { kind: "Text", value: "prefix" },
      matches: false,
    },
    {
      input: { kind: "Number", value: 8 },
      operator: "greaterThanOrEqual",
      operand: { kind: "Number", value: 8 },
      matches: true,
    },
    {
      input: { kind: "Date", value: "2026-10-08" },
      operator: "lessThanOrEqual",
      operand: { kind: "Date", value: "2026-10-07" },
      matches: false,
    },
  ])("$operator for $input", ({ input, operator, operand, matches }) => {
    expect(
      evaluateCondition(
        and({
          kind: "condition",
          subject: { kind: "input", payloadKind: input.kind },
          operator,
          value: operand,
        }),
        input,
      ),
    ).toEqual({ status: "success", matches });
  });

  it.each([
    { value: undefined },
    { value: null },
    { value: "" },
    { value: [] },
  ])(
    "treats $value as empty with explicit presence exceptions",
    ({ value }) => {
      const subject = { kind: "input", payloadKind: "Text" } as const;
      for (const [operator, matches] of [
        ["equals", false],
        ["notEquals", true],
        ["contains", false],
      ] as const) {
        expect(
          evaluateCondition(
            and({
              kind: "condition",
              subject,
              operator,
              value: { kind: "Text", value: "x" },
            }),
            { kind: "Text", value },
          ),
        ).toEqual({ status: "success", matches });
      }
      expect(
        evaluateCondition(
          and({ kind: "condition", subject, operator: "isEmpty" }),
          { kind: "Text", value },
        ),
      ).toEqual({ status: "success", matches: true });
      expect(
        evaluateCondition(
          and({ kind: "condition", subject, operator: "isNotEmpty" }),
          { kind: "Text", value },
        ),
      ).toEqual({ status: "success", matches: false });
    },
  );

  it.each<ConditionInput>([
    { kind: "Number", value: 0 },
    { kind: "Boolean", value: false },
    { kind: "Text", value: " " },
    { kind: "EntityId", value: entityId },
  ])("keeps $value present", (input) => {
    expect(
      evaluateCondition(
        and({
          kind: "condition",
          subject: { kind: "input", payloadKind: input.kind },
          operator: "isNotEmpty",
        }),
        input,
      ),
    ).toEqual({ status: "success", matches: true });
  });

  it("supports presence checks on non-scalar kinds", () => {
    expect(
      evaluateCondition(
        and({
          kind: "condition",
          subject: { kind: "input", payloadKind: "WebPage" },
          operator: "isEmpty",
        }),
        { kind: "WebPage", value: {} },
      ),
    ).toEqual({ status: "success", matches: false });
  });

  it.each<ConditionInput>([
    { kind: "Number", value: Number.NaN },
    { kind: "Date", value: "2026-02-30" },
    { kind: "Boolean", value: "false" },
  ])("rejects malformed $kind values even for presence checks", (input) => {
    for (const operator of ["isEmpty", "isNotEmpty"] as const) {
      expect(
        evaluateCondition(
          and({
            kind: "condition",
            subject: { kind: "input", payloadKind: input.kind },
            operator,
          }),
          input,
        ),
      ).toMatchObject({ status: "error", code: "invalidValue" });
    }
  });

  it.each([
    { score: [1, 10, 2], expected: { status: "success", matches: true } },
    { score: [1, 8, 2], expected: { status: "success", matches: false } },
    { score: [10, "bad"], expected: { status: "error", code: "invalidValue" } },
  ])(
    "checks every multi-valued subject element in $score",
    ({ score, expected }) => {
      expect(
        evaluateCondition(and(scoreCondition), {
          kind: "WebPage",
          value: { score },
        }),
      ).toMatchObject(expected);
    },
  );

  it.each([
    { tags: ["a", "b"], expected: { status: "success", matches: false } },
    { tags: ["b", "c"], expected: { status: "success", matches: true } },
    { tags: ["b", 1], expected: { status: "error", code: "invalidValue" } },
  ])("negates equals for notEquals over $tags", ({ tags, expected }) => {
    expect(
      evaluateCondition(
        and({
          kind: "condition",
          subject: { kind: "field", path: ["tags"], payloadKind: "Text" },
          operator: "notEquals",
          value: { kind: "Text", value: "a" },
        }),
        { kind: "WebPage", value: { tags } },
      ),
    ).toMatchObject(expected);
  });

  it("does not treat different versions of an entity type as equal", () => {
    expect(
      evaluateCondition(
        and({
          kind: "condition",
          subject: { kind: "entityType" },
          operator: "isOfType",
          value: { kind: "VersionedUrl", value: companyType },
        }),
        {
          kind: "ProposedEntity",
          value: {
            properties: {},
            entityTypeIds: [
              "https://example.com/types/entity-type/company/v/2",
            ],
          },
        },
      ),
    ).toEqual({ status: "success", matches: false });
  });

  it.each(["and", "or"] as const)("evaluates a flat %s group", (combinator) => {
    const condition: FilterCondition = {
      kind: "group",
      combinator,
      conditions: [
        scoreCondition,
        {
          ...scoreCondition,
          subject: { kind: "field", path: ["active"], payloadKind: "Boolean" },
          operator: "equals",
          value: { kind: "Boolean", value: true },
        },
      ],
    };
    for (const [score, active, andResult, orResult] of [
      [9, true, true, true],
      [9, false, false, true],
      [1, true, false, true],
      [1, false, false, false],
    ] as const) {
      expect(
        evaluateCondition(condition, {
          kind: "WebPage",
          value: { score, active },
        }),
      ).toEqual({
        status: "success",
        matches: combinator === "and" ? andResult : orResult,
      });
    }
  });

  it("does not hide malformed values behind a successful OR branch", () => {
    expect(
      evaluateCondition(
        {
          kind: "group",
          combinator: "or",
          conditions: [
            scoreCondition,
            {
              ...scoreCondition,
              subject: {
                kind: "field",
                path: ["badScore"],
                payloadKind: "Number",
              },
            },
          ],
        },
        { kind: "WebPage", value: { score: 10, badScore: "ten" } },
      ),
    ).toMatchObject({ status: "error", code: "invalidValue" });
  });

  it("reads nested own fields, not inherited properties", () => {
    const condition: FilterLeaf = {
      ...scoreCondition,
      subject: {
        kind: "field",
        path: ["details", "score"],
        payloadKind: "Number",
      },
    };
    expect(
      evaluateCondition(and(condition), {
        kind: "WebPage",
        value: { details: { score: 9 } },
      }),
    ).toEqual({ status: "success", matches: true });
    expect(
      evaluateCondition(and(condition), {
        kind: "WebPage",
        value: { details: Object.create({ score: 9 }) as unknown },
      }),
    ).toEqual({ status: "success", matches: false });
  });

  it("evaluates entity properties and direct type membership without I/O", () => {
    const entity = {
      properties: { [scoreUrl]: 10 },
      entityTypeIds: [otherType, companyType],
    };
    const input = { kind: "EntityId", value: entityId } as const;
    const context = { entities: new Map([[entityId, entity]]) };
    const propertyCondition: FilterLeaf = {
      ...scoreCondition,
      subject: {
        kind: "entityProperty",
        propertyTypeBaseUrl: scoreUrl,
        payloadKind: "Number",
      },
    };
    expect(evaluateCondition(and(propertyCondition), input, context)).toEqual({
      status: "success",
      matches: true,
    });
    expect(evaluateCondition(and(propertyCondition), input)).toMatchObject({
      status: "error",
      code: "entityRequired",
    });
    expect(
      evaluateCondition(and(propertyCondition), input, {
        entities: new Map([[entityId, { ...entity, properties: {} }]]),
      }),
    ).toEqual({ status: "success", matches: false });
    expect(
      evaluateCondition(
        and({
          kind: "condition",
          subject: { kind: "entityType" },
          operator: "isOfType",
          value: { kind: "VersionedUrl", value: companyType },
        }),
        input,
        context,
      ),
    ).toEqual({ status: "success", matches: true });
    expect(
      evaluateCondition(and(propertyCondition), {
        kind: "ProposedEntity",
        value: entity,
      }),
    ).toEqual({ status: "success", matches: true });
  });

  it("rejects invalid property data instead of treating it as a non-match", () => {
    expect(
      evaluateCondition(and(scoreCondition), {
        kind: "WebPage",
        value: { score: "9" },
      }),
    ).toMatchObject({ status: "error", code: "invalidValue" });
  });
});

describe("validateCondition", () => {
  it.each([
    { kind: "Text", value: 42 },
    { kind: "Boolean", value: "false" },
    { kind: "EntityId", value: 42 },
  ] as const)(
    "rejects a constant tagged $kind with the wrong runtime type",
    (value) => {
      const condition = and({
        kind: "condition",
        subject: { kind: "input", payloadKind: value.kind },
        operator: "equals",
        value,
      } as unknown as FilterLeaf);
      expect(validateCondition(condition, value.kind)).toMatchObject({
        status: "error",
        code: "invalidCondition",
      });
    },
  );

  it("rejects field subjects on primitive input kinds", () => {
    expect(validateCondition(and(scoreCondition), "Number")).toMatchObject({
      status: "error",
      code: "invalidCondition",
    });
  });

  it("validates the operand's kind, not just its JS type", () => {
    expect(
      validateCondition(
        and({
          kind: "condition",
          subject: { kind: "input", payloadKind: "Date" },
          operator: "equals",
          value: { kind: "Text", value: "2026-10-08" },
        }),
        "Date",
      ),
    ).toMatchObject({ status: "error", code: "invalidCondition" });
  });

  it("validates unsupported operators even when the subject is missing", () => {
    expect(
      evaluateCondition(
        and({
          ...scoreCondition,
          operator: "contains",
          value: { kind: "Number", value: 1 },
        }),
        { kind: "WebPage", value: {} },
      ),
    ).toMatchObject({ status: "error", code: "invalidCondition" });
  });

  it.each(["__proto__", "constructor", "prototype"])(
    "rejects unsafe field segment %s",
    (segment) => {
      expect(
        validateCondition(
          and({
            ...scoreCondition,
            subject: {
              kind: "field",
              path: [segment, "score"],
              payloadKind: "Number",
            },
          }),
          "WebPage",
        ),
      ).toMatchObject({ status: "error", code: "invalidCondition" });
    },
  );

  it("rejects empty and nested groups", () => {
    expect(
      validateCondition(
        { kind: "group", combinator: "and", conditions: [] },
        "Number",
      ),
    ).toMatchObject({ status: "error", code: "invalidCondition" });
    const nested: FilterCondition = {
      kind: "group",
      combinator: "or",
      conditions: [and(scoreCondition)],
    };
    expect(validateCondition(nested, "WebPage")).toMatchObject({
      status: "error",
      code: "invalidCondition",
    });
  });

  it("rejects a bare leaf as the top-level condition", () => {
    expect(
      validateCondition(
        scoreCondition as unknown as FilterCondition,
        "WebPage",
      ),
    ).toMatchObject({ status: "error", code: "invalidCondition" });
  });

  it("rejects a missing operand, wrong input kind, and an operand on presence checks", () => {
    expect(
      validateCondition(
        and({ ...scoreCondition, value: undefined }),
        "WebPage",
      ),
    ).toMatchObject({ status: "error" });
    expect(
      validateCondition(
        and({
          ...scoreCondition,
          subject: { kind: "input", payloadKind: "Number" },
        }),
        "Text",
      ),
    ).toMatchObject({ status: "error" });
    expect(
      validateCondition(
        and({ ...scoreCondition, operator: "isEmpty" }),
        "WebPage",
      ),
    ).toMatchObject({ status: "error" });
  });
});
