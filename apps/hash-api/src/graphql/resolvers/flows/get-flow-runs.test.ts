import { beforeEach, describe, expect, it, vi } from "vitest";

import { FlowRunStatus } from "@local/hash-isomorphic-utils/graphql/api-types.gen";

import { getFlowRunsResolver } from "./get-flow-runs";

import type { FlowRunParent } from "./shared/get-record-of-flow-run";
import type { EntityId } from "@blockprotocol/type-system";

const mocks = vi.hoisted(() => ({
  getFlowRuns: vi.fn(),
  getRecordOfFlowRun: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("@local/hash-backend-utils/flows", () => ({
  getFlowRuns: mocks.getFlowRuns,
}));

vi.mock("./shared/get-record-of-flow-run", () => ({
  getRecordOfFlowRun: mocks.getRecordOfFlowRun,
}));

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

describe("getFlowRunsResolver", () => {
  beforeEach(() => {
    mocks.getFlowRuns.mockReset();
    mocks.getRecordOfFlowRun.mockReset();
    mocks.warn.mockReset();
  });

  const resolve = async () =>
    (await getFlowRunsResolver(
      {},
      {},
      {
        authentication: { actorId: "user" },
        dataSources: { graphApi: {} },
        logger: { warn: mocks.warn },
      } as never,
      {} as never,
    )) as { flowRuns: FlowRunParent[] };

  it("gives a run its entity says is running the status its record has, and reads no ended run's record", async () => {
    const ended = flowRun("ended", {
      status: FlowRunStatus.Completed,
      closedAt: "2026-11-17T10:01:00.000Z",
    });
    mocks.getFlowRuns.mockResolvedValue({
      flowRuns: [flowRun("stuck"), flowRun("going"), ended],
      totalCount: 3,
      nextCursor: null,
    });
    mocks.getRecordOfFlowRun.mockImplementation((run: FlowRunParent) =>
      Promise.resolve({
        header:
          run.flowRunEntityId === "web~stuck"
            ? {
                status: FlowRunStatus.Failed,
                closedAt: "2026-11-17T10:02:00.000Z",
              }
            : { status: FlowRunStatus.Running },
      }),
    );

    const { flowRuns } = await resolve();

    expect(
      flowRuns.map(({ flowRunEntityId, status, closedAt }) => [
        flowRunEntityId,
        status,
        closedAt,
      ]),
    ).toEqual([
      ["web~stuck", FlowRunStatus.Failed, "2026-11-17T10:02:00.000Z"],
      ["web~going", FlowRunStatus.Running, null],
      ["web~ended", FlowRunStatus.Completed, "2026-11-17T10:01:00.000Z"],
    ]);
    expect(mocks.getRecordOfFlowRun).toHaveBeenCalledTimes(2);
  });

  it("keeps a running run as its entity has it when its record can't be read", async () => {
    mocks.getFlowRuns.mockResolvedValue({
      flowRuns: [flowRun("unreadable")],
      totalCount: 1,
      nextCursor: null,
    });
    mocks.getRecordOfFlowRun.mockRejectedValue(new Error("Temporal is down"));

    const { flowRuns } = await resolve();

    expect(flowRuns[0]?.status).toBe(FlowRunStatus.Running);
    expect(mocks.warn).toHaveBeenCalledOnce();
  });
});
