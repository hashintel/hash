/* The CommonJS build, which `graphql-parse-resolve-info` uses: its checks reject a schema from the ESM build. */
import { buildASTSchema, concatAST, graphql } from "graphql/index.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FlowRunStatus } from "@local/hash-isomorphic-utils/graphql/api-types.gen";
import { schema as typeDefs } from "@local/hash-isomorphic-utils/graphql/type-defs/schema";

import { flowRunOpenInputRequestsResolver } from "./flow-run-open-input-requests";

import type { DistributiveOmit } from "@local/advanced-types/distribute";
import type { FlowRunEvent } from "@local/hash-isomorphic-utils/flows/run-events";
import type { FlowRunRecord } from "@local/hash-isomorphic-utils/flows/run-record";
import type { GraphQLObjectType } from "graphql/index.js";

const mocks = vi.hoisted(() => ({
  getFlowRunEntityById: vi.fn(),
  getFlowRunRecord: vi.fn(),
  flowRun: {} as Record<string, unknown>,
}));

vi.mock("@local/hash-backend-utils/flows", () => ({
  getFlowRunEntityById: mocks.getFlowRunEntityById,
}));

vi.mock("@local/hash-backend-utils/flows/run-record", () => ({
  getFlowRunRecord: mocks.getFlowRunRecord,
}));

const schema = buildASTSchema(concatAST(typeDefs));
schema.getQueryType()!.getFields().getFlowRunById!.resolve = () =>
  mocks.flowRun;

(
  schema.getType("FlowRun") as GraphQLObjectType
).getFields().openInputRequests!.resolve =
  flowRunOpenInputRequestsResolver as never;

const openInputRequestsQuery = () =>
  graphql({
    schema,
    source: `query {
      getFlowRunById(flowRunEntityId: "web~run") {
        openInputRequests
      }
    }`,
    contextValue: {
      authentication: {},
      dataSources: { uploadProvider: {} },
      flowRunRecords: new Map(),
      temporal: {},
    },
  });

const recordWith = (
  status: FlowRunStatus,
  events: DistributiveOmit<FlowRunEvent, "position">[],
): FlowRunRecord => ({
  header: {
    workflowId: "workflow-1",
    runId: "run-1",
    status,
    startedAt: "2026-10-26T10:00:00.000Z",
  },
  events: events.map((event, index) => ({
    ...event,
    position: `${index + 1}.0`,
  })) as FlowRunEvent[],
});

const stepRun = { stepId: "1", itemPath: [] };

describe("a flow run's open input requests", () => {
  beforeEach(() => {
    mocks.getFlowRunEntityById.mockReset();
    mocks.getFlowRunRecord.mockReset();
    mocks.getFlowRunEntityById.mockResolvedValue({
      properties: {
        "https://hash.ai/@h/types/property-type/workflow-id/": "workflow-1",
      },
    });
  });

  it("gives a running run's requests that haven't been answered", async () => {
    mocks.flowRun = {
      flowRunEntityId: "web~run",
      status: FlowRunStatus.Running,
      startedAt: "2026-10-26T10:00:00.000Z",
    };
    mocks.getFlowRunRecord.mockResolvedValue(
      recordWith(FlowRunStatus.Running, [
        {
          kind: "runStarted",
          occurredAt: "2026-10-26T10:00:00.000Z",
          flowInputs: {},
        },
        {
          kind: "inputRequested",
          occurredAt: "2026-10-26T10:01:00.000Z",
          stepRun,
          request: {
            requestId: "answered",
            stepId: "1",
            type: "human-input",
            data: { questions: ["Which one?"] },
          },
        },
        {
          kind: "inputResolved",
          occurredAt: "2026-10-26T10:02:00.000Z",
          requestStepRun: stepRun,
          requestId: "answered",
          response: {
            requestId: "answered",
            type: "human-input",
            data: { answers: ["This one"] },
          },
        },
        {
          kind: "inputRequested",
          occurredAt: "2026-10-26T10:03:00.000Z",
          stepRun,
          request: {
            requestId: "open",
            stepId: "1",
            type: "human-input",
            data: { questions: ["And this?"] },
          },
        },
      ]),
    );

    const result = await openInputRequestsQuery();

    expect(result.errors).toBeUndefined();
    expect(result.data?.getFlowRunById).toEqual({
      openInputRequests: [
        {
          requestId: "open",
          stepId: "1",
          type: "human-input",
          data: { questions: ["And this?"] },
          raisedAt: "2026-10-26T10:03:00.000Z",
        },
      ],
    });
  });

  it("doesn't read the record of a run that isn't running", async () => {
    mocks.flowRun = {
      flowRunEntityId: "web~run",
      status: FlowRunStatus.Completed,
      startedAt: "2026-10-26T10:00:00.000Z",
      closedAt: "2026-10-26T10:05:00.000Z",
    };

    const result = await openInputRequestsQuery();

    expect(result.errors).toBeUndefined();
    expect(result.data?.getFlowRunById).toEqual({ openInputRequests: [] });
    expect(mocks.getFlowRunRecord).not.toHaveBeenCalled();
  });
});
