import { describe, expect, it } from "vitest";

import { assertClientFlowInputs } from "./assert-client-flow-inputs";

import type {
  FlowInputDefinition,
  FlowInputValues,
} from "@local/hash-isomorphic-utils/flows/types";

const inputs: FlowInputDefinition[] = [
  { name: "query", payloadKind: "Text", array: false, required: true },
  { name: "every", payloadKind: "Duration", array: false, required: false },
  {
    name: "entities",
    payloadKind: "PersistedEntityMetadata",
    array: true,
    required: false,
  },
];

const assertInputs = (flowInputs: Record<string, unknown>) => () =>
  assertClientFlowInputs({
    flowDefinition: { inputs },
    flowInputs: flowInputs as FlowInputValues,
  });

const query = { kind: "Text", value: "a" };

describe("assertClientFlowInputs", () => {
  it("accepts valid inputs, leaving out optional ones", () => {
    expect(assertInputs({ query })).not.toThrow();
  });

  it("accepts an optional input left blank, as the run does", () => {
    expect(
      assertInputs({ query, every: { kind: "Duration", value: "" } }),
    ).not.toThrow();
  });

  it.each([
    {
      problem: "an input the flow doesn't define",
      flowInputs: { query, other: { kind: "Text", value: "b" } },
      message: `Flow input "other" isn't one of the flow's inputs`,
    },
    {
      problem: "a missing required input",
      flowInputs: {
        every: { kind: "Duration", value: { amount: 1, unit: "days" } },
      },
      message: `Flow input "query" is required, but wasn't given`,
    },
    {
      problem: "an input of the wrong kind",
      flowInputs: { query: { kind: "Number", value: 1 } },
      message: `Flow input "query" must be of kind Text, but is of kind Number`,
    },
    {
      problem: "an invalid value, with the path to it",
      flowInputs: {
        query,
        every: { kind: "Duration", value: { amount: 1, unit: "years" } },
      },
      message: `Flow input "every" is invalid at unit: `,
    },
    {
      problem: "a stored payload reference",
      flowInputs: {
        query,
        entities: {
          kind: "PersistedEntityMetadata",
          value: {
            __stored: true,
            kind: "PersistedEntityMetadata",
            storageKey: "flows/other-run/outputs/step-1",
            array: true,
            length: 2,
          },
        },
      },
      message: `Flow input "entities" is invalid: A stored payload reference can only be created by a flow's own steps`,
    },
  ])("rejects $problem as a bad request", ({ flowInputs, message }) => {
    expect(assertInputs(flowInputs)).toThrow(
      expect.objectContaining({
        message: expect.stringContaining(message),
        extensions: expect.objectContaining({ code: "BAD_REQUEST" }),
      }),
    );
  });
});
