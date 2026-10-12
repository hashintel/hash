import { describe, expect, it } from "vitest";

import {
  evaluateCondition,
  evaluateValidatedCondition,
} from "./evaluate-condition.js";

import type { ConditionInput } from "./evaluate-condition.js";
import type {
  BaseUrl,
  EntityId,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type {
  ConditionNode,
  FilterCondition,
  FilterLeaf,
} from "@local/hash-isomorphic-utils/flows/filter-condition";

const scoreUrl = "https://example.com/types/property-type/score/" as BaseUrl;
const companyType =
  "https://example.com/types/entity-type/company/v/1" as VersionedUrl;
const otherType =
  "https://example.com/types/entity-type/person/v/1" as VersionedUrl;
const entityId =
  "00000000-0000-4000-8000-000000000001~00000000-0000-4000-8000-000000000002" as EntityId;

const all = (...conditions: ConditionNode[]): FilterCondition => ({
  kind: "all",
  conditions,
});
const any = (...conditions: ConditionNode[]): FilterCondition => ({
  kind: "any",
  conditions,
});
const not = (condition: ConditionNode): ConditionNode => ({
  kind: "not",
  condition,
});

const scoreCondition: FilterLeaf = {
  kind: "condition",
  subject: { kind: "field", path: ["score"], payloadKind: "Number" },
  operator: "greaterThan",
  value: { kind: "Number", value: 8 },
};

const activeCondition: FilterLeaf = {
  kind: "condition",
  subject: { kind: "field", path: ["active"], payloadKind: "Boolean" },
  operator: "equals",
  value: { kind: "Boolean", value: true },
};

const featuredCondition: FilterLeaf = {
  kind: "condition",
  subject: { kind: "field", path: ["tags"], payloadKind: "Text" },
  operator: "equals",
  value: { kind: "Text", value: "featured" },
};

const badScoreCondition: FilterLeaf = {
  ...scoreCondition,
  subject: { kind: "field", path: ["badScore"], payloadKind: "Number" },
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
        all({
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
            all({
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
          all({ kind: "condition", subject, operator: "isEmpty" }),
          { kind: "Text", value },
        ),
      ).toEqual({ status: "success", matches: true });
      expect(
        evaluateCondition(
          all({ kind: "condition", subject, operator: "isNotEmpty" }),
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
        all({
          kind: "condition",
          subject: { kind: "input", payloadKind: input.kind },
          operator: "isNotEmpty",
        }),
        input,
      ),
    ).toEqual({ status: "success", matches: true });
  });

  it.each([
    { tags: [null, ""], empty: true },
    { tags: [null, "a"], empty: false },
  ])(
    "treats an array as empty only when every element is, for $tags",
    ({ tags, empty }) => {
      const subject = {
        kind: "field",
        path: ["tags"],
        payloadKind: "Text",
      } as const;
      const input = { kind: "WebPage", value: { tags } } as const;
      expect(
        evaluateCondition(
          all({ kind: "condition", subject, operator: "isEmpty" }),
          input,
        ),
      ).toEqual({ status: "success", matches: empty });
      expect(
        evaluateCondition(
          all({ kind: "condition", subject, operator: "isNotEmpty" }),
          input,
        ),
      ).toEqual({ status: "success", matches: !empty });
    },
  );

  it("reports isOfType on a non-entity subject as an invalid condition even when the value is empty", () => {
    expect(
      evaluateValidatedCondition(
        all({
          kind: "condition",
          subject: { kind: "field", path: ["type"], payloadKind: "Text" },
          operator: "isOfType",
          value: { kind: "VersionedUrl", value: companyType },
        }),
        { kind: "WebPage", value: {} },
      ),
    ).toMatchObject({ status: "error", code: "invalidCondition" });
  });

  it("supports presence checks on non-scalar kinds", () => {
    expect(
      evaluateCondition(
        all({
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
          all({
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
        evaluateCondition(all(scoreCondition), {
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
        all({
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
        all({
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

  it.each(["all", "any"] as const)("evaluates a flat %s group", (kind) => {
    const condition = (kind === "all" ? all : any)(
      scoreCondition,
      activeCondition,
    );
    for (const [score, active, allResult, anyResult] of [
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
        matches: kind === "all" ? allResult : anyResult,
      });
    }
  });

  it.each([
    { score: 9, active: true, tags: [], matches: true },
    { score: 9, active: false, tags: [], matches: false },
    { score: 1, active: true, tags: ["featured"], matches: true },
    { score: 1, active: false, tags: ["other"], matches: false },
  ])(
    "evaluates any[all[score, active], featured] for $score, $active, $tags",
    ({ matches, ...value }) => {
      expect(
        evaluateCondition(
          any(all(scoreCondition, activeCondition), featuredCondition),
          { kind: "WebPage", value },
        ),
      ).toEqual({ status: "success", matches });
    },
  );

  it.each([
    { value: { score: 9, active: true }, leaf: false, group: false },
    { value: { score: 9, active: false }, leaf: false, group: true },
    { value: { score: 1, active: true }, leaf: true, group: true },
  ])("negates a leaf and a group for $value", ({ value, leaf, group }) => {
    const input = { kind: "WebPage", value } as const;
    expect(evaluateCondition(all(not(scoreCondition)), input)).toEqual({
      status: "success",
      matches: leaf,
    });
    expect(evaluateCondition(all(not(not(scoreCondition))), input)).toEqual({
      status: "success",
      matches: !leaf,
    });
    expect(
      evaluateCondition(all(not(all(scoreCondition, activeCondition))), input),
    ).toEqual({ status: "success", matches: group });
  });

  it("negates the result, so not matches missing values that the inverse operator does not", () => {
    const input = { kind: "WebPage", value: {} } as const;
    expect(evaluateCondition(all(not(scoreCondition)), input)).toEqual({
      status: "success",
      matches: true,
    });
    expect(
      evaluateCondition(
        all({ ...scoreCondition, operator: "lessThanOrEqual" }),
        input,
      ),
    ).toEqual({ status: "success", matches: false });
    for (const condition of [
      not(featuredCondition),
      { ...featuredCondition, operator: "notEquals" } as const,
    ]) {
      expect(evaluateCondition(all(condition), input)).toEqual({
        status: "success",
        matches: true,
      });
    }
  });

  it("does not negate errors into a match", () => {
    expect(
      evaluateCondition(all(not(scoreCondition)), {
        kind: "WebPage",
        value: { score: "nine" },
      }),
    ).toMatchObject({ status: "error", code: "invalidValue" });
  });

  it.each([
    { name: "any", condition: any(scoreCondition, badScoreCondition) },
    {
      name: "all",
      condition: all(not(scoreCondition), any(badScoreCondition)),
    },
  ])(
    "does not hide malformed values once the $name result is known",
    ({ condition }) => {
      expect(
        evaluateCondition(condition, {
          kind: "WebPage",
          value: { score: 10, badScore: "ten" },
        }),
      ).toMatchObject({ status: "error", code: "invalidValue" });
    },
  );

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
      evaluateCondition(all(condition), {
        kind: "WebPage",
        value: { details: { score: 9 } },
      }),
    ).toEqual({ status: "success", matches: true });
    expect(
      evaluateCondition(all(condition), {
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
    expect(evaluateCondition(all(propertyCondition), input, context)).toEqual({
      status: "success",
      matches: true,
    });
    expect(evaluateCondition(all(propertyCondition), input)).toMatchObject({
      status: "error",
      code: "entityRequired",
    });
    expect(
      evaluateCondition(all(propertyCondition), input, {
        entities: new Map([[entityId, { ...entity, properties: {} }]]),
      }),
    ).toEqual({ status: "success", matches: false });
    expect(
      evaluateCondition(
        all({
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
      evaluateCondition(all(propertyCondition), {
        kind: "ProposedEntity",
        value: entity,
      }),
    ).toEqual({ status: "success", matches: true });
  });

  it("rejects invalid property data instead of treating it as a non-match", () => {
    expect(
      evaluateCondition(all(scoreCondition), {
        kind: "WebPage",
        value: { score: "9" },
      }),
    ).toMatchObject({ status: "error", code: "invalidValue" });
  });

  it("validates unsupported operators even when the subject is missing", () => {
    expect(
      evaluateCondition(
        all({
          ...scoreCondition,
          operator: "contains",
          value: { kind: "Number", value: 1 },
        }),
        { kind: "WebPage", value: {} },
      ),
    ).toMatchObject({ status: "error", code: "invalidCondition" });
  });
});
