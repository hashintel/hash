import { getOpenInputRequests } from "@local/hash-isomorphic-utils/flows/run-events";
import { FlowRunStatus } from "@local/hash-isomorphic-utils/graphql/api-types.gen";

import { getRecordOfFlowRun } from "./shared/get-record-of-flow-run";

import type { ResolverFn } from "../../api-types.gen";
import type { GraphQLContext } from "../../context";
import type {
  ExternalInputRequest,
  FlowRunWithoutEvents,
  SparseFlowRun,
} from "@local/hash-isomorphic-utils/flows/types";

/**
 * A run that isn't running has no open requests. A running run's are saved on its entity, or read from its record
 * if it started before they were saved.
 */
export const flowRunOpenInputRequestsResolver: ResolverFn<
  ExternalInputRequest[],
  FlowRunWithoutEvents | SparseFlowRun,
  Pick<
    GraphQLContext,
    "authentication" | "dataSources" | "flowRunRecords" | "temporal"
  >,
  Record<string, never>
> = async (flowRun, _args, context) => {
  if (flowRun.status !== FlowRunStatus.Running) {
    return [];
  }

  if (flowRun.openInputRequests) {
    return flowRun.openInputRequests;
  }

  const { events } = await getRecordOfFlowRun(flowRun, context);

  return getOpenInputRequests(events);
};
