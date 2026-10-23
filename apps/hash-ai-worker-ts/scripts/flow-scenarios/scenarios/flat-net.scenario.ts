import { typedActionDefinitions as actions } from "@local/hash-isomorphic-utils/flows/action-definitions";
import {
  constant,
  defineFlow,
  flowInput,
} from "@local/hash-isomorphic-utils/flows/define-flow";

import { defineScenario } from "../scenario.js";

import type { EntityQuery } from "@local/hash-isomorphic-utils/flows/types";

const number = { kind: "input", payloadKind: "Number" } as const;

/** A forEach whose items each run two steps, then a step over what it collects. */
const forEachFlow = defineFlow(
  {
    flowDefinitionId: "00000000-0000-4000-8000-00000000f1a7",
    name: "Flat net: forEach",
    description: "Ranks each score's list, then adds up the scores",
    inputs: {
      scores: flowInput("Number", { array: true }),
    },
  },
  ({ inputs, step, forEach }) => {
    const collected = forEach("eachScore", inputs.scores, {
      description: "For each score",
      collectAs: "scores",
      steps: (score, scope) => {
        const wrapped = scope.step("wrap", actions.takeFirst, {
          description: "The score as a list of one",
          inputs: { items: score.wrap(), count: constant("Number", 1) },
        });

        return scope.step("rank", actions.orderBy, {
          description: "Sort the list",
          inputs: {
            items: wrapped.outputs.items,
            sortBy: constant("SortKey", {
              subject: number,
              direction: "descending",
            }),
          },
        }).outputs.items;
      },
    });

    const total = step("total", actions.aggregate, {
      description: "Add up the collected scores",
      inputs: {
        items: collected,
        aggregation: constant("Aggregation", {
          operation: "sum",
          subject: number,
        }),
      },
    });

    return { outputs: { total: total.outputs.result } };
  },
);

/**
 * A query the graph rejects, so its step throws on every attempt. Temporal retries it five times, waiting twice as long
 * each time from a second, so the run takes about half a minute to give up on it, which leaves time to watch. The
 * query is a constant, as the run page can't show a flow with an `EntityQuery` input.
 */
const retryFlow = defineFlow(
  {
    flowDefinitionId: "00000000-0000-4000-8000-00000000f1a8",
    name: "Flat net: retries",
    description: "Counts the entities a query finds, with a query that fails",
    inputs: {},
  },
  ({ step }) => {
    const found = step("found", actions.queryEntities, {
      description: "Find the entities, retrying five times",
      inputs: {
        query: constant("EntityQuery", {
          filter: { equal: [{ path: ["notAPath"] }, { parameter: 1 }] },
        } as unknown as EntityQuery),
      },
      retryCount: 6,
    });

    const count = step("count", actions.aggregate, {
      description: "Count them",
      inputs: {
        items: found.outputs.entities,
        aggregation: constant("Aggregation", { operation: "count" }),
      },
    });

    return { outputs: { count: count.outputs.result } };
  },
);

export const scenario = defineScenario({
  name: "Flat net",
  purpose:
    "Runs to watch on the flattened flow net: a forEach with two steps per item, and a step that fails on every attempt.",
  runs: [
    {
      flow: forEachFlow,
      inputs: { scores: { kind: "Number", value: [72, 8, 99] } },
      expect: { outputs: { total: 179 } },
    },
    {
      flow: retryFlow,
      inputs: {},
      expect: {
        status: "FAILED",
        steps: { found: { status: "FAILED" } },
      },
    },
  ],
});
