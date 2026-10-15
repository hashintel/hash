import { describe, expect, it } from "vitest";

import { conditionLeaves, validateCondition } from "./filter-condition.js";

import type {
  ConditionNode,
  FilterCondition,
  FilterLeaf,
} from "./filter-condition.js";

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

describe("validateCondition", () => {
  it.each([
    { kind: "Text", value: 42 },
    { kind: "Boolean", value: "false" },
    { kind: "EntityId", value: 42 },
  ] as const)(
    "rejects a constant tagged $kind with the wrong runtime type",
    (value) => {
      const condition = all({
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

  it("rejects an operator the subject's kind doesn't support, in its type and when validated", () => {
    // @ts-expect-error -- text can't be ordered
    const leaf: FilterLeaf = {
      kind: "condition",
      subject: { kind: "input", payloadKind: "Text" },
      operator: "greaterThan",
      value: { kind: "Text", value: "b" },
    };
    expect(validateCondition(all(leaf), "Text")).toEqual({
      status: "error",
      code: "invalidCondition",
      message: "Operator greaterThan does not support Text.",
    });
  });

  it.each([
    { value: "https://example.com/types/entity-type/company/v/1", valid: true },
    { value: "https://example.com/types/entity-type/company/", valid: false },
    {
      value: "https://example.com/types/entity-type/company/v/0",
      valid: false,
    },
    { value: 1, valid: false },
    { value: undefined, valid: false },
  ])(
    "checks that $value is a versioned entity type URL",
    ({ value, valid }) => {
      expect(
        validateCondition(
          all({
            kind: "condition",
            subject: { kind: "entityType" },
            operator: "isOfType",
            value: { kind: "VersionedUrl", value },
          } as never),
          "ProposedEntity",
        ),
      ).toEqual(
        valid
          ? undefined
          : {
              status: "error",
              code: "invalidCondition",
              message:
                "Entity type conditions require isOfType and a versioned type URL.",
            },
      );
    },
  );

  it("rejects field subjects on primitive input kinds", () => {
    expect(validateCondition(all(scoreCondition), "Number")).toMatchObject({
      status: "error",
      code: "invalidCondition",
    });
  });

  it("validates the operand's kind, not just its JS type", () => {
    expect(
      validateCondition(
        all({
          kind: "condition",
          subject: { kind: "input", payloadKind: "Date" },
          operator: "equals",
          value: { kind: "Text", value: "2026-10-08" },
        } as never),
        "Date",
      ),
    ).toMatchObject({ status: "error", code: "invalidCondition" });
  });

  it.each([
    {
      subjectKind: "DateTime",
      value: { kind: "Date", value: "2026-10-16" },
    },
    {
      subjectKind: "Date",
      value: { kind: "DateTime", value: "2026-10-16T14:00:00Z" },
    },
  ] as const)(
    "rejects comparing a $subjectKind with a $value.kind",
    ({ subjectKind, value }) => {
      // @ts-expect-error -- a comparison value must have its subject's kind
      const leaf: FilterLeaf = {
        kind: "condition",
        subject: { kind: "input", payloadKind: subjectKind },
        operator: "lessThan",
        value,
      };
      expect(validateCondition(all(leaf), subjectKind)).toMatchObject({
        status: "error",
        code: "invalidCondition",
      });
    },
  );

  it("accepts a DateTime condition, which needs an offset", () => {
    const leaf = (value: string): FilterLeaf => ({
      kind: "condition",
      subject: { kind: "input", payloadKind: "DateTime" },
      operator: "onSameDate",
      value: { kind: "DateTime", value },
    });
    expect(
      validateCondition(all(leaf("2026-10-16T16:00:00+02:00")), "DateTime"),
    ).toBeUndefined();
    expect(
      validateCondition(all(leaf("2026-10-16T16:00:00")), "DateTime"),
    ).toMatchObject({ status: "error", code: "invalidCondition" });
  });

  it("rejects scalar operators on a non-scalar subject", () => {
    expect(
      validateCondition(
        all({
          kind: "condition",
          subject: { kind: "field", path: ["page"], payloadKind: "WebPage" },
          operator: "equals",
          value: { kind: "WebPage", value: "https://example.com" },
        } as unknown as FilterLeaf),
        "WebSearchResult",
      ),
    ).toMatchObject({ status: "error", code: "invalidCondition" });
  });

  it("accepts presence operators on a non-scalar subject", () => {
    expect(
      validateCondition(
        all({
          kind: "condition",
          subject: { kind: "field", path: ["page"], payloadKind: "WebPage" },
          operator: "isNotEmpty",
        }),
        "WebSearchResult",
      ),
    ).toBeUndefined();
  });

  it.each(["__proto__", "constructor", "prototype"])(
    "rejects unsafe field segment %s",
    (segment) => {
      expect(
        validateCondition(
          all({
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

  it.each<{ name: string; condition: unknown; message: string }>([
    { name: "a leaf", condition: scoreCondition, message: "top-level" },
    { name: "not", condition: not(all(scoreCondition)), message: "top-level" },
    { name: "an empty group", condition: all(), message: "at least one" },
    {
      name: "an empty nested group",
      condition: all(scoreCondition, any()),
      message: "at least one",
    },
    {
      name: "an unknown root kind",
      condition: { kind: "xor", conditions: [scoreCondition] },
      message: "Unknown condition kind",
    },
    {
      name: "an unknown nested kind",
      condition: all({ kind: "xor", conditions: [scoreCondition] } as never),
      message: "Unknown condition kind",
    },
    { name: "a null root", condition: null, message: "must be an object" },
    {
      name: "a not without a child",
      condition: all({ kind: "not" } as never),
      message: "must be an object",
    },
    {
      name: "a group without a conditions array",
      condition: any(scoreCondition, { kind: "all" } as never),
      message: "must be an array",
    },
    {
      name: "a null child",
      condition: all(scoreCondition, null as never),
      message: "must be an object",
    },
    {
      name: "the legacy group shape",
      condition: { kind: "group", combinator: "and", conditions: [] },
      message: "Unknown condition kind",
    },
    {
      name: "depth 5",
      condition: all(any(all(not(scoreCondition)))),
      message: "at most 4 levels",
    },
    {
      name: "depth 5 through a chain of not",
      condition: all(not(not(not(scoreCondition)))),
      message: "at most 4 levels",
    },
    {
      name: "51 leaves across nested groups",
      condition: any(
        all(...Array<FilterLeaf>(25).fill(scoreCondition)),
        not(all(...Array<FilterLeaf>(26).fill(scoreCondition))),
      ),
      message: "at most 50 leaf",
    },
    {
      name: "an invalid leaf deep in the tree",
      condition: all(
        activeCondition,
        any(not({ ...scoreCondition, operator: "contains" } as never)),
      ),
      message: "Operator contains does not support Number",
    },
    {
      name: "a leaf without a subject",
      condition: all({ kind: "condition", operator: "isEmpty" } as never),
      message: "subject must be an object",
    },
    {
      name: "a field path that is not an array",
      condition: all({
        ...scoreCondition,
        subject: { kind: "field", path: "score", payloadKind: "Number" },
      } as never),
      message: "path must be an array of strings",
    },
    {
      name: "a non-string path segment",
      condition: all({
        ...scoreCondition,
        subject: { kind: "field", path: ["score", 1], payloadKind: "Number" },
      } as never),
      message: "path must be an array of strings",
    },
    {
      name: "an unknown subject kind",
      condition: all({
        kind: "condition",
        subject: { kind: "nope" },
        operator: "isEmpty",
      } as never),
      message: "Unknown subject kind",
    },
  ])("rejects $name", ({ condition, message }) => {
    expect(
      validateCondition(condition as FilterCondition, "WebPage"),
    ).toMatchObject({
      status: "error",
      code: "invalidCondition",
      message: expect.stringContaining(message) as string,
    });
  });

  it.each<{ name: string; subject: unknown; message: string }>([
    {
      name: "an entity property subject without a base URL",
      subject: { kind: "entityProperty", payloadKind: "Number" },
      message: "property type base URL",
    },
    {
      name: "an entity property subject with a non-string base URL",
      subject: {
        kind: "entityProperty",
        propertyTypeBaseUrl: 42,
        payloadKind: "Number",
      },
      message: "property type base URL",
    },
    {
      name: "an entity property subject with a base URL without a trailing slash",
      subject: {
        kind: "entityProperty",
        propertyTypeBaseUrl: "https://example.com/types/property-type/score",
        payloadKind: "Number",
      },
      message: "property type base URL",
    },
    {
      name: "an entity property subject with a base URL that isn't a URL",
      subject: {
        kind: "entityProperty",
        propertyTypeBaseUrl: "score/",
        payloadKind: "Number",
      },
      message: "property type base URL",
    },
    {
      name: "an entity property subject with an unknown payload kind",
      subject: {
        kind: "entityProperty",
        propertyTypeBaseUrl: "https://example.com/types/property-type/score/",
        payloadKind: "Nope",
      },
      message: "known payload kind",
    },
    {
      name: "a field subject with an unknown payload kind",
      subject: { kind: "field", path: ["score"], payloadKind: "Nope" },
      message: "known payload kind",
    },
  ])("rejects $name", ({ subject, message }) => {
    expect(
      validateCondition(
        all({ kind: "condition", subject, operator: "isEmpty" } as never),
        "ProposedEntity",
      ),
    ).toMatchObject({
      status: "error",
      code: "invalidCondition",
      message: expect.stringContaining(message) as string,
    });
  });

  it("accepts trees at the depth and leaf limits", () => {
    expect(
      validateCondition(all(any(not(scoreCondition))), "WebPage"),
    ).toBeUndefined();
    expect(
      validateCondition(
        any(
          all(...Array<FilterLeaf>(25).fill(scoreCondition)),
          not(all(...Array<FilterLeaf>(25).fill(activeCondition))),
        ),
        "WebPage",
      ),
    ).toBeUndefined();
  });

  it("lists the leaves of a nested tree in order", () => {
    expect(
      conditionLeaves(
        any(all(scoreCondition, not(activeCondition)), featuredCondition),
      ),
    ).toEqual([scoreCondition, activeCondition, featuredCondition]);
  });

  it("rejects a missing operand, wrong input kind, and an operand on presence checks", () => {
    expect(
      validateCondition(
        all({ ...scoreCondition, value: undefined } as never),
        "WebPage",
      ),
    ).toMatchObject({ status: "error" });
    expect(
      validateCondition(
        all({
          ...scoreCondition,
          subject: { kind: "input", payloadKind: "Number" },
        }),
        "Text",
      ),
    ).toMatchObject({ status: "error" });
    expect(
      validateCondition(
        all({ ...scoreCondition, operator: "isEmpty" } as never),
        "WebPage",
      ),
    ).toMatchObject({ status: "error" });
  });
});
