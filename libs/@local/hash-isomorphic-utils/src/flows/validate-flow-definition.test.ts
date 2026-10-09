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
});
