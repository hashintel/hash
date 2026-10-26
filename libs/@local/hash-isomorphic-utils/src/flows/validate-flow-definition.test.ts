import { describe, expect, test } from "vitest";

import { ftseInvestorsFlow } from "./definitions/ftse-investors-flow-definition.js";
import { goalFlow } from "./definitions/goal-flow-definitions.js";
import {
  answerStep,
  baseDefinition,
  diagnosticsOf,
} from "./validate-flow-definition-fixtures.js";
import { validateFlowDefinition } from "./validate-flow-definition.js";

describe("validateFlowDefinition", () => {
  test("accepts the definitions the builder produces", () => {
    expect.hasAssertions();

    for (const { flowDefinition } of [goalFlow, ftseInvestorsFlow]) {
      expect(validateFlowDefinition(flowDefinition).diagnostics).toStrictEqual(
        [],
      );
    }
  });

  test("reports schema problems without running semantic checks", () => {
    expect.hasAssertions();

    const result = validateFlowDefinition({
      ...baseDefinition,
      steps: [{ kind: "wait" }],
    });

    expect(result.flowDefinition).toBeNull();
    expect(result.diagnostics).toMatchObject([
      { severity: "error", code: "schema", path: ["steps", 0, "kind"] },
    ]);
  });

  test('rejects "~" in step ids wherever a step is named, which the engine uses to name branch steps', () => {
    expect.hasAssertions();

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
    ).toStrictEqual(
      [
        ["steps", 0, "stepId"],
        ["steps", 0, "inputs", "context", "stepId"],
        ["steps", 1, "stepId"],
        ["steps", 1, "collect", "stepId"],
        ["outputs", 0, "stepId"],
      ].map((path) => ({ severity: "error", code: "schema", path })),
    );
  });

  test("reports every problem at once, each with a path", () => {
    expect.hasAssertions();

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
    ).toStrictEqual([
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

  test("reports incompatible connections with the rule's reason", () => {
    expect.hasAssertions();

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

    expect(result.diagnostics).toStrictEqual([
      {
        severity: "error",
        code: "incompatibleConnection",
        message: "A FormattedText value cannot feed an input that accepts Text",
        path: ["steps", 1, "inputs", "question"],
      },
    ]);
  });

  test("accepts steps in any order", () => {
    expect.hasAssertions();

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
    ).toStrictEqual([]);
  });

  test("reports cycles", () => {
    expect.hasAssertions();

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
    ).toStrictEqual([{ severity: "error", code: "cycle", path: ["steps", 0] }]);
  });
});
