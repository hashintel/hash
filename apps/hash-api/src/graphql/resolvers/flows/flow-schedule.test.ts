import { describe, expect, it, vi } from "vitest";

import { createFlowScheduleResolver } from "./flow-schedule";

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

vi.mock("./shared/get-runnable-flow-definition", () => ({
  getRunnableFlowDefinition: () => ({
    flowDefinition: {},
    flowType: "integration",
  }),
}));

const graphQLContext = {
  authentication: { actorId: "00000000-0000-0000-0000-000000000001" },
  temporal: { schedule: { create: mocks.createSchedule } },
  user: { accountId: "00000000-0000-0000-0000-000000000001" },
};

describe("createFlowScheduleResolver", () => {
  it("rejects a stored payload reference in an array input before saving the schedule", async () => {
    const save = createFlowScheduleResolver(
      {},
      {
        input: {
          name: "Nightly",
          flowDefinition: {},
          flowDefinitionId: "00000000-0000-0000-0000-000000000002",
          webId: "00000000-0000-0000-0000-000000000001",
          scheduleSpec: { type: "interval", intervalMs: 60_000 },
          triggerImmediately: false,
          flowInputs: {
            entities: {
              kind: "PersistedEntityMetadata",
              value: [
                {
                  __stored: true,
                  kind: "PersistedEntityMetadata",
                  array: false,
                  of: {
                    __stored: true,
                    kind: "PersistedEntityMetadata",
                    storageKey: "flows/other-run/outputs/step-1",
                    array: true,
                    length: 1,
                  },
                  index: 0,
                },
              ],
            },
          },
        },
      } as never,
      graphQLContext as never,
      {} as never,
    );

    await expect(save).rejects.toMatchObject({
      message: expect.stringContaining('Flow input "entities"'),
      extensions: { code: "BAD_REQUEST" },
    });
    expect(mocks.createFlowSchedule).not.toHaveBeenCalled();
    expect(mocks.createSchedule).not.toHaveBeenCalled();
  });
});
