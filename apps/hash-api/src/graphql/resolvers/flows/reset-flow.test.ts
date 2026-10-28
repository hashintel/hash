import { beforeEach, describe, expect, it, vi } from "vitest";

import { FlowRunStatus } from "@local/hash-isomorphic-utils/graphql/api-types.gen";

import { resetFlow } from "./reset-flow";

import type { EntityId } from "@blockprotocol/type-system";
import type { FlowRunRecord } from "@local/hash-isomorphic-utils/flows/run-record";

const mocks = vi.hoisted(() => ({
  calls: [] as string[],
  correctFlowRunStatusFromRecord: vi.fn(),
  getFlowRunRecord: vi.fn(),
  saveOpenInputRequests: vi.fn(),
}));

vi.mock("@local/hash-backend-utils/flows", () => ({
  getFlowRunEntityById: () =>
    Promise.resolve({
      entityId: "web~run",
      properties: {
        "https://hash.ai/@h/types/property-type/workflow-id/": "workflow-1",
      },
    }),
}));

vi.mock("@local/hash-backend-utils/flows/run-record", () => ({
  getFlowRunRecord: mocks.getFlowRunRecord,
}));

vi.mock("@local/hash-backend-utils/flows/shared/save-flow-run-status", () => ({
  correctFlowRunStatusFromRecord: mocks.correctFlowRunStatusFromRecord,
}));

vi.mock(
  "@local/hash-backend-utils/flows/shared/save-open-input-requests",
  () => ({
    saveOpenInputRequests: mocks.saveOpenInputRequests,
  }),
);

vi.mock("../../../graph/knowledge/primitive/entity", () => ({
  checkEntityPermission: () => Promise.resolve(true),
}));

const stepRun = { stepId: "1", itemPath: [] };

const humanInputRequest = (requestId: string) => ({
  requestId,
  stepId: "1",
  type: "human-input" as const,
  data: { questions: [`${requestId}?`] },
});

/* The run as the reset left it: one request answered before the reset point, one still open. */
const recordAfterReset = {
  header: {
    workflowId: "workflow-1",
    runId: "run-2",
    status: FlowRunStatus.Running,
    startedAt: "2026-10-26T10:00:00.000Z",
  },
  events: [
    {
      kind: "inputRequested",
      position: "1.0",
      occurredAt: "2026-10-26T10:01:00.000Z",
      stepRun,
      request: humanInputRequest("answered"),
    },
    {
      kind: "inputResolved",
      position: "2.0",
      occurredAt: "2026-10-26T10:02:00.000Z",
      requestStepRun: stepRun,
      requestId: "answered",
      response: {
        requestId: "answered",
        type: "human-input",
        data: { answers: ["Yes"] },
      },
    },
    {
      kind: "inputRequested",
      position: "3.0",
      occurredAt: "2026-10-26T10:03:00.000Z",
      stepRun,
      request: humanInputRequest("open"),
    },
  ],
} as FlowRunRecord;

describe("resetFlow", () => {
  beforeEach(() => {
    mocks.calls = [];
    mocks.getFlowRunRecord.mockImplementation(() => {
      mocks.calls.push("read record");
      return Promise.resolve(recordAfterReset);
    });
    mocks.correctFlowRunStatusFromRecord.mockReset();
    mocks.saveOpenInputRequests.mockReset();
  });

  const reset = () =>
    resetFlow(
      {},
      {
        flowRunEntityId: "web~run" as EntityId,
        checkpointId: "checkpoint",
        eventId: 10,
      },
      {
        authentication: { actorId: "user" },
        dataSources: { graphApi: {}, uploadProvider: {} },
        provenance: {},
        temporal: {
          workflowService: {
            resetWorkflowExecution: () => {
              mocks.calls.push("reset");
              return Promise.resolve({});
            },
          },
        },
      } as never,
      {} as never,
    );

  it("saves the input requests open once the run is reset on its entity", async () => {
    await reset();

    expect(mocks.calls).toEqual(["reset", "read record"]);
    expect(mocks.saveOpenInputRequests).toHaveBeenCalledWith(
      expect.objectContaining({
        temporalWorkflowId: "workflow-1",
        openInputRequests: [
          {
            ...humanInputRequest("open"),
            raisedAt: "2026-10-26T10:03:00.000Z",
          },
        ],
      }),
    );
  });

  it("corrects the run's status from its record after the reset", async () => {
    await reset();

    expect(mocks.correctFlowRunStatusFromRecord).toHaveBeenCalledWith(
      expect.objectContaining({ header: recordAfterReset.header }),
    );
  });

  it("saves nothing when no request is open or saved", async () => {
    mocks.getFlowRunRecord.mockResolvedValue({
      ...recordAfterReset,
      events: recordAfterReset.events.slice(0, 2),
    });

    await reset();

    expect(mocks.saveOpenInputRequests).not.toHaveBeenCalled();
  });
});
