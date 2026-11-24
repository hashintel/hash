import { typedActionDefinitions as actions } from "@local/hash-isomorphic-utils/flows/action-definitions";
import {
  constant,
  defineFlow,
  flowInput,
} from "@local/hash-isomorphic-utils/flows/define-flow";

import { defineScenario } from "../scenario.js";

import type {
  FlowDefinitionWithId,
  StepDefinition,
} from "@local/hash-isomorphic-utils/flows/types";

const overFifty = constant("FilterCondition", {
  kind: "all",
  conditions: [
    {
      kind: "condition",
      subject: { kind: "input", payloadKind: "Number" },
      operator: "greaterThan",
      value: { kind: "Number", value: 50 },
    },
  ],
});

const defined = defineFlow(
  {
    flowDefinitionId: "00000000-0000-4000-8000-000000002277",
    name: "If paths run",
    description:
      "Steps on an If's Yes and No paths, a step further down Yes, a rejoin, a step after the If on neither path, and the same If inside a for-each",
    inputs: {
      score: flowInput("Number"),
      scores: flowInput("Number", { array: true }),
    },
  },
  ({ inputs, step, forEach }) => {
    step("check", actions.if, {
      description: "Is the score over 50?",
      inputs: { value: inputs.score, condition: overFifty },
    });

    /* Each takes the first score only to run something: whether it runs is up to its paths, set below. */
    for (const [stepId, description] of [
      ["onYes", "On Yes"],
      ["onNo", "On No"],
      ["afterYes", "After the step on Yes"],
      ["rejoin", "Where the paths rejoin"],
      ["afterCheck", "After the If, whichever path it takes"],
    ] as const) {
      step(stepId, actions.takeFirst, {
        description,
        inputs: { items: inputs.scores, count: constant("Number", 1) },
      });
    }

    const firsts = forEach("each", inputs.scores, {
      description: "For each score",
      collectAs: "firsts",
      steps: (score, scope) => {
        scope.step("innerCheck", actions.if, {
          description: "Is this score over 50?",
          inputs: { value: score, condition: overFifty },
        });

        scope.step("innerYes", actions.takeFirst, {
          description: "On this score's Yes",
          inputs: { items: score.wrap(), count: constant("Number", 1) },
        });

        return scope.step("innerEvery", actions.takeFirst, {
          description: "For every score, on no path",
          inputs: { items: score.wrap(), count: constant("Number", 1) },
        }).outputs.items;
      },
    });

    return { outputs: { firsts } };
  },
);

/** `defineFlow` can't draw lines between steps, so they're added to its definition. */
const runAfter: Record<string, StepDefinition["runAfter"]> = {
  onYes: [{ stepId: "check", outputName: "true" }],
  onNo: [{ stepId: "check", outputName: "false" }],
  afterYes: [{ stepId: "onYes" }],
  rejoin: [{ stepId: "afterYes" }, { stepId: "onNo" }],
  afterCheck: [{ stepId: "check" }],
  innerYes: [{ stepId: "innerCheck", outputName: "true" }],
};

const withRunAfter = (steps: StepDefinition[]): StepDefinition[] =>
  steps.map((step) => ({
    ...step,
    ...(runAfter[step.stepId] ? { runAfter: runAfter[step.stepId] } : {}),
    ...(step.kind === "for-each" ? { steps: withRunAfter(step.steps) } : {}),
  }));

const flow: FlowDefinitionWithId = {
  ...defined,
  flowDefinition: {
    ...defined.flowDefinition,
    steps: withRunAfter(defined.flowDefinition.steps),
  },
};

const scores = { kind: "Number" as const, value: [72, 20] };

export const scenario = defineScenario({
  name: "Steps on an If's paths",
  purpose:
    "Runs only the steps on the path an If takes, skips everything further down the other, runs the step where the paths rejoin and a step after the If on neither path, and follows each item's If in a for-each.",
  runs: [
    {
      flow,
      inputs: { score: { kind: "Number", value: 80 }, scores },
      expect: {
        outputs: { firsts: [72, 20] },
        steps: {
          check: { outputs: { true: 80 }, absentOutputs: ["false"] },
          onYes: { outputs: { items: [72] } },
          onNo: { status: "SKIPPED" },
          afterYes: { outputs: { items: [72] } },
          rejoin: { outputs: { items: [72] } },
          afterCheck: { outputs: { items: [72] } },
          "innerYes~0": { outputs: { items: [72] } },
          "innerYes~1": { status: "SKIPPED" },
        },
      },
    },
    {
      flow,
      inputs: { score: { kind: "Number", value: 20 }, scores },
      expect: {
        outputs: { firsts: [72, 20] },
        steps: {
          check: { outputs: { false: 20 }, absentOutputs: ["true"] },
          onYes: { status: "SKIPPED" },
          onNo: { outputs: { items: [72] } },
          afterYes: { status: "SKIPPED" },
          rejoin: { outputs: { items: [72] } },
          afterCheck: { outputs: { items: [72] } },
        },
      },
    },
  ],
});
