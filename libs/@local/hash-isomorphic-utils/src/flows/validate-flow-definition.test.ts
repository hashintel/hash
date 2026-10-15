import { describe, expect, it } from "vitest";

import { ftseInvestorsFlow } from "./ftse-investors-flow-definition.js";
import { goalFlow } from "./goal-flow-definitions.js";
import {
  type FlowDefinitionDiagnostic,
  validateFlowDefinition,
} from "./validate-flow-definition.js";

import type { FlowDefinition } from "./types.js";

const baseDefinition = {
  name: "Test",
  description: "A flow for testing validation",
  inputs: [
    { name: "question", payloadKind: "Text", array: false, required: true },
  ],
  steps: [],
  outputs: [],
} satisfies FlowDefinition;

const diagnosticsOf = (flowDefinition: unknown) =>
  validateFlowDefinition(flowDefinition).diagnostics.map(
    ({ severity, code, path }): Omit<FlowDefinitionDiagnostic, "message"> => ({
      severity,
      code,
      path,
    }),
  );

const answerStep = (
  stepId: string,
  inputs: Record<string, unknown> = {
    question: { kind: "flow-input", inputName: "question" },
  },
) => ({
  kind: "action",
  stepId,
  actionDefinitionId: "answerQuestion",
  description: "",
  inputs,
});

describe("validateFlowDefinition", () => {
  it("accepts the definitions the builder produces", () => {
    for (const { flowDefinition } of [goalFlow, ftseInvestorsFlow]) {
      expect(validateFlowDefinition(flowDefinition).diagnostics).toEqual([]);
    }
  });

  it("reports schema problems without running semantic checks", () => {
    const result = validateFlowDefinition({
      ...baseDefinition,
      steps: [{ kind: "wait" }],
    });

    expect(result.flowDefinition).toBeNull();
    expect(result.diagnostics).toMatchObject([
      { severity: "error", code: "schema", path: ["steps", 0, "kind"] },
    ]);
  });

  it('rejects "~" in step ids wherever a step is named, which the engine uses to name branch steps', () => {
    expect(
      diagnosticsOf({
        ...baseDefinition,
        steps: [
          answerStep("answer~0", {
            question: { kind: "flow-input", inputName: "question" },
            context: {
              kind: "step-output",
              stepId: "other~0",
              outputName: "explanation",
            },
          }),
          {
            kind: "for-each",
            stepId: "each~0",
            description: "",
            over: { kind: "flow-input", inputName: "question" },
            steps: [],
            collect: { stepId: "answer~1", outputName: "explanation", as: "x" },
          },
        ],
        outputs: [{ name: "answer", stepId: "answer~0", outputName: "answer" }],
      }),
    ).toEqual(
      [
        ["steps", 0, "stepId"],
        ["steps", 0, "inputs", "context", "stepId"],
        ["steps", 1, "stepId"],
        ["steps", 1, "collect", "stepId"],
        ["outputs", 0, "stepId"],
      ].map((path) => ({ severity: "error", code: "schema", path })),
    );
  });

  it("reports every problem at once, each with a path", () => {
    expect(
      diagnosticsOf({
        ...baseDefinition,
        inputs: [
          ...baseDefinition.inputs,
          {
            name: "question",
            payloadKind: "Text",
            array: false,
            required: true,
          },
        ],
        steps: [
          answerStep("answer", {
            question: { kind: "flow-input", inputName: "missing" },
            questoin: { kind: "flow-input", inputName: "question" },
          }),
          {
            kind: "action",
            stepId: "flights",
            actionDefinitionId: "getScheduledFlights",
            description: "",
            inputs: {},
          },
          {
            kind: "action",
            stepId: "unknown",
            actionDefinitionId: "doTheThing",
            description: "",
            inputs: {},
          },
        ],
      }),
    ).toEqual([
      {
        severity: "error",
        code: "duplicateInputName",
        path: ["inputs", 1, "name"],
      },
      {
        severity: "error",
        code: "unknownFlowInput",
        path: ["steps", 0, "inputs", "question"],
      },
      {
        severity: "error",
        code: "unknownInput",
        path: ["steps", 0, "inputs", "questoin"],
      },
      {
        severity: "error",
        code: "mixedWorkers",
        path: ["steps", 1, "actionDefinitionId"],
      },
      {
        severity: "error",
        code: "missingInput",
        path: ["steps", 1, "inputs"],
      },
      {
        severity: "error",
        code: "missingInput",
        path: ["steps", 1, "inputs"],
      },
      {
        severity: "error",
        code: "unknownAction",
        path: ["steps", 2, "actionDefinitionId"],
      },
      {
        severity: "warning",
        code: "unusedFlowInput",
        path: ["inputs", 0],
      },
      {
        severity: "warning",
        code: "unusedFlowInput",
        path: ["inputs", 1],
      },
    ]);
  });

  it("reports incompatible connections with the rule's reason", () => {
    const result = validateFlowDefinition({
      ...baseDefinition,
      steps: [
        answerStep("answer"),
        answerStep("again", {
          question: {
            kind: "step-output",
            stepId: "answer",
            outputName: "answer",
          },
        }),
      ],
    });

    expect(result.diagnostics).toEqual([
      {
        severity: "error",
        code: "incompatibleConnection",
        message: "A FormattedText value cannot feed an input that accepts Text",
        path: ["steps", 1, "inputs", "question"],
      },
    ]);
  });

  it("accepts steps in any order", () => {
    expect(
      diagnosticsOf({
        ...baseDefinition,
        steps: [
          answerStep("summarize", {
            question: { kind: "flow-input", inputName: "question" },
            context: {
              kind: "step-output",
              stepId: "answer",
              outputName: "explanation",
            },
          }),
          answerStep("answer"),
        ],
      }),
    ).toEqual([]);
  });

  it("reports cycles", () => {
    expect(
      diagnosticsOf({
        ...baseDefinition,
        steps: [
          answerStep("a", {
            question: { kind: "flow-input", inputName: "question" },
            context: {
              kind: "step-output",
              stepId: "b",
              outputName: "explanation",
            },
          }),
          answerStep("b", {
            question: { kind: "flow-input", inputName: "question" },
            context: {
              kind: "step-output",
              stepId: "a",
              outputName: "explanation",
            },
          }),
        ],
      }),
    ).toEqual([{ severity: "error", code: "cycle", path: ["steps", 0] }]);
  });

  describe("for-each steps", () => {
    const forEachDefinition = (
      overrides: Partial<{
        over: unknown;
        collect: unknown;
        after: unknown[];
      }>,
    ) => ({
      ...baseDefinition,
      steps: [
        {
          kind: "action",
          stepId: "queries",
          actionDefinitionId: "generateWebQueries",
          description: "",
          inputs: { prompt: { kind: "flow-input", inputName: "question" } },
        },
        {
          kind: "for-each",
          stepId: "each",
          description: "",
          over: overrides.over ?? {
            kind: "step-output",
            stepId: "queries",
            outputName: "queries",
          },
          steps: [
            answerStep("answer", {
              question: { kind: "item" },
            }),
          ],
          collect: overrides.collect ?? {
            stepId: "answer",
            outputName: "explanation",
            as: "explanations",
          },
        },
        ...(overrides.after ?? []),
      ],
    });

    it("accepts a valid for-each step", () => {
      expect(diagnosticsOf(forEachDefinition({}))).toEqual([]);
    });

    it("rejects iterating over a singular value", () => {
      expect(
        diagnosticsOf(
          forEachDefinition({
            over: { kind: "flow-input", inputName: "question" },
          }),
        ),
      ).toContainEqual({
        severity: "error",
        code: "overNotArray",
        path: ["steps", 1, "over"],
      });
    });

    it("iterates over a value that may be missing only if it's skipped when the value is missing", () => {
      const overOptionalInput = (over: Record<string, unknown>) => ({
        ...forEachDefinition({ over }),
        inputs: [
          ...baseDefinition.inputs,
          {
            name: "questions",
            payloadKind: "Text",
            array: true,
            required: false,
          },
        ],
      });

      expect(
        diagnosticsOf(
          overOptionalInput({ kind: "flow-input", inputName: "questions" }),
        ),
      ).toEqual([
        {
          severity: "error",
          code: "overNotRequired",
          path: ["steps", 1, "over"],
        },
      ]);

      expect(
        diagnosticsOf(
          overOptionalInput({
            kind: "flow-input",
            inputName: "questions",
            whenMissing: "skip",
          }),
        ),
      ).toEqual([]);
    });

    it("rejects a for-each step inside another", () => {
      const queriesOutput = {
        kind: "step-output",
        stepId: "queries",
        outputName: "queries",
      };

      expect(
        diagnosticsOf({
          ...baseDefinition,
          steps: [
            forEachDefinition({}).steps[0],
            {
              kind: "for-each",
              stepId: "outer",
              description: "",
              over: queriesOutput,
              steps: [
                {
                  kind: "for-each",
                  stepId: "inner",
                  description: "",
                  over: queriesOutput,
                  steps: [answerStep("answer", { question: { kind: "item" } })],
                  collect: {
                    stepId: "answer",
                    outputName: "explanation",
                    as: "explanations",
                  },
                },
              ],
              collect: {
                stepId: "inner",
                outputName: "explanations",
                as: "explanations",
              },
            },
          ],
        }),
      ).toEqual([
        {
          severity: "error",
          code: "nestedForEach",
          path: ["steps", 1, "steps", 0],
        },
      ]);
    });

    it("rejects using a nested step's output outside the for-each step", () => {
      expect(
        diagnosticsOf(
          forEachDefinition({
            after: [
              answerStep("leak", {
                question: {
                  kind: "step-output",
                  stepId: "answer",
                  outputName: "explanation",
                },
              }),
            ],
          }),
        ),
      ).toEqual([
        {
          severity: "error",
          code: "stepNotInScope",
          path: ["steps", 2, "inputs", "question"],
        },
      ]);
    });

    it("rejects an item outside a for-each step", () => {
      expect(
        diagnosticsOf({
          ...baseDefinition,
          steps: [
            answerStep("answer", {
              question: { kind: "item" },
            }),
          ],
        }),
      ).toContainEqual({
        severity: "error",
        code: "itemOutsideForEach",
        path: ["steps", 0, "inputs", "question"],
      });
    });

    it("rejects a for-each step that collects from itself or from another for-each step", () => {
      const usesCollected = answerStep("after", {
        question: { kind: "flow-input", inputName: "question" },
        context: {
          kind: "step-output",
          stepId: "each",
          outputName: "explanations",
        },
      });

      expect(
        diagnosticsOf(
          forEachDefinition({
            collect: {
              stepId: "each",
              outputName: "explanations",
              as: "explanations",
            },
            after: [usesCollected],
          }),
        ),
      ).toContainEqual({
        severity: "error",
        code: "invalidCollect",
        path: ["steps", 1, "collect", "stepId"],
      });

      const collectsFrom = (stepId: string, from: string) => ({
        kind: "for-each",
        stepId,
        description: "",
        over: { kind: "step-output", stepId: "queries", outputName: "queries" },
        steps: [],
        collect: {
          stepId: from,
          outputName: "explanations",
          as: "explanations",
        },
      });

      expect(
        diagnosticsOf({
          ...forEachDefinition({}),
          steps: [
            forEachDefinition({}).steps[0],
            collectsFrom("each", "other"),
            collectsFrom("other", "each"),
            usesCollected,
          ],
        }),
      ).toContainEqual({
        severity: "error",
        code: "invalidCollect",
        path: ["steps", 1, "collect", "stepId"],
      });
    });

    it("rejects collecting an output the step does not have", () => {
      expect(
        diagnosticsOf(
          forEachDefinition({
            collect: {
              stepId: "answer",
              outputName: "missing",
              as: "answers",
            },
          }),
        ),
      ).toContainEqual({
        severity: "error",
        code: "unknownStepOutput",
        path: ["steps", 1, "collect", "outputName"],
      });
    });
  });

  describe("conditions of filterList, find and if steps", () => {
    const scoreAbove = (score: number) => ({
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

    const conditionStep = (
      actionDefinitionId: "filterList" | "find" | "if",
      condition: Record<string, unknown>,
      subject: Record<string, unknown> = {
        kind: "flow-input",
        inputName: actionDefinitionId === "if" ? "page" : "pages",
      },
    ) => ({
      kind: "action",
      stepId: actionDefinitionId,
      actionDefinitionId,
      description: "",
      inputs: {
        [actionDefinitionId === "if" ? "value" : "items"]: subject,
        condition,
      },
    });

    const definition = (...steps: unknown[]) => ({
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

    const constantCondition = (value: unknown) => ({
      kind: "constant",
      payload: { kind: "FilterCondition", value },
    });

    it.each(["filterList", "find", "if"] as const)(
      "accepts a %s condition that fits the kind it's given",
      (actionDefinitionId) => {
        expect(
          diagnosticsOf(
            definition(
              conditionStep(
                actionDefinitionId,
                constantCondition(scoreAbove(8)),
              ),
            ),
          ).filter(({ severity }) => severity === "error"),
        ).toEqual([]);
      },
    );

    it.each(["filterList", "find", "if"] as const)(
      "rejects a %s condition that doesn't fit the kind it's given",
      (actionDefinitionId) => {
        const { diagnostics } = validateFlowDefinition(
          definition(
            conditionStep(
              actionDefinitionId,
              constantCondition({
                kind: "all",
                conditions: [
                  {
                    kind: "condition",
                    subject: { kind: "entityType" },
                    operator: "isOfType",
                    value: {
                      kind: "VersionedUrl",
                      value:
                        "https://example.com/types/entity-type/company/v/1",
                    },
                  },
                ],
              }),
            ),
          ),
        );

        expect(diagnostics).toContainEqual({
          severity: "error",
          code: "invalidInput",
          message:
            "Entity subjects require an EntityId or proposed entity input.",
          path: ["steps", 0, "inputs", "condition"],
        });
      },
    );

    it("rejects a condition that isn't a constant", () => {
      expect(
        diagnosticsOf(
          definition(
            conditionStep("filterList", {
              kind: "flow-input",
              inputName: "condition",
            }),
          ),
        ),
      ).toContainEqual({
        severity: "error",
        code: "invalidInput",
        path: ["steps", 0, "inputs", "condition"],
      });
    });

    it("leaves the condition to the step when the kind it's given doesn't resolve", () => {
      const unresolved = conditionStep(
        "filterList",
        constantCondition(scoreAbove(8)),
        { kind: "step-output", stepId: "first", outputName: "matching" },
      );

      expect(
        diagnosticsOf(
          definition(
            {
              ...conditionStep("filterList", constantCondition(scoreAbove(8))),
              stepId: "first",
              inputs: { condition: constantCondition(scoreAbove(8)) },
            },
            { ...unresolved, stepId: "second" },
          ),
        ).filter(({ code }) => code === "invalidInput"),
      ).toEqual([]);
    });
  });

  describe("sort keys of orderBy steps", () => {
    const orderByDefinition = (sortBy: Record<string, unknown>) => ({
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

    const constantSortKey = (subject: Record<string, unknown>) => ({
      kind: "constant",
      payload: { kind: "SortKey", value: { subject, direction: "ascending" } },
    });

    it("accepts a constant sort key that fits the items, or one from elsewhere", () => {
      for (const sortBy of [
        constantSortKey({
          kind: "field",
          path: ["title"],
          payloadKind: "Text",
        }),
        { kind: "flow-input", inputName: "sortBy" },
      ]) {
        expect(
          diagnosticsOf(orderByDefinition(sortBy)).filter(
            ({ severity }) => severity === "error",
          ),
        ).toEqual([]);
      }
    });

    it.each([
      {
        name: "of a kind that can't be sorted",
        subject: { kind: "field", path: ["url"], payloadKind: "WebPage" },
        message:
          "A sort key's subject must be of kind Text, Number, Date, Boolean.",
      },
      {
        name: "that doesn't fit the items",
        subject: {
          kind: "entityProperty",
          propertyTypeBaseUrl: "https://example.com/property-type/name/",
          payloadKind: "Text",
        },
        message:
          "Entity subjects require an EntityId or proposed entity input.",
      },
    ])("rejects a sort key $name", ({ subject, message }) => {
      expect(
        validateFlowDefinition(
          orderByDefinition(constantSortKey(subject)),
        ).diagnostics.filter(({ severity }) => severity === "error"),
      ).toEqual([
        {
          severity: "error",
          code: "invalidInput",
          message,
          path: ["steps", 0, "inputs", "sortBy"],
        },
      ]);
    });
  });

  describe("inputs of queryEntities steps", () => {
    const nameUrl = "https://example.com/property-type/name/";

    const nameCondition = (operator: string, value?: unknown) => ({
      kind: "condition",
      subject: {
        kind: "entityProperty",
        propertyTypeBaseUrl: nameUrl,
        payloadKind: "Text",
      },
      operator,
      value,
    });

    const queryDefinition = (inputs: Record<string, unknown>) => ({
      ...baseDefinition,
      inputs: [
        {
          name: "filter",
          payloadKind: "FilterCondition",
          array: false,
          required: true,
        },
        { name: "limit", payloadKind: "Number", array: false, required: true },
      ],
      steps: [
        {
          kind: "action",
          stepId: "query",
          actionDefinitionId: "queryEntities",
          description: "",
          inputs,
        },
      ],
    });

    const constant = (kind: string, value: unknown) => ({
      kind: "constant",
      payload: { kind, value },
    });

    const startsWithAcme = constant("FilterCondition", {
      kind: "all",
      conditions: [
        nameCondition("startsWith", { kind: "Text", value: "Acme" }),
      ],
    });

    const errorsOf = (inputs: Record<string, unknown>) =>
      validateFlowDefinition(queryDefinition(inputs)).diagnostics.filter(
        ({ severity }) => severity === "error",
      );

    it("accepts a constant filter, sort and limit that fit, or a limit from elsewhere", () => {
      for (const limit of [
        constant("Number", 100_000),
        { kind: "flow-input", inputName: "limit" },
      ]) {
        expect(
          errorsOf({
            filter: startsWithAcme,
            sort: constant("SortKey", [
              {
                subject: {
                  kind: "entityProperty",
                  propertyTypeBaseUrl: nameUrl,
                  payloadKind: "Text",
                },
                direction: "descending",
              },
            ]),
            limit,
          }),
        ).toEqual([]);
      }
    });

    it.each([
      {
        name: "an empty filter",
        inputs: {
          filter: constant("FilterCondition", { kind: "all", conditions: [] }),
        },
        inputName: "filter",
        message: "A group requires at least one condition.",
      },
      {
        name: "an operator that doesn't suit the property's kind",
        inputs: {
          filter: constant("FilterCondition", {
            kind: "any",
            conditions: [
              nameCondition("greaterThan", { kind: "Text", value: "Acme" }),
            ],
          }),
        },
        inputName: "filter",
        message: "Operator greaterThan does not support Text.",
      },
      {
        name: "a condition on the entity ID rather than on its types or properties",
        inputs: {
          filter: constant("FilterCondition", {
            kind: "all",
            conditions: [
              {
                kind: "condition",
                subject: { kind: "input", payloadKind: "EntityId" },
                operator: "isNotEmpty",
              },
            ],
          }),
        },
        inputName: "filter",
        message: "A query can only filter on an entity's types and properties.",
      },
      {
        name: "a filter from elsewhere",
        inputs: { filter: { kind: "flow-input", inputName: "filter" } },
        inputName: "filter",
        message: "The filter must be a constant for now",
      },
      {
        name: "a sort key that doesn't read a property",
        inputs: {
          filter: startsWithAcme,
          sort: constant("SortKey", [
            {
              subject: { kind: "field", path: ["name"], payloadKind: "Text" },
              direction: "ascending",
            },
          ]),
        },
        inputName: "sort",
        message:
          "A field subject requires an object input and nonempty, safe own-property names.",
      },
      ...[0, 2.5, 100_001].map((limit) => ({
        name: `a limit of ${limit}`,
        inputs: { filter: startsWithAcme, limit: constant("Number", limit) },
        inputName: "limit",
        message: "The limit must be a whole number from 1 to 100,000.",
      })),
    ])("rejects $name", ({ inputs, inputName, message }) => {
      expect(errorsOf(inputs)).toEqual([
        {
          severity: "error",
          code: "invalidInput",
          message,
          path: ["steps", 0, "inputs", inputName],
        },
      ]);
    });
  });

  describe("aggregations of aggregate steps", () => {
    const aggregateDefinition = (aggregation: Record<string, unknown>) => ({
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

    const constantAggregation = (value: Record<string, unknown>) => ({
      kind: "constant",
      payload: { kind: "Aggregation", value },
    });

    it("accepts a constant aggregation that fits the items, or one from elsewhere", () => {
      for (const aggregation of [
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
      ]) {
        expect(
          diagnosticsOf(aggregateDefinition(aggregation)).filter(
            ({ severity }) => severity === "error",
          ),
        ).toEqual([]);
      }
    });

    it.each([
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
        message:
          "Entity subjects require an EntityId or proposed entity input.",
      },
    ])("rejects $name", ({ aggregation, message }) => {
      expect(
        validateFlowDefinition(
          aggregateDefinition(constantAggregation(aggregation)),
        ).diagnostics.filter(({ severity }) => severity === "error"),
      ).toEqual([
        {
          severity: "error",
          code: "invalidInput",
          message,
          path: ["steps", 0, "inputs", "aggregation"],
        },
      ]);
    });
  });

  describe("counts of takeFirst steps", () => {
    const takeFirstDefinition = (count: number) => ({
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

    it.each([0, 10])("accepts a count of %s", (count) => {
      expect(diagnosticsOf(takeFirstDefinition(count))).toEqual([]);
    });

    it.each([-1, 2.5])(
      "rejects a count of %s, which isn't a whole number of 0 or more",
      (count) => {
        expect(
          validateFlowDefinition(takeFirstDefinition(count)).diagnostics,
        ).toEqual([
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
});
