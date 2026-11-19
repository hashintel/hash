import { FlowRunStatus } from "../../api-types.gen";

import type { ResolverFn } from "../../api-types.gen";
import type { GraphQLContext } from "../../context";
import type { FlowRunParent } from "./shared/get-record-of-flow-run";
import type { ExternalInputRequest } from "@local/hash-isomorphic-utils/flows/types";

/** A run that isn't running has no open requests. A running run's are saved on its entity. */
export const flowRunOpenInputRequestsResolver: ResolverFn<
  ExternalInputRequest[],
  FlowRunParent,
  GraphQLContext,
  Record<string, never>
> = (flowRun) =>
  flowRun.status === FlowRunStatus.Running ? flowRun.openInputRequests : [];
