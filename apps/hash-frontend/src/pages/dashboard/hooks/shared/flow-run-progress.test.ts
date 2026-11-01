import { describe, expect, it, vi } from "vitest";

import { FlowRunStatus } from "../../../../graphql/api-types.gen";
import { queryFlowRunProgress } from "./flow-run-progress";

import type {
  GetFlowRunProgressQuery,
  GetFlowRunProgressQueryVariables,
} from "../../../../graphql/api-types.gen";
import type { ApolloClient } from "@apollo/client";
import type { EntityId } from "@blockprotocol/type-system";
import type { FlowRunEvent } from "@local/hash-isomorphic-utils/flows/run-events";

const runStarted = (occurredAt: string): FlowRunEvent => ({
  kind: "runStarted",
  position: `${occurredAt}.0`,
  occurredAt,
  flowInputs: {},
});

const runFinished = (occurredAt: string): FlowRunEvent => ({
  kind: "runFinished",
  position: `${occurredAt}.0`,
  occurredAt,
  status: FlowRunStatus.Completed,
  flowOutputs: [],
});

const page = (
  status: FlowRunStatus,
  events: FlowRunEvent[],
  { hasNextPage = false, restarted = false } = {},
): GetFlowRunProgressQuery => ({
  getFlowRunById: {
    __typename: "FlowRun",
    status,
    outputs: null,
    failure: null,
    events: {
      __typename: "FlowRunEventsPage",
      events,
      endCursor: "cursor",
      hasNextPage,
      restarted,
    },
  },
});

describe("queryFlowRunProgress", () => {
  it("reads a run again from the start when it was reset between pages", async () => {
    const pages = [
      page(FlowRunStatus.Running, [runStarted("1")], { hasNextPage: true }),
      page(FlowRunStatus.Running, [runStarted("2")], { restarted: true }),
      page(FlowRunStatus.Completed, [runStarted("2"), runFinished("3")]),
    ];
    const query = vi.fn(
      (_options: { variables: GetFlowRunProgressQueryVariables }) =>
        Promise.resolve({ data: pages.shift() }),
    );

    const progress = await queryFlowRunProgress(
      { query } as unknown as ApolloClient<unknown>,
      "web~run" as EntityId,
    );

    expect(query.mock.calls.map(([{ variables }]) => variables.after)).toEqual([
      null,
      "cursor",
      null,
    ]);
    expect(progress.status).toBe(FlowRunStatus.Completed);
    expect(progress.events.map(({ kind }) => kind)).toEqual([
      "runStarted",
      "runFinished",
    ]);
  });
});
