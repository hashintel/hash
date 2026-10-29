import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  archiveFlowDefinitionResolver,
  createFlowDefinitionResolver,
  updateFlowDefinitionResolver,
} from "./flow-definition";

const mocks = vi.hoisted(() => ({
  archive: vi.fn(),
  createFlowDefinition: vi.fn(),
  getActiveFlowSchedulesOfFlowDefinition: vi.fn(),
  getFlowDefinitionEntityById: vi.fn(),
  pauseActiveFlowSchedule: vi.fn(),
  updateFlowDefinition: vi.fn(),
}));

vi.mock("../../../graph/knowledge/system-types/flow-definition", () => ({
  createFlowDefinition: mocks.createFlowDefinition,
  getActiveFlowSchedulesOfFlowDefinition:
    mocks.getActiveFlowSchedulesOfFlowDefinition,
  updateFlowDefinition: mocks.updateFlowDefinition,
}));

vi.mock(
  "@local/hash-backend-utils/flows/shared/get-flow-definition-entity-by-id",
  () => ({ getFlowDefinitionEntityById: mocks.getFlowDefinitionEntityById }),
);

vi.mock("./flow-schedule", () => ({
  pauseActiveFlowSchedule: mocks.pauseActiveFlowSchedule,
}));

vi.mock("../util", () => ({
  graphQLContextToImpureGraphContext: () => ({}),
}));

const webId = "00000000-0000-0000-0000-000000000001";
const flowDefinitionEntityId = `${webId}~00000000-0000-0000-0000-000000000002`;

const graphQLContext = {
  authentication: { actorId: webId },
  dataSources: { graphApi: {} },
};

const question = {
  name: "question",
  payloadKind: "Text",
  array: false,
  required: true,
};

const answerStep = {
  kind: "action",
  stepId: "answer",
  actionDefinitionId: "answerQuestion",
  description: "",
  inputs: { question: { kind: "flow-input", inputName: "question" } },
};

const validDefinition = {
  name: "Answer",
  description: "",
  inputs: [question],
  steps: [answerStep],
  outputs: [],
};

/** Valid in shape, but its step takes an input the flow doesn't have. */
const unfinishedDefinition = { ...validDefinition, inputs: [] };

const savedEntity = (editionId: string, archived = false) => ({
  metadata: {
    recordId: { entityId: flowDefinitionEntityId, editionId },
    archived,
  },
  archive: mocks.archive,
});

const activeSchedule = (inputs: unknown[]) => ({
  properties: {
    "https://blockprotocol.org/@blockprotocol/types/property-type/name/":
      "Nightly",
    "https://hash.ai/@h/types/property-type/inputs/": inputs,
  },
});

const update = (definition: unknown, expectedEditionId = "edition-1") =>
  updateFlowDefinitionResolver(
    {},
    { flowDefinitionEntityId, expectedEditionId, definition } as never,
    graphQLContext as never,
    {} as never,
  );

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getFlowDefinitionEntityById.mockResolvedValue(savedEntity("edition-1"));
  mocks.getActiveFlowSchedulesOfFlowDefinition.mockResolvedValue([]);
  mocks.updateFlowDefinition.mockResolvedValue(savedEntity("edition-2"));
});

describe("createFlowDefinitionResolver", () => {
  it("saves a flow that isn't valid yet, with its problems on the steps they're in", async () => {
    mocks.createFlowDefinition.mockResolvedValue(savedEntity("edition-1"));

    const result = await createFlowDefinitionResolver(
      {},
      { webId, definition: unfinishedDefinition } as never,
      graphQLContext as never,
      {} as never,
    );

    expect(mocks.createFlowDefinition).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { webId, flowDefinition: unfinishedDefinition },
    );
    expect(result).toMatchObject({
      flowDefinitionEntityId,
      editionId: "edition-1",
      isRunnable: false,
      diagnostics: [
        {
          severity: "error",
          code: "unknownFlowInput",
          path: ["steps", 0, "inputs", "question"],
          stepId: "answer",
        },
      ],
    });
  });

  it("refuses a definition without the shape of one", async () => {
    await expect(
      createFlowDefinitionResolver(
        {},
        { webId, definition: { ...validDefinition, steps: "none" } } as never,
        graphQLContext as never,
        {} as never,
      ),
    ).rejects.toMatchObject({ extensions: { code: "BAD_REQUEST" } });
    expect(mocks.createFlowDefinition).not.toHaveBeenCalled();
  });
});

describe("updateFlowDefinitionResolver", () => {
  it("refuses an update made from an edition that is no longer current", async () => {
    await expect(update(validDefinition, "edition-0")).rejects.toMatchObject({
      extensions: { code: "CONFLICT" },
    });
    expect(mocks.updateFlowDefinition).not.toHaveBeenCalled();
  });

  it("saves a flow that isn't valid when nothing runs it on a schedule", async () => {
    await expect(update(unfinishedDefinition)).resolves.toMatchObject({
      editionId: "edition-2",
      isRunnable: false,
    });
  });

  const questionValue = {
    inputName: "question",
    payload: { kind: "Text", value: "Why?" },
  };

  it.each([
    ["the flow wouldn't be valid", unfinishedDefinition, [questionValue]],
    [
      'its value for input "topic": A Number value cannot feed an input that accepts Text',
      {
        ...validDefinition,
        inputs: [question, { ...question, name: "topic", required: false }],
      },
      [
        questionValue,
        { inputName: "topic", payload: { kind: "Number", value: 1 } },
      ],
    ],
    [
      'it gives no value for the required input "topic"',
      {
        ...validDefinition,
        inputs: [question, { ...question, name: "topic" }],
      },
      [questionValue],
    ],
    [
      'it gives a value for "topic", which isn\'t an input',
      validDefinition,
      [
        questionValue,
        { inputName: "topic", payload: { kind: "Text", value: "AI" } },
      ],
    ],
  ])(
    "refuses a change to a flow with an active schedule when %s",
    async (problem, definition, scheduleInputs) => {
      mocks.getActiveFlowSchedulesOfFlowDefinition.mockResolvedValue([
        activeSchedule(scheduleInputs),
      ]);

      await expect(update(definition)).rejects.toMatchObject({
        message: expect.stringContaining(`- schedule "Nightly": ${problem}`),
        extensions: { code: "BAD_REQUEST" },
      });
      expect(mocks.updateFlowDefinition).not.toHaveBeenCalled();
    },
  );

  it("saves a change to a flow with an active schedule that still fills its inputs", async () => {
    mocks.getActiveFlowSchedulesOfFlowDefinition.mockResolvedValue([
      activeSchedule([questionValue]),
    ]);

    await expect(
      update({
        ...validDefinition,
        inputs: [question, { ...question, name: "topic", required: false }],
      }),
    ).resolves.toMatchObject({ isRunnable: true });
  });
});

describe("archiveFlowDefinitionResolver", () => {
  it("pauses the flow's active schedules before archiving it", async () => {
    const schedule = activeSchedule([]);
    mocks.getActiveFlowSchedulesOfFlowDefinition.mockResolvedValue([schedule]);

    await archiveFlowDefinitionResolver(
      {},
      { flowDefinitionEntityId } as never,
      graphQLContext as never,
      {} as never,
    );

    expect(mocks.pauseActiveFlowSchedule).toHaveBeenCalledWith(
      graphQLContext,
      expect.objectContaining({ schedule }),
    );
    expect(mocks.archive).toHaveBeenCalledOnce();
    expect(
      mocks.pauseActiveFlowSchedule.mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.archive.mock.invocationCallOrder[0]!);
  });
});
