import { typedActionDefinitions as actions } from "@local/hash-isomorphic-utils/flows/action-definitions";
import {
  constant,
  defineFlow,
  flowInput,
} from "@local/hash-isomorphic-utils/flows/define-flow";

import { defineScenario } from "../scenario.js";

const number = { kind: "input", payloadKind: "Number" } as const;

const atLeast = (value: number) =>
  constant("FilterCondition", {
    kind: "all",
    conditions: [
      {
        kind: "condition",
        subject: number,
        operator: "greaterThanOrEqual",
        value: { kind: "Number", value },
      },
    ],
  });

const flow = defineFlow(
  {
    flowDefinitionId: "00000000-0000-4000-8000-000000001904",
    name: "forEach run",
    description:
      "forEach over a list and over an empty list, with a step some items skip",
    inputs: {
      scores: flowInput("Number", { array: true }),
    },
  },
  ({ inputs, step, forEach }) => {
    const collected = forEach("eachScore", inputs.scores, {
      description: "For each score",
      collectAs: "scores",
      steps: (score, scope) => {
        const passed = scope.step("passed", actions.if, {
          description: "Is it 50 or more?",
          inputs: { value: score, condition: atLeast(50) },
        });

        scope.step("keepPassing", actions.takeFirst, {
          description: "Only runs for a passing score",
          inputs: {
            items: passed.outputs.true.orSkip().wrap(),
            count: constant("Number", 1),
          },
        });

        return scope.step("wrap", actions.takeFirst, {
          description: "The score as a list of one, to collect",
          inputs: { items: score.wrap(), count: constant("Number", 1) },
        }).outputs.items;
      },
    });

    const total = step("total", actions.aggregate, {
      description: "Sum the collected scores",
      inputs: {
        items: collected,
        aggregation: constant("Aggregation", {
          operation: "sum",
          subject: number,
        }),
      },
    });

    const huge = step("huge", actions.filterList, {
      description: "Keep the scores of 500 or more, which there aren't",
      inputs: { items: inputs.scores, condition: atLeast(500) },
    });

    const collectedFromNone = forEach("eachHuge", huge.outputs.matching, {
      description: "For each score of 500 or more",
      collectAs: "scores",
      steps: (score, scope) =>
        scope.step("wrapHuge", actions.takeFirst, {
          description: "The score as a list of one, to collect",
          inputs: { items: score.wrap(), count: constant("Number", 1) },
        }).outputs.items,
    });

    const hugeCount = step("hugeCount", actions.aggregate, {
      description: "Count what was collected from no items",
      inputs: {
        items: collectedFromNone,
        aggregation: constant("Aggregation", { operation: "count" }),
      },
    });

    return {
      outputs: {
        collected,
        total: total.outputs.result,
        collectedFromNone,
        hugeCount: hugeCount.outputs.result,
      },
    };
  },
);

export const scenario = defineScenario({
  name: "forEach",
  purpose:
    "Runs steps once per item in parallel, with one item feeding two steps and a step that only some items run, collects the results in item order, and completes a forEach over an empty list with nothing collected.",
  runs: [
    {
      flow,
      inputs: {
        scores: { kind: "Number", value: [72, 8, 99, 30] },
      },
      expect: {
        outputs: {
          collected: [72, 8, 99, 30],
          total: 209,
          collectedFromNone: [],
          hugeCount: 0,
        },
        steps: {
          "passed~0": { outputs: { true: 72 }, absentOutputs: ["false"] },
          "passed~1": { outputs: { false: 8 }, absentOutputs: ["true"] },
          "passed~2": { outputs: { true: 99 }, absentOutputs: ["false"] },
          "passed~3": { outputs: { false: 30 }, absentOutputs: ["true"] },
          "keepPassing~0": { outputs: { items: [72] } },
          "keepPassing~1": { status: "SKIPPED" },
          "keepPassing~2": { outputs: { items: [99] } },
          "keepPassing~3": { status: "SKIPPED" },
          "wrap~0": { outputs: { items: [72] } },
          "wrap~1": { outputs: { items: [8] } },
          "wrap~2": { outputs: { items: [99] } },
          "wrap~3": { outputs: { items: [30] } },
          total: { outputs: { result: 209 } },
          huge: { outputs: { matching: [], nonMatching: [72, 8, 99, 30] } },
          hugeCount: { outputs: { result: 0 } },
        },
      },
    },
  ],
});
