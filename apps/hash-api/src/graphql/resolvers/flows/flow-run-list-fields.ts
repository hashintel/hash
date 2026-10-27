import {
  getAnsweredPageContentRequests,
  getOpenInputRequests,
} from "@local/hash-isomorphic-utils/flows/run-events";

import { FlowRunStatus } from "../../api-types.gen";
import { getRecordOfFlowRun } from "./shared/get-record-of-flow-run";

import type {
  FlowRun,
  FlowRunPageContentRequest,
  ResolverFn,
} from "../../api-types.gen";
import type { GraphQLContext } from "../../context";
import type {
  ExternalInputRequest,
  SparseFlowRun,
} from "@local/hash-isomorphic-utils/flows/types";

type FlowRunListFieldResolver<Result> = ResolverFn<
  Result,
  FlowRun | SparseFlowRun,
  Pick<
    GraphQLContext,
    "authentication" | "dataSources" | "flowRunRecords" | "temporal"
  >,
  Record<string, never>
>;

/** A closed run's last activity is its closing, so only a run that hasn't closed has its record read. */
export const flowRunLastActivityAtResolver: FlowRunListFieldResolver<
  string
> = async (flowRun, _args, context) => {
  if (flowRun.closedAt) {
    return flowRun.closedAt;
  }

  const { events } = await getRecordOfFlowRun(flowRun, context);

  return events.at(-1)?.occurredAt ?? flowRun.executedAt ?? flowRun.startedAt;
};

/** A run that isn't running has no open requests, so only a running run has its record read. */
export const flowRunOpenInputRequestsResolver: FlowRunListFieldResolver<
  ExternalInputRequest[]
> = async (flowRun, _args, context) => {
  if (flowRun.status !== FlowRunStatus.Running) {
    return [];
  }

  const { events } = await getRecordOfFlowRun(flowRun, context);

  return getOpenInputRequests(events);
};

export const flowRunAnsweredPageContentRequestsResolver: FlowRunListFieldResolver<
  FlowRunPageContentRequest[]
> = async (flowRun, _args, context) => {
  const { events } = await getRecordOfFlowRun(flowRun, context);

  return getAnsweredPageContentRequests(events);
};
