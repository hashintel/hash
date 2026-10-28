import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFlowScheduleResolver } from "./flow-schedule";

import type { FlowInputDefinition } from "@local/hash-isomorphic-utils/flows/types";

const mocks = vi.hoisted(() => ({
  createFlowSchedule: vi.fn(),
  createSchedule: vi.fn(),
}));

vi.mock("../../../graph/knowledge/system-types/flow-schedule", () => ({
  createFlowSchedule: mocks.createFlowSchedule,
}));

vi.mock("../util", () => ({
  graphQLContextToImpureGraphContext: () => ({}),
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
  authentication: { actorId: "00000000-0000-0000-0000-000000000001" },
  temporal: { schedule: { create: mocks.createSchedule } },
  user: { accountId: "00000000-0000-0000-0000-000000000001" },
};

const createSchedule = (flowInputs: Record<string, unknown>) =>
  createFlowScheduleResolver(
    {},
    {
      input: {
        name: "Nightly",
        flowDefinitionEntityId:
          "00000000-0000-0000-0000-000000000001~00000000-0000-0000-0000-000000000002",
        webId: "00000000-0000-0000-0000-000000000001",
        scheduleSpec: { type: "interval", intervalMs: 60_000 },
        triggerImmediately: false,
        flowInputs,
      },
    } as never,
    graphQLContext as never,
    {} as never,
  );

const query = { kind: "Text", value: "a" };

describe("createFlowScheduleResolver", () => {
  beforeEach(() => {
    mocks.createFlowSchedule.mockReset().mockResolvedValue({
      properties: {},
      metadata: {
        recordId: {
          entityId:
            "00000000-0000-0000-0000-000000000001~00000000-0000-0000-0000-000000000003",
        },
      },
    });
    mocks.createSchedule.mockReset();
  });

  it("schedules runs with valid inputs, leaving out optional ones", async () => {
    await expect(createSchedule({ query })).resolves.toBe(
      "00000000-0000-0000-0000-000000000003",
    );

    expect(mocks.createSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        action: expect.objectContaining({
          args: [expect.objectContaining({ flowInputs: { query } })],
        }),
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
    "rejects $problem before saving the schedule",
    async ({ flowInputs, message }) => {
      await expect(createSchedule(flowInputs)).rejects.toMatchObject({
        message: expect.stringContaining(message),
        extensions: { code: "BAD_REQUEST" },
      });
      expect(mocks.createFlowSchedule).not.toHaveBeenCalled();
      expect(mocks.createSchedule).not.toHaveBeenCalled();
    },
  );
});
