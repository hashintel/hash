import { typedActionDefinitions as actions } from "@local/hash-isomorphic-utils/flows/action-definitions";
import {
  constant,
  defineFlow,
  flowInput,
} from "@local/hash-isomorphic-utils/flows/define-flow";

import { defineScenario } from "../scenario.js";

const number = { kind: "input", payloadKind: "Number" } as const;

const flow = defineFlow(
  {
    flowDefinitionId: "00000000-0000-4000-8000-000000001957",
    name: "Array actions run",
    description:
      "Filter List, Order By, Take First, Aggregate, Find and If on a list of numbers",
    inputs: {
      scores: flowInput("Number", { array: true }),
    },
  },
  ({ inputs, step }) => {
    const passing = step("passing", actions.filterList, {
      description: "Split the scores at 50",
      inputs: {
        items: inputs.scores,
        condition: constant("FilterCondition", {
          kind: "all",
          conditions: [
            {
              kind: "condition",
              subject: number,
              operator: "greaterThanOrEqual",
              value: { kind: "Number", value: 50 },
            },
          ],
        }),
      },
    });

    step("passingCount", actions.aggregate, {
      description: "Count the passing scores",
      inputs: {
        items: passing.outputs.matching,
        aggregation: constant("Aggregation", { operation: "count" }),
      },
    });

    const ranked = step("ranked", actions.orderBy, {
      description: "Sort the passing scores, highest first",
      inputs: {
        items: passing.outputs.matching,
        sortBy: constant("SortKey", {
          subject: number,
          direction: "descending",
        }),
      },
    });

    const top = step("top", actions.takeFirst, {
      description: "Keep the top two",
      inputs: {
        items: ranked.outputs.items,
        count: constant("Number", 2),
      },
    });

    const total = step("total", actions.aggregate, {
      description: "Sum the top two",
      inputs: {
        items: top.outputs.items,
        aggregation: constant("Aggregation", {
          operation: "sum",
          subject: number,
        }),
      },
    });

    const isBig = step("isBig", actions.if, {
      description: "Is the total over 150?",
      inputs: {
        value: total.outputs.result.orSkip(),
        condition: constant("FilterCondition", {
          kind: "all",
          conditions: [
            {
              kind: "condition",
              subject: number,
              operator: "greaterThan",
              value: { kind: "Number", value: 150 },
            },
          ],
        }),
      },
    });

    step("whenSmall", actions.takeFirst, {
      description: "Only runs when the total is 150 or less",
      inputs: {
        items: isBig.outputs.false.orSkip().wrap(),
        count: constant("Number", 1),
      },
    });

    const firstLow = step("firstLow", actions.find, {
      description: "Find the first failing score under 10",
      inputs: {
        items: passing.outputs.nonMatching,
        condition: constant("FilterCondition", {
          kind: "all",
          conditions: [
            {
              kind: "condition",
              subject: number,
              operator: "lessThan",
              value: { kind: "Number", value: 10 },
            },
          ],
        }),
      },
    });

    return {
      outputs: {
        total: total.outputs.result,
        firstLow: firstLow.outputs.match,
      },
    };
  },
);

export const scenario = defineScenario({
  name: "Array actions on a list of numbers",
  purpose:
    "Chains Filter List, Order By, Take First and Aggregate, branches on the total with If, and checks the untaken branch is skipped.",
  runs: [
    {
      flow,
      inputs: {
        scores: { kind: "Number", value: [72, 45, 90, 50, 8, 99, 30] },
      },
      expect: {
        outputs: { total: 189, firstLow: 8 },
        steps: {
          passing: {
            outputs: { matching: [72, 90, 50, 99], nonMatching: [45, 8, 30] },
          },
          passingCount: { outputs: { result: 4 } },
          ranked: { outputs: { items: [99, 90, 72, 50] } },
          top: { outputs: { items: [99, 90] } },
          total: { outputs: { result: 189 } },
          isBig: { outputs: { true: 189 }, absentOutputs: ["false"] },
          whenSmall: { status: "SKIPPED" },
          firstLow: { outputs: { match: 8 } },
        },
      },
    },
  ],
});
