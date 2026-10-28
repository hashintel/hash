import { FlowRunStatus } from "@local/hash-isomorphic-utils/graphql/api-types.gen";

import type { ResolverFn } from "../../api-types.gen";
import type { GraphQLContext } from "../../context";
import type {
  ExternalInputRequest,
  FlowRunWithoutEvents,
  SparseFlowRun,
} from "@local/hash-isomorphic-utils/flows/types";

/** A run that isn't running has no open requests. A running run's are saved on its entity. */
export const flowRunOpenInputRequestsResolver: ResolverFn<
  ExternalInputRequest[],
  FlowRunWithoutEvents | SparseFlowRun,
  GraphQLContext,
  Record<string, never>
> = (flowRun) =>
  flowRun.status === FlowRunStatus.Running ? flowRun.openInputRequests : [];
