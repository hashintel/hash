import { describe, expect, test } from "vitest";

import {
  baseDefinition,
  diagnosticsOf,
  errorDiagnosticsOf,
} from "./validate-flow-definition-fixtures.js";
import { validateFlowDefinition } from "./validate-flow-definition.js";

import type {
  Fixture,
  FixtureObject,
  FlowDefinitionFixture,
} from "./validate-flow-definition-fixtures.js";

type ConditionActionDefinitionId = "filterList" | "find" | "if";

const conditionActionDefinitionIds = [
  "filterList",
  "find",
  "if",
] as const satisfies ConditionActionDefinitionId[];

const entityTypeSubjectCondition = {
  kind: "all",
  conditions: [
    {
      kind: "condition",
      subject: { kind: "entityType" },
      operator: "isOfType",
      value: {
        kind: "VersionedUrl",
        value: "https://example.com/types/entity-type/company/v/1",
      },
    },
  ],
};

const scoreAbove = (score: number): FixtureObject => ({
  kind: "all",
  conditions: [
    {
      kind: "condition",
      subject: { kind: "field", path: ["score"], payloadKind: "Number" },
      operator: "greaterThan",
      value: { kind: "Number", value: score },
    },
  ],
});

const conditionSubject = (
  actionDefinitionId: ConditionActionDefinitionId,
): FixtureObject => ({
  kind: "flow-input",
  inputName: actionDefinitionId === "if" ? "page" : "pages",
});

const conditionStep = (
  actionDefinitionId: ConditionActionDefinitionId,
  condition: FixtureObject,
  subject: FixtureObject = conditionSubject(actionDefinitionId),
): FixtureObject => ({
  kind: "action",
  stepId: actionDefinitionId,
  actionDefinitionId,
  description: "",
  inputs: {
    [actionDefinitionId === "if" ? "value" : "items"]: subject,
    condition,
  },
});

const conditionDefinition = (...steps: Fixture[]): FlowDefinitionFixture => ({
  ...baseDefinition,
  inputs: [
    { name: "pages", payloadKind: "WebPage", array: true, required: true },
    { name: "page", payloadKind: "WebPage", array: false, required: true },
    {
      name: "condition",
      payloadKind: "FilterCondition",
      array: false,
      required: true,
    },
  ],
  steps,
});

const constantCondition = (value: Fixture): FixtureObject => ({
  kind: "constant",
  payload: { kind: "FilterCondition", value },
});

describe("conditions of filterList, find and if steps", () => {
  test.each(conditionActionDefinitionIds)(
    "accepts a %s condition that fits the kind it's given",
    (actionDefinitionId) => {
      expect.hasAssertions();

      const condition = constantCondition(scoreAbove(8));
      const step = conditionStep(actionDefinitionId, condition);

      expect(errorDiagnosticsOf(conditionDefinition(step))).toStrictEqual([]);
    },
  );

  test.each(conditionActionDefinitionIds)(
    "rejects a %s condition that doesn't fit the kind it's given",
    (actionDefinitionId) => {
      expect.hasAssertions();

      const condition = constantCondition(entityTypeSubjectCondition);
      const step = conditionStep(actionDefinitionId, condition);
      const { diagnostics } = validateFlowDefinition(conditionDefinition(step));

      expect(diagnostics).toContainEqual({
        severity: "error",
        code: "invalidInput",
        message:
          "Entity subjects require an EntityId or proposed entity input.",
        path: ["steps", 0, "inputs", "condition"],
      });
    },
  );

  test("rejects a condition that isn't a constant", () => {
    expect.hasAssertions();

    const step = conditionStep("filterList", {
      kind: "flow-input",
      inputName: "condition",
    });

    expect(diagnosticsOf(conditionDefinition(step))).toContainEqual({
      severity: "error",
      code: "invalidInput",
      path: ["steps", 0, "inputs", "condition"],
    });
  });

  test("leaves the condition to the step when the kind it's given doesn't resolve", () => {
    expect.hasAssertions();

    const condition = constantCondition(scoreAbove(8));
    const unresolved = conditionStep("filterList", condition, {
      kind: "step-output",
      stepId: "first",
      outputName: "matching",
    });

    const diagnostics = diagnosticsOf(
      conditionDefinition(
        {
          ...conditionStep("filterList", condition),
          stepId: "first",
          inputs: { condition },
        },
        { ...unresolved, stepId: "second" },
      ),
    );

    expect(
      diagnostics.filter(({ code }) => code === "invalidInput"),
    ).toStrictEqual([]);
  });
});

const orderByDefinition = (sortBy: FixtureObject): FlowDefinitionFixture => ({
  ...baseDefinition,
  inputs: [
    { name: "pages", payloadKind: "WebPage", array: true, required: true },
    {
      name: "sortBy",
      payloadKind: "SortKey",
      array: false,
      required: true,
    },
  ],
  steps: [
    {
      kind: "action",
      stepId: "order",
      actionDefinitionId: "orderBy",
      description: "",
      inputs: {
        items: { kind: "flow-input", inputName: "pages" },
        sortBy,
      },
    },
  ],
});

const constantSortKey = (subject: FixtureObject): FixtureObject => ({
  kind: "constant",
  payload: { kind: "SortKey", value: { subject, direction: "ascending" } },
});

describe("sort keys of orderBy steps", () => {
  test("accepts a constant sort key that fits the items, or one from elsewhere", () => {
    expect.hasAssertions();

    const sortKeys = [
      constantSortKey({
        kind: "field",
        path: ["title"],
        payloadKind: "Text",
      }),
      { kind: "flow-input", inputName: "sortBy" },
    ];

    for (const sortBy of sortKeys) {
      expect(errorDiagnosticsOf(orderByDefinition(sortBy))).toStrictEqual([]);
    }
  });

  test.each([
    {
      name: "of a kind that can't be sorted",
      subject: { kind: "field", path: ["url"], payloadKind: "WebPage" },
      message:
        "A sort key's subject must be of kind ActorType, Boolean, Date, DateTime, EntityId, GoogleAccountId, Number, Text, VersionedUrl.",
    },
    {
      name: "that doesn't fit the items",
      subject: {
        kind: "entityProperty",
        propertyTypeBaseUrl: "https://example.com/property-type/name/",
        payloadKind: "Text",
      },
      message: "Entity subjects require an EntityId or proposed entity input.",
    },
  ])("rejects a sort key $name", ({ subject, message }) => {
    expect.hasAssertions();

    const definition = orderByDefinition(constantSortKey(subject));

    expect(errorDiagnosticsOf(definition)).toStrictEqual([
      {
        severity: "error",
        code: "invalidInput",
        message,
        path: ["steps", 0, "inputs", "sortBy"],
      },
    ]);
  });
});

const aggregateDefinition = (
  aggregation: FixtureObject,
): FlowDefinitionFixture => ({
  ...baseDefinition,
  inputs: [
    { name: "pages", payloadKind: "WebPage", array: true, required: true },
    {
      name: "aggregation",
      payloadKind: "Aggregation",
      array: false,
      required: true,
    },
  ],
  steps: [
    {
      kind: "action",
      stepId: "aggregate",
      actionDefinitionId: "aggregate",
      description: "",
      inputs: {
        items: { kind: "flow-input", inputName: "pages" },
        aggregation,
      },
    },
  ],
});

const constantAggregation = (value: FixtureObject): FixtureObject => ({
  kind: "constant",
  payload: { kind: "Aggregation", value },
});

describe("aggregations of aggregate steps", () => {
  test("accepts a constant aggregation that fits the items, or one from elsewhere", () => {
    expect.hasAssertions();

    const aggregations = [
      constantAggregation({ operation: "count" }),
      constantAggregation({
        operation: "sum",
        subject: {
          kind: "field",
          path: ["wordCount"],
          payloadKind: "Number",
        },
      }),
      { kind: "flow-input", inputName: "aggregation" },
    ];

    for (const aggregation of aggregations) {
      expect(
        errorDiagnosticsOf(aggregateDefinition(aggregation)),
      ).toStrictEqual([]);
    }
  });

  test.each([
    {
      name: "a count with a subject",
      aggregation: {
        operation: "count",
        subject: {
          kind: "field",
          path: ["wordCount"],
          payloadKind: "Number",
        },
      },
      message: "A count aggregation takes no subject.",
    },
    {
      name: "a sum of a Text subject",
      aggregation: {
        operation: "sum",
        subject: { kind: "field", path: ["title"], payloadKind: "Text" },
      },
      message: "An aggregation's subject must be of kind Number.",
    },
    {
      name: "a subject that doesn't fit the items",
      aggregation: {
        operation: "max",
        subject: {
          kind: "entityProperty",
          propertyTypeBaseUrl: "https://example.com/property-type/score/",
          payloadKind: "Number",
        },
      },
      message: "Entity subjects require an EntityId or proposed entity input.",
    },
  ])("rejects $name", ({ aggregation, message }) => {
    expect.hasAssertions();

    const definition = aggregateDefinition(constantAggregation(aggregation));

    expect(errorDiagnosticsOf(definition)).toStrictEqual([
      {
        severity: "error",
        code: "invalidInput",
        message,
        path: ["steps", 0, "inputs", "aggregation"],
      },
    ]);
  });
});

const takeFirstDefinition = (count: number): FlowDefinitionFixture => ({
  ...baseDefinition,
  inputs: [
    { name: "pages", payloadKind: "WebPage", array: true, required: true },
  ],
  steps: [
    {
      kind: "action",
      stepId: "take",
      actionDefinitionId: "takeFirst",
      description: "",
      inputs: {
        items: { kind: "flow-input", inputName: "pages" },
        count: {
          kind: "constant",
          payload: { kind: "Number", value: count },
        },
      },
    },
  ],
});

describe("counts of takeFirst steps", () => {
  test.each([0, 10])("accepts a count of %s", (count) => {
    expect.hasAssertions();

    expect(diagnosticsOf(takeFirstDefinition(count))).toStrictEqual([]);
  });

  test.each([-1, 2.5])(
    "rejects a count of %s, which isn't a whole number of 0 or more",
    (count) => {
      expect.hasAssertions();

      const { diagnostics } = validateFlowDefinition(
        takeFirstDefinition(count),
      );

      expect(diagnostics).toStrictEqual([
        {
          severity: "error",
          code: "invalidInput",
          message: "The count must be a whole number, 0 or more.",
          path: ["steps", 0, "inputs", "count"],
        },
      ]);
    },
  );
});
