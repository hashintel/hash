import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createFlowScheduleResolver,
  resumeFlowScheduleResolver,
} from "./flow-schedule";

const mocks = vi.hoisted(() => ({
  createFlowSchedule: vi.fn(),
  createSchedule: vi.fn(),
  describeSchedule: vi.fn(),
  getFlowScheduleById: vi.fn(),
  getRunnableFlowDefinition: vi.fn(),
  resumeFlowSchedule: vi.fn(),
  unpauseSchedule: vi.fn(),
}));

vi.mock("../../../graph/knowledge/system-types/flow-schedule", () => ({
  createFlowSchedule: mocks.createFlowSchedule,
  getFlowScheduleById: mocks.getFlowScheduleById,
  resumeFlowSchedule: mocks.resumeFlowSchedule,
}));

vi.mock("../util", () => ({
  graphQLContextToImpureGraphContext: () => ({}),
}));

vi.mock("./shared/get-runnable-flow-definition", () => ({
  getRunnableFlowDefinition: mocks.getRunnableFlowDefinition,
}));

const webId = "00000000-0000-0000-0000-000000000001";

const graphQLContext = {
  authentication: { actorId: webId },
  temporal: {
    schedule: {
      create: mocks.createSchedule,
      getHandle: () => ({
        describe: mocks.describeSchedule,
        unpause: mocks.unpauseSchedule,
      }),
    },
  },
  user: { accountId: webId },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getRunnableFlowDefinition.mockResolvedValue({
    flowDefinition: {},
    flowType: "integration",
  });
});

describe("createFlowScheduleResolver", () => {
  it("rejects a stored payload reference in the flow inputs before saving the schedule", async () => {
    const save = createFlowScheduleResolver(
      {},
      {
        input: {
          name: "Nightly",
          flowDefinition: {},
          flowDefinitionId: "00000000-0000-0000-0000-000000000002",
          webId,
          scheduleSpec: { type: "interval", intervalMs: 60_000 },
          triggerImmediately: false,
          flowInputs: {
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

describe("resumeFlowScheduleResolver", () => {
  const scheduleEntityId = `${webId}~00000000-0000-0000-0000-000000000003`;

  const resume = () =>
    resumeFlowScheduleResolver(
      {},
      { scheduleEntityId } as never,
      graphQLContext as never,
      {} as never,
    );

  beforeEach(() => {
    mocks.getFlowScheduleById.mockResolvedValue({
      metadata: { recordId: { entityId: scheduleEntityId } },
      properties: {
        "https://hash.ai/@h/types/property-type/schedule-status/": "paused",
        "https://hash.ai/@h/types/property-type/inputs/": [],
      },
    });
    mocks.describeSchedule.mockResolvedValue({
      action: {
        taskQueue: "integration",
        args: [{ flowDefinitionEntityId: `${webId}~flow` }],
      },
    });
  });

  it("refuses to resume a schedule whose flow no longer takes the inputs it gives, without resuming it", async () => {
    mocks.getRunnableFlowDefinition.mockResolvedValue({
      flowDefinition: {
        name: "Report",
        description: "",
        inputs: [
          { name: "topic", payloadKind: "Text", array: false, required: true },
        ],
        steps: [],
        outputs: [],
      },
      flowDefinitionEntity: { metadata: { archived: false } },
    });

    await expect(resume()).rejects.toMatchObject({
      message: expect.stringContaining(
        '- it gives no value for the required input "topic"',
      ),
      extensions: { code: "BAD_REQUEST" },
    });
    expect(mocks.resumeFlowSchedule).not.toHaveBeenCalled();
    expect(mocks.unpauseSchedule).not.toHaveBeenCalled();
  });

  it("refuses to resume a schedule whose flow has been archived", async () => {
    mocks.getRunnableFlowDefinition.mockResolvedValue({
      flowDefinition: {
        name: "Report",
        description: "",
        inputs: [],
        steps: [],
        outputs: [],
      },
      flowDefinitionEntity: { metadata: { archived: true } },
    });

    await expect(resume()).rejects.toMatchObject({
      extensions: { code: "BAD_REQUEST" },
    });
    expect(mocks.resumeFlowSchedule).not.toHaveBeenCalled();
  });
});
