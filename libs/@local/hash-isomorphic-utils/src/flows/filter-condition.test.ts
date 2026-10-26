import { describe, expect, test } from "vitest";

import { conditionLeaves, validateCondition } from "./filter-condition.js";

import type {
  ConditionNode,
  FilterCondition,
  FilterLeaf,
} from "./filter-condition.js";
import type { PayloadKind } from "./types.js";

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

/**
 * A value the validator is fed although its types would reject it: a persisted definition can be malformed.
 */
// oxlint-disable-next-line typescript/no-restricted-types -- the tests build deliberately malformed values, which have no valid type
type MalformedInput = unknown;

const malformed = (input: MalformedInput): never =>
  // SAFETY: only used to give the validator input its types would reject; it must handle any value.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the tests pass malformed values to the validator on purpose
  input as never;

const repeatLeaf = (leaf: FilterLeaf, count: number): FilterLeaf[] =>
  Array.from({ length: count }, () => leaf);

const invalidEntityTypeUrlResult = {
  status: "error",
  code: "invalidCondition",
  message:
    "Entity type conditions require isOfType and a versioned or base type URL.",
};

const innerNot = not(scoreCondition);
const depthFiveGroups = all(any(all(innerNot)));
const tripleNot = not(not(not(scoreCondition)));
const depthFiveChain = all(tripleNot);
const leavesInFirstGroup = all(...repeatLeaf(scoreCondition, 25));
const leavesInSecondGroup = all(...repeatLeaf(scoreCondition, 26));
const tooManyLeaves = any(leavesInFirstGroup, not(leavesInSecondGroup));
const invalidOperatorLeaf = not(
  malformed({ ...scoreCondition, operator: "contains" }),
);
const invalidLeafInTree = all(activeCondition, any(invalidOperatorLeaf));

const maxLeavesInFirstGroup = all(...repeatLeaf(scoreCondition, 25));
const maxLeavesInSecondGroup = all(...repeatLeaf(activeCondition, 25));
const maxLeaves = any(maxLeavesInFirstGroup, not(maxLeavesInSecondGroup));
const maxDepth = all(any(not(scoreCondition)));
const nestedTree = any(
  all(scoreCondition, not(activeCondition)),
  featuredCondition,
);
const presenceLeaf = all({
  kind: "condition",
  subject: { kind: "field", path: ["page"], payloadKind: "WebPage" },
  operator: "isNotEmpty",
});

describe("validateCondition", () => {
  test.each([
    { kind: "Text", value: 42 },
    { kind: "Boolean", value: "false" },
    { kind: "EntityId", value: 42 },
  ] as const)(
    "rejects a constant tagged $kind with the wrong runtime type",
    (value) => {
      expect.hasAssertions();

      const leaf = malformed({
        kind: "condition",
        subject: { kind: "input", payloadKind: value.kind },
        operator: "equals",
        value,
      });
      const condition = all(leaf);

      expect(validateCondition(condition, value.kind)).toMatchObject({
        status: "error",
        code: "invalidCondition",
      });
    },
  );

  test("rejects an operator the subject's kind doesn't support, in its type and when validated", () => {
    expect.hasAssertions();

    // @ts-expect-error -- text can't be ordered
    const leaf: FilterLeaf = {
      kind: "condition",
      subject: { kind: "input", payloadKind: "Text" },
      operator: "greaterThan",
      value: { kind: "Text", value: "b" },
    };
    expect(validateCondition(all(leaf), "Text")).toStrictEqual({
      status: "error",
      code: "invalidCondition",
      message: "Operator greaterThan does not support Text.",
    });
  });

  test.each([
    {
      kind: "VersionedUrl",
      value: "https://example.com/types/entity-type/company/v/1",
      expected: undefined,
    },
    {
      kind: "VersionedUrl",
      value: "https://example.com/types/entity-type/company/",
      expected: invalidEntityTypeUrlResult,
    },
    {
      kind: "VersionedUrl",
      value: "https://example.com/types/entity-type/company/v/0",
      expected: invalidEntityTypeUrlResult,
    },
    {
      kind: "BaseUrl",
      value: "https://example.com/types/entity-type/company/",
      expected: undefined,
    },
    {
      kind: "BaseUrl",
      value: "https://example.com/types/entity-type/company/v/1",
      expected: invalidEntityTypeUrlResult,
    },
    {
      kind: "Text",
      value: "https://example.com/types/entity-type/company/",
      expected: invalidEntityTypeUrlResult,
    },
    { kind: "VersionedUrl", value: 1, expected: invalidEntityTypeUrlResult },
    { kind: "BaseUrl", value: undefined, expected: invalidEntityTypeUrlResult },
  ])("entity type URL $kind: $value", ({ kind, value, expected }) => {
    expect.hasAssertions();

    const condition = all(
      malformed({
        kind: "condition",
        subject: { kind: "entityType" },
        operator: "isOfType",
        value: { kind, value },
      }),
    );

    expect(validateCondition(condition, "ProposedEntity")).toStrictEqual(
      expected,
    );
  });

  const isCompany: FilterLeaf = {
    kind: "condition",
    subject: { kind: "entityType" },
    operator: "isOfType",
    value: {
      kind: "VersionedUrl",
      value: "https://example.com/types/entity-type/company/v/1",
    },
  };

  test("isOfType includeSubtypes", () => {
    expect.hasAssertions();

    const condition = all({ ...isCompany, includeSubtypes: true });

    expect(validateCondition(condition, "EntityId")).toBeUndefined();
  });

  test.each<{
    name: string;
    leaf: MalformedInput;
    inputKind: PayloadKind;
    message: string;
  }>([
    {
      name: "a scalar condition",
      leaf: { ...scoreCondition, includeSubtypes: true },
      inputKind: "WebPage",
      message: "only applies to isOfType",
    },
    {
      name: "a presence check on the entity type",
      leaf: {
        kind: "condition",
        subject: { kind: "entityType" },
        operator: "isNotEmpty",
        includeSubtypes: false,
      },
      inputKind: "EntityId",
      message: "only applies to isOfType",
    },
    {
      name: "isOfType, when not a boolean",
      leaf: { ...isCompany, includeSubtypes: "true" },
      inputKind: "EntityId",
      message: "must be a boolean",
    },
  ])("includeSubtypes invalid $name", ({ leaf, inputKind, message }) => {
    expect.hasAssertions();

    const condition = all(malformed(leaf));
    const result = validateCondition(condition, inputKind);

    expect(result).toMatchObject({
      status: "error",
      code: "invalidCondition",
    });
    expect(result?.message).toContain(message);
  });

  test("rejects field subjects on primitive input kinds", () => {
    expect.hasAssertions();

    expect(validateCondition(all(scoreCondition), "Number")).toMatchObject({
      status: "error",
      code: "invalidCondition",
    });
  });

  test("validates the operand's kind, not just its JS type", () => {
    expect.hasAssertions();

    const condition = all(
      malformed({
        kind: "condition",
        subject: { kind: "input", payloadKind: "Date" },
        operator: "equals",
        value: { kind: "Text", value: "2026-10-08" },
      }),
    );

    expect(validateCondition(condition, "Date")).toMatchObject({
      status: "error",
      code: "invalidCondition",
    });
  });

  test.each([
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
      expect.hasAssertions();

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

  test("rejects scalar operators on a non-scalar subject", () => {
    expect.hasAssertions();

    const condition = all(
      malformed({
        kind: "condition",
        subject: { kind: "field", path: ["page"], payloadKind: "WebPage" },
        operator: "equals",
        value: { kind: "WebPage", value: "https://example.com" },
      }),
    );

    expect(validateCondition(condition, "WebSearchResult")).toMatchObject({
      status: "error",
      code: "invalidCondition",
    });
  });

  test("accepts presence operators on a non-scalar subject", () => {
    expect.hasAssertions();

    expect(validateCondition(presenceLeaf, "WebSearchResult")).toBeUndefined();
  });

  test.each(["__proto__", "constructor", "prototype"])(
    "rejects unsafe field segment %s",
    (segment) => {
      expect.hasAssertions();

      const condition = all({
        ...scoreCondition,
        subject: {
          kind: "field",
          path: [segment, "score"],
          payloadKind: "Number",
        },
      });

      expect(validateCondition(condition, "WebPage")).toMatchObject({
        status: "error",
        code: "invalidCondition",
      });
    },
  );

  test.each<{ name: string; condition: MalformedInput; message: string }>([
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
      condition: all(malformed({ kind: "xor", conditions: [scoreCondition] })),
      message: "Unknown condition kind",
    },
    { name: "a null root", condition: null, message: "must be an object" },
    {
      name: "a not without a child",
      condition: all(malformed({ kind: "not" })),
      message: "must be an object",
    },
    {
      name: "a group without a conditions array",
      condition: any(scoreCondition, malformed({ kind: "all" })),
      message: "must be an array",
    },
    {
      name: "a null child",
      condition: all(scoreCondition, malformed(null)),
      message: "must be an object",
    },
    {
      name: "the legacy group shape",
      condition: { kind: "group", combinator: "and", conditions: [] },
      message: "Unknown condition kind",
    },
    {
      name: "depth 5",
      condition: depthFiveGroups,
      message: "at most 4 levels",
    },
    {
      name: "depth 5 through a chain of not",
      condition: depthFiveChain,
      message: "at most 4 levels",
    },
    {
      name: "51 leaves across nested groups",
      condition: tooManyLeaves,
      message: "at most 50 leaf",
    },
    {
      name: "an invalid leaf deep in the tree",
      condition: invalidLeafInTree,
      message: "Operator contains does not support Number",
    },
    {
      name: "a leaf without a subject",
      condition: all(malformed({ kind: "condition", operator: "isEmpty" })),
      message: "subject must be an object",
    },
    {
      name: "a field path that is not an array",
      condition: all(
        malformed({
          ...scoreCondition,
          subject: { kind: "field", path: "score", payloadKind: "Number" },
        }),
      ),
      message: "path must be an array of strings",
    },
    {
      name: "a non-string path segment",
      condition: all(
        malformed({
          ...scoreCondition,
          subject: {
            kind: "field",
            path: ["score", 1],
            payloadKind: "Number",
          },
        }),
      ),
      message: "path must be an array of strings",
    },
    {
      name: "an unknown subject kind",
      condition: all(
        malformed({
          kind: "condition",
          subject: { kind: "nope" },
          operator: "isEmpty",
        }),
      ),
      message: "Unknown subject kind",
    },
  ])("rejects $name", ({ condition, message }) => {
    expect.hasAssertions();

    const result = validateCondition(malformed(condition), "WebPage");

    expect(result).toMatchObject({
      status: "error",
      code: "invalidCondition",
    });
    expect(result?.message).toContain(message);
  });

  test.each<{ name: string; subject: MalformedInput; message: string }>([
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
    expect.hasAssertions();

    const condition = all(
      malformed({ kind: "condition", subject, operator: "isEmpty" }),
    );

    const result = validateCondition(condition, "ProposedEntity");

    expect(result).toMatchObject({
      status: "error",
      code: "invalidCondition",
    });
    expect(result?.message).toContain(message);
  });

  test("accepts trees at the depth and leaf limits", () => {
    expect.hasAssertions();

    expect(validateCondition(maxDepth, "WebPage")).toBeUndefined();
    expect(validateCondition(maxLeaves, "WebPage")).toBeUndefined();
  });

  test("lists the leaves of a nested tree in order", () => {
    expect.hasAssertions();

    expect(conditionLeaves(nestedTree)).toStrictEqual([
      scoreCondition,
      activeCondition,
      featuredCondition,
    ]);
  });

  test("rejects a missing operand, wrong input kind, and an operand on presence checks", () => {
    expect.hasAssertions();

    const missingOperand = all(
      malformed({ ...scoreCondition, value: undefined }),
    );
    const wrongInputKind = all({
      ...scoreCondition,
      subject: { kind: "input", payloadKind: "Number" },
    });
    const operandOnPresenceCheck = all(
      malformed({ ...scoreCondition, operator: "isEmpty" }),
    );

    expect(validateCondition(missingOperand, "WebPage")).toMatchObject({
      status: "error",
    });
    expect(validateCondition(wrongInputKind, "Text")).toMatchObject({
      status: "error",
    });
    expect(validateCondition(operandOnPresenceCheck, "WebPage")).toMatchObject({
      status: "error",
    });
  });
});
