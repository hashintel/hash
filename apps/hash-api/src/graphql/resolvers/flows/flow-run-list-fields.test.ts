/* The CommonJS build, which `graphql-parse-resolve-info` uses: its checks reject a schema from the ESM build. */
import { buildASTSchema, concatAST, graphql } from "graphql/index.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FlowRunStatus } from "@local/hash-isomorphic-utils/graphql/api-types.gen";
import { schema as typeDefs } from "@local/hash-isomorphic-utils/graphql/type-defs/schema";

import {
  flowRunAnsweredPageContentRequestsResolver,
  flowRunLastActivityAtResolver,
  flowRunOpenInputRequestsResolver,
} from "./flow-run-list-fields";

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

const flowRunFields = (
  schema.getType("FlowRun") as GraphQLObjectType
).getFields();
flowRunFields.lastActivityAt!.resolve = flowRunLastActivityAtResolver as never;
flowRunFields.openInputRequests!.resolve =
  flowRunOpenInputRequestsResolver as never;
flowRunFields.answeredPageContentRequests!.resolve =
  flowRunAnsweredPageContentRequestsResolver as never;

const listFieldsQuery = () =>
  graphql({
    schema,
    source: `query {
      getFlowRunById(flowRunEntityId: "web~run") {
        lastActivityAt
        openInputRequests
        answeredPageContentRequests { requestId urls resolvedBy resolvedAt }
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

describe("the fields a list of flow runs shows", () => {
  beforeEach(() => {
    mocks.getFlowRunEntityById.mockReset();
    mocks.getFlowRunRecord.mockReset();
    mocks.getFlowRunEntityById.mockResolvedValue({
      properties: {
        "https://hash.ai/@h/types/property-type/workflow-id/": "workflow-1",
      },
    });
  });

  it("gives a running run's latest event, open requests, and answered page content requests", async () => {
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
            requestId: "pages",
            stepId: "1",
            type: "get-urls-html-content",
            data: { urls: ["https://example.com"] },
          },
        },
        {
          kind: "inputResolved",
          occurredAt: "2026-10-26T10:02:00.000Z",
          requestStepRun: stepRun,
          requestId: "pages",
          response: {
            requestId: "pages",
            type: "get-urls-html-content",
            data: { webPages: [] },
            resolvedBy: "user-1" as never,
          },
        },
        {
          kind: "inputRequested",
          occurredAt: "2026-10-26T10:03:00.000Z",
          stepRun,
          request: {
            requestId: "question",
            stepId: "1",
            type: "human-input",
            data: { questions: ["Which one?"] },
          },
        },
      ]),
    );

    const result = await listFieldsQuery();

    expect(result.errors).toBeUndefined();
    expect(result.data?.getFlowRunById).toEqual({
      lastActivityAt: "2026-10-26T10:03:00.000Z",
      openInputRequests: [
        {
          requestId: "question",
          stepId: "1",
          type: "human-input",
          data: { questions: ["Which one?"] },
          raisedAt: "2026-10-26T10:03:00.000Z",
        },
      ],
      answeredPageContentRequests: [
        {
          requestId: "pages",
          urls: ["https://example.com"],
          resolvedBy: "user-1",
          resolvedAt: "2026-10-26T10:02:00.000Z",
        },
      ],
    });
  });

  it("doesn't read a closed run's record for when it was last active or its open requests", async () => {
    mocks.flowRun = {
      flowRunEntityId: "web~run",
      status: FlowRunStatus.Completed,
      startedAt: "2026-10-26T10:00:00.000Z",
      closedAt: "2026-10-26T10:05:00.000Z",
    };

    const result = await graphql({
      schema,
      source: `query {
        getFlowRunById(flowRunEntityId: "web~run") {
          lastActivityAt
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

    expect(result.errors).toBeUndefined();
    expect(result.data?.getFlowRunById).toEqual({
      lastActivityAt: "2026-10-26T10:05:00.000Z",
      openInputRequests: [],
    });
    expect(mocks.getFlowRunRecord).not.toHaveBeenCalled();
  });
});
