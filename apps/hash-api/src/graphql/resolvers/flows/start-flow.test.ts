import { beforeEach, describe, expect, it, vi } from "vitest";

import { startFlow } from "./start-flow";

import type { FlowInputDefinition } from "@local/hash-isomorphic-utils/flows/types";

const mocks = vi.hoisted(() => ({
  startWorkflow: vi.fn(),
}));

const inputs: FlowInputDefinition[] = [
  { name: "query", payloadKind: "Text", array: false, required: true },
  { name: "every", payloadKind: "Duration", array: false, required: false },
  {
    name: "entities",
    payloadKind: "ProposedEntity",
    array: false,
    required: false,
  },
];

vi.mock("./shared/get-runnable-flow-definition", () => ({
  getRunnableFlowDefinition: () => ({
    flowDefinition: { inputs },
    flowType: "integration",
  }),
}));

const graphQLContext = {
  temporal: { workflow: { start: mocks.startWorkflow } },
  user: { accountId: "00000000-0000-0000-0000-000000000001" },
};

const start = (flowInputs: Record<string, unknown>) =>
  startFlow(
    {},
    {
      flowDefinitionEntityId:
        "00000000-0000-0000-0000-000000000001~00000000-0000-0000-0000-000000000002",
      flowInputs,
      webId: "00000000-0000-0000-0000-000000000001",
    } as never,
    graphQLContext as never,
    {} as never,
  );

const query = { kind: "Text", value: "a" };

describe("startFlow", () => {
  beforeEach(() => {
    mocks.startWorkflow.mockReset();
  });

  it("starts a run with valid inputs, leaving out optional ones", async () => {
    await start({ query });

    expect(mocks.startWorkflow).toHaveBeenCalledWith(
      "runFlow",
      expect.objectContaining({
        args: [expect.objectContaining({ flowInputs: { query } })],
      }),
    );
  });

  it.each([
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
          kind: "ProposedEntity",
          value: {
            __stored: true,
            kind: "ProposedEntity",
            storageKey: "flows/other-run/outputs/step-1",
            array: false,
          },
        },
      },
      message: `Flow input "entities" is invalid: A stored payload reference can only be created by a flow's own steps`,
    },
  ])(
    "rejects $problem before starting a run",
    async ({ flowInputs, message }) => {
      await expect(start(flowInputs)).rejects.toMatchObject({
        message: expect.stringContaining(message),
        extensions: { code: "BAD_REQUEST" },
      });
      expect(mocks.startWorkflow).not.toHaveBeenCalled();
    },
  );
});
