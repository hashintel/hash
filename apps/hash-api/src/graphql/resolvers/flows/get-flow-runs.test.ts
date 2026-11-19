import { beforeEach, describe, expect, it, vi } from "vitest";

import { FlowRunStatus } from "@local/hash-isomorphic-utils/graphql/api-types.gen";

import { getFlowRunsResolver } from "./get-flow-runs";

import type { FlowRunParent } from "./shared/get-record-of-flow-run";
import type { EntityId } from "@blockprotocol/type-system";
import type { FlowRunRecordHeader } from "@local/hash-isomorphic-utils/flows/run-record";

const mocks = vi.hoisted(() => ({
  getFlowRuns: vi.fn(),
  getFlowRunEntityById: vi.fn(),
  getEndedFlowRunRecordHeader: vi.fn(),
  getFlowRunRecord: vi.fn(),
  correctFlowRunStatusFromRecord: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("@local/hash-backend-utils/flows", () => ({
  getFlowRuns: mocks.getFlowRuns,
  getFlowRunEntityById: mocks.getFlowRunEntityById,
}));

vi.mock("@local/hash-backend-utils/flows/run-record", () => ({
  getEndedFlowRunRecordHeader: mocks.getEndedFlowRunRecordHeader,
  getFlowRunRecord: mocks.getFlowRunRecord,
}));

vi.mock("@local/hash-backend-utils/flows/shared/save-flow-run-status", () => ({
  correctFlowRunStatusFromRecord: mocks.correctFlowRunStatusFromRecord,
}));

const workflowIdProperty =
  "https://hash.ai/@h/types/property-type/workflow-id/";

const flowRun = (
  id: string,
  overrides: Partial<FlowRunParent> = {},
): FlowRunParent =>
  ({
    flowRunEntityId: `web~${id}` as EntityId,
    status: FlowRunStatus.Running,
    startedAt: "2026-11-17T10:00:00.000Z",
    closedAt: null,
    updatedAt: "2026-11-17T10:00:01.000Z",
    openInputRequests: [],
    ...overrides,
  }) as FlowRunParent;

/** The entity of the run `web~<id>`, whose workflow is `workflow-<id>`. */
const flowRunEntity = (flowRunEntityId: string) => ({
  properties: {
    [workflowIdProperty]: flowRunEntityId.replace("web~", "workflow-"),
  },
});

/** Ended runs' record headers by workflow id: a run without one is still running. */
const givenEndedRuns = (
  headers: Record<string, Partial<FlowRunRecordHeader>>,
) =>
  mocks.getEndedFlowRunRecordHeader.mockImplementation(
    ({ workflowId }: { workflowId: string }) =>
      Promise.resolve(headers[workflowId] ?? null),
  );

describe("getFlowRunsResolver", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) {
      mock.mockReset();
    }
    mocks.getFlowRunEntityById.mockImplementation(
      ({ flowRunEntityId }: { flowRunEntityId: string }) =>
        Promise.resolve(flowRunEntity(flowRunEntityId)),
    );
  });

  const resolve = async (args = {}) =>
    (await getFlowRunsResolver(
      {},
      args,
      {
        authentication: { actorId: "user" },
        dataSources: { graphApi: {}, uploadProvider: {} },
        logger: { warn: mocks.warn },
        temporal: {},
      } as never,
      {} as never,
    )) as { flowRuns: FlowRunParent[]; totalCount: number };

  it("keeps a run that's still running as its entity has it, without reading its history", async () => {
    const going = flowRun("going");
    mocks.getFlowRuns.mockResolvedValue({
      flowRuns: [going],
      totalCount: 1,
      nextCursor: null,
    });
    givenEndedRuns({});

    const { flowRuns } = await resolve();

    expect(flowRuns).toStrictEqual([going]);
    expect(mocks.getEndedFlowRunRecordHeader).toHaveBeenCalledWith(
      expect.objectContaining({ workflowId: "workflow-going" }),
    );
    expect(mocks.getFlowRunRecord).not.toHaveBeenCalled();
    expect(mocks.correctFlowRunStatusFromRecord).not.toHaveBeenCalled();
  });

  it("gives a run that ended without saving how the status and end time its record's header has, and corrects its entity", async () => {
    const header = {
      status: FlowRunStatus.Failed,
      closedAt: "2026-11-17T10:02:00.000Z",
    };
    mocks.getFlowRuns.mockResolvedValue({
      flowRuns: [flowRun("stuck")],
      totalCount: 1,
      nextCursor: null,
    });
    givenEndedRuns({ "workflow-stuck": header });

    const { flowRuns } = await resolve();

    expect(flowRuns).toStrictEqual([flowRun("stuck", header)]);
    expect(
      mocks.correctFlowRunStatusFromRecord,
    ).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        flowRunEntity: flowRunEntity("web~stuck"),
        header,
      }),
    );
    expect(mocks.getFlowRunRecord).not.toHaveBeenCalled();
  });

  it("reads nothing about a run its entity says has ended", async () => {
    const ended = flowRun("ended", {
      status: FlowRunStatus.Completed,
      closedAt: "2026-11-17T10:01:00.000Z",
    });
    mocks.getFlowRuns.mockResolvedValue({
      flowRuns: [ended],
      totalCount: 1,
      nextCursor: null,
    });

    const { flowRuns } = await resolve();

    expect(flowRuns).toStrictEqual([ended]);
    expect(mocks.getFlowRunEntityById).not.toHaveBeenCalled();
    expect(mocks.getEndedFlowRunRecordHeader).not.toHaveBeenCalled();
  });

  it("leaves out and stops counting a run that ended when asked for running runs only", async () => {
    mocks.getFlowRuns.mockResolvedValue({
      flowRuns: [flowRun("stuck"), flowRun("going")],
      totalCount: 5,
      nextCursor: "after-going",
    });
    givenEndedRuns({
      "workflow-stuck": { status: FlowRunStatus.Terminated },
    });

    const { flowRuns, totalCount } = await resolve({
      executionStatus: FlowRunStatus.Running,
    });

    expect(flowRuns.map(({ flowRunEntityId }) => flowRunEntityId)).toEqual([
      "web~going",
    ]);
    expect(totalCount).toBe(4);
  });

  it("keeps a running run as its entity has it, and warns, when its record's header can't be read", async () => {
    const unreadable = flowRun("unreadable");
    mocks.getFlowRuns.mockResolvedValue({
      flowRuns: [unreadable],
      totalCount: 1,
      nextCursor: null,
    });
    mocks.getEndedFlowRunRecordHeader.mockRejectedValue(
      new Error("Temporal is down"),
    );

    const { flowRuns } = await resolve();

    expect(flowRuns).toStrictEqual([unreadable]);
    expect(mocks.warn).toHaveBeenCalledOnce();
    expect(mocks.correctFlowRunStatusFromRecord).not.toHaveBeenCalled();
  });
});
