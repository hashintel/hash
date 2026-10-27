import { getOpenInputRequests } from "@local/hash-isomorphic-utils/flows/run-events";

import { FlowRunStatus } from "../../api-types.gen";
import { getRecordOfFlowRun } from "./shared/get-record-of-flow-run";

import type { FlowRun, ResolverFn } from "../../api-types.gen";
import type { GraphQLContext } from "../../context";
import type {
  ExternalInputRequest,
  SparseFlowRun,
} from "@local/hash-isomorphic-utils/flows/types";

/** A run that isn't running has no open requests, so only a running run has its record read. */
export const flowRunOpenInputRequestsResolver: ResolverFn<
  ExternalInputRequest[],
  FlowRun | SparseFlowRun,
  Pick<
    GraphQLContext,
    "authentication" | "dataSources" | "flowRunRecords" | "temporal"
  >,
  Record<string, never>
> = async (flowRun, _args, context) => {
  if (flowRun.status !== FlowRunStatus.Running) {
    return [];
  }

  const { events } = await getRecordOfFlowRun(flowRun, context);

  return getOpenInputRequests(events);
};
