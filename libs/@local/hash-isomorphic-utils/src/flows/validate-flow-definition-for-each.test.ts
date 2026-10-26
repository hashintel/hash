import { describe, expect, test } from "vitest";

import {
  answerStep,
  baseDefinition,
  diagnosticsOf,
} from "./validate-flow-definition-fixtures.js";

import type {
  Fixture,
  FixtureObject,
  FlowDefinitionFixture,
} from "./validate-flow-definition-fixtures.js";

interface ForEachOverrides {
  over?: Fixture;
  collect?: Fixture;
  after?: Fixture[];
}

const forEachDefinition = (
  overrides: ForEachOverrides,
): FlowDefinitionFixture => ({
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

const overOptionalInput = (over: FixtureObject): FlowDefinitionFixture => ({
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

const collectsFrom = (stepId: string, from: string): FixtureObject => ({
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

const consumingInside = (context: Fixture): ReturnType<typeof diagnosticsOf> =>
  diagnosticsOf({
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
        over: {
          kind: "step-output",
          stepId: "queries",
          outputName: "queries",
        },
        steps: [
          answerStep("answer", {
            question: { kind: "item", access: "consume" },
            context,
          }),
        ],
        collect: {
          stepId: "answer",
          outputName: "explanation",
          as: "explanations",
        },
      },
    ],
  });

describe("for-each steps", () => {
  test("accepts a valid for-each step", () => {
    expect.hasAssertions();

    expect(diagnosticsOf(forEachDefinition({}))).toStrictEqual([]);
  });

  test("rejects iterating over a singular value", () => {
    expect.hasAssertions();

    const definition = forEachDefinition({
      over: { kind: "flow-input", inputName: "question" },
    });

    expect(diagnosticsOf(definition)).toContainEqual({
      severity: "error",
      code: "overNotArray",
      path: ["steps", 1, "over"],
    });
  });

  test("iterates over a value that may be missing only if it's skipped when the value is missing", () => {
    expect.hasAssertions();

    const required = overOptionalInput({
      kind: "flow-input",
      inputName: "questions",
    });

    expect(diagnosticsOf(required)).toStrictEqual([
      {
        severity: "error",
        code: "overNotRequired",
        path: ["steps", 1, "over"],
      },
    ]);

    const skipped = overOptionalInput({
      kind: "flow-input",
      inputName: "questions",
      whenMissing: "skip",
    });

    expect(diagnosticsOf(skipped)).toStrictEqual([]);
  });

  test("rejects a for-each step inside another", () => {
    expect.hasAssertions();

    const queriesOutput = {
      kind: "step-output",
      stepId: "queries",
      outputName: "queries",
    };

    const definition = {
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
    };

    expect(diagnosticsOf(definition)).toStrictEqual([
      {
        severity: "error",
        code: "nestedForEach",
        path: ["steps", 1, "steps", 0],
      },
    ]);
  });

  test("rejects using a nested step's output outside the for-each step", () => {
    expect.hasAssertions();

    const leak = answerStep("leak", {
      question: {
        kind: "step-output",
        stepId: "answer",
        outputName: "explanation",
      },
    });

    expect(diagnosticsOf(forEachDefinition({ after: [leak] }))).toStrictEqual([
      {
        severity: "error",
        code: "stepNotInScope",
        path: ["steps", 2, "inputs", "question"],
      },
    ]);
  });

  test("rejects consuming a value from outside a for-each step inside it", () => {
    expect.hasAssertions();

    expect(
      consumingInside({
        kind: "flow-input",
        inputName: "question",
        access: "consume",
      }),
    ).toStrictEqual([
      {
        severity: "error",
        code: "consumedIntoForEach",
        path: ["steps", 1, "steps", 0, "inputs", "context"],
      },
    ]);
    expect(
      consumingInside({
        kind: "step-output",
        stepId: "queries",
        outputName: "queries",
        access: "consume",
      }).map(({ code }) => code),
    ).toContain("consumedIntoForEach");
    expect(
      consumingInside({ kind: "flow-input", inputName: "question" }),
    ).toStrictEqual([]);
  });

  test("rejects an item outside a for-each step", () => {
    expect.hasAssertions();

    const definition = {
      ...baseDefinition,
      steps: [
        answerStep("answer", {
          question: { kind: "item" },
        }),
      ],
    };

    expect(diagnosticsOf(definition)).toContainEqual({
      severity: "error",
      code: "itemOutsideForEach",
      path: ["steps", 0, "inputs", "question"],
    });
  });

  test("rejects a for-each step that collects from itself or from another for-each step", () => {
    expect.hasAssertions();

    const usesCollected = answerStep("after", {
      question: { kind: "flow-input", inputName: "question" },
      context: {
        kind: "step-output",
        stepId: "each",
        outputName: "explanations",
      },
    });

    const collectsFromItself = forEachDefinition({
      collect: {
        stepId: "each",
        outputName: "explanations",
        as: "explanations",
      },
      after: [usesCollected],
    });

    expect(diagnosticsOf(collectsFromItself)).toContainEqual({
      severity: "error",
      code: "invalidCollect",
      path: ["steps", 1, "collect", "stepId"],
    });

    const collectsFromEachOther = {
      ...forEachDefinition({}),
      steps: [
        forEachDefinition({}).steps[0],
        collectsFrom("each", "other"),
        collectsFrom("other", "each"),
        usesCollected,
      ],
    };

    expect(diagnosticsOf(collectsFromEachOther)).toContainEqual({
      severity: "error",
      code: "invalidCollect",
      path: ["steps", 1, "collect", "stepId"],
    });
  });

  test("rejects collecting an output the step does not have", () => {
    expect.hasAssertions();

    const definition = forEachDefinition({
      collect: {
        stepId: "answer",
        outputName: "missing",
        as: "answers",
      },
    });

    expect(diagnosticsOf(definition)).toContainEqual({
      severity: "error",
      code: "unknownStepOutput",
      path: ["steps", 1, "collect", "outputName"],
    });
  });
});
