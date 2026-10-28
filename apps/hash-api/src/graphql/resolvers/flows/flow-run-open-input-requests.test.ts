import { describe, expect, it } from "vitest";

import { FlowRunStatus } from "@local/hash-isomorphic-utils/graphql/api-types.gen";

import { flowRunOpenInputRequestsResolver } from "./flow-run-open-input-requests";

import type { FlowRunWithoutEvents } from "@local/hash-isomorphic-utils/flows/types";

const savedRequest = {
  requestId: "open",
  stepId: "1",
  type: "human-input" as const,
  data: { questions: ["And this?"] },
  raisedAt: "2026-10-26T10:03:00.000Z",
};

const openInputRequestsOf = (flowRun: Partial<FlowRunWithoutEvents>) =>
  flowRunOpenInputRequestsResolver(
    {
      openInputRequests: [savedRequest],
      ...flowRun,
    } as FlowRunWithoutEvents,
    {},
    {} as never,
    {} as never,
  );

describe("a flow run's open input requests", () => {
  it("gives the requests saved on a running run's entity", () => {
    expect(openInputRequestsOf({ status: FlowRunStatus.Running })).toEqual([
      savedRequest,
    ]);
  });

  it("gives none for a run that isn't running", () => {
    expect(openInputRequestsOf({ status: FlowRunStatus.Completed })).toEqual(
      [],
    );
  });
});
