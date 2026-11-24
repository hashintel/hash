/* The CommonJS build, which `graphql-parse-resolve-info` uses: its checks reject a schema from the ESM build. */
import { buildASTSchema, concatAST, graphql } from "graphql/index.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getFlowOutputStorageKey } from "@local/hash-backend-utils/file-storage";
import { FlowRunStatus } from "@local/hash-isomorphic-utils/graphql/api-types.gen";
import { schema as typeDefs } from "@local/hash-isomorphic-utils/graphql/type-defs/schema";

import {
  flowRunFailureResolver,
  flowRunOutputsResolver,
  flowRunStepErrorsResolver,
} from "./flow-run-ending";

import type { FlowRunEvent } from "@local/hash-isomorphic-utils/flows/run-events";
import type { FlowRunRecord } from "@local/hash-isomorphic-utils/flows/run-record";
import type { GraphQLObjectType } from "graphql/index.js";

const mocks = vi.hoisted(() => {
  const flowRun: Record<string, unknown> = {};

  return {
    getFlowRunEntityById: vi.fn(),
    getFlowRunRecord: vi.fn(),
    flowRun,
  };
});

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
flowRunFields.outputs!.resolve = flowRunOutputsResolver as never;
flowRunFields.failure!.resolve = flowRunFailureResolver as never;
flowRunFields.stepErrors!.resolve = flowRunStepErrorsResolver as never;

const workflowId = "workflow-1";

const storedEntitiesKey = getFlowOutputStorageKey({
  workflowId,
  runId: "run-1",
  stepId: "3",
  outputName: "persistedEntities",
});

const storedObjects: Record<string, unknown> = {
  [storedEntitiesKey]: [{ entityId: "web~entity" }],
};

const runEndingQuery = () =>
  graphql({
    schema,
    source: `query {
      getFlowRunById(flowRunEntityId: "web~run") {
        outputs { outputName payload }
        failure { message }
        stepErrors { stepRun { stepId itemPath } error { message } }
      }
    }`,
    contextValue: {
      authentication: {},
      dataSources: {
        uploadProvider: {
          downloadDirect: ({ key }: { key: string }) =>
            Promise.resolve(Buffer.from(JSON.stringify(storedObjects[key]))),
        },
      },
      flowRunRecords: new Map(),
      temporal: {},
    },
  });

const recordEndingWith = (
  runFinished: Omit<
    Extract<FlowRunEvent, { kind: "runFinished" }>,
    "kind" | "position" | "occurredAt"
  >,
): FlowRunRecord => ({
  header: {
    workflowId,
    runId: "run-1",
    status: runFinished.status,
    startedAt: "2026-10-26T10:00:00.000Z",
    closedAt: "2026-10-26T10:05:00.000Z",
  },
  events: [
    {
      kind: "runFinished",
      position: "20.0",
      occurredAt: "2026-10-26T10:05:00.000Z",
      ...runFinished,
    },
  ],
});

describe("how a flow run ended", () => {
  beforeEach(() => {
    mocks.getFlowRunEntityById.mockReset();
    mocks.getFlowRunRecord.mockReset();
    mocks.getFlowRunEntityById.mockResolvedValue({
      properties: {
        "https://hash.ai/@h/types/property-type/workflow-id/": workflowId,
      },
    });
  });

  it("gives a completed run's outputs with stored payloads resolved, and its step errors", async () => {
    mocks.flowRun = {
      flowRunEntityId: "web~run",
      status: FlowRunStatus.Completed,
    };
    mocks.getFlowRunRecord.mockResolvedValue(
      recordEndingWith({
        status: FlowRunStatus.Completed,
        flowOutputs: [
          {
            outputName: "answer",
            payload: { kind: "Text", value: "42" },
          },
          {
            outputName: "persistedEntities",
            payload: {
              kind: "PersistedEntityMetadata",
              value: {
                __stored: true,
                kind: "PersistedEntityMetadata",
                storageKey: storedEntitiesKey,
                array: true,
                length: 1,
              },
            },
          },
        ],
        stepErrors: [
          {
            stepRun: { stepId: "2", itemPath: [1] },
            error: { message: "Output of the wrong kind" },
          },
        ],
      }),
    );

    const result = await runEndingQuery();

    expect(result.errors).toBeUndefined();
    expect(result.data?.getFlowRunById).toEqual({
      outputs: [
        { outputName: "answer", payload: { kind: "Text", value: "42" } },
        {
          outputName: "persistedEntities",
          payload: {
            kind: "PersistedEntityMetadata",
            value: [{ entityId: "web~entity" }],
          },
        },
      ],
      failure: null,
      stepErrors: [
        {
          stepRun: { stepId: "2", itemPath: [1] },
          error: { message: "Output of the wrong kind" },
        },
      ],
    });
  });

  it("doesn't read the record of a run that is still running", async () => {
    mocks.flowRun = {
      flowRunEntityId: "web~run",
      status: FlowRunStatus.Running,
    };

    const result = await runEndingQuery();

    expect(result.errors).toBeUndefined();
    expect(result.data?.getFlowRunById).toEqual({
      outputs: null,
      failure: null,
      stepErrors: null,
    });
    expect(mocks.getFlowRunRecord).not.toHaveBeenCalled();
  });
});
