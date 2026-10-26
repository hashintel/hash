import { getFlowRuns } from "@local/hash-backend-utils/flows";

import * as Error from "../../error";
import {
  getRequestedFlowRunFieldNames,
  wereDetailedFieldsRequested,
} from "./shared/were-detailed-fields-requested";

import type {
  FlowRun,
  QueryGetFlowRunsArgs,
  ResolverFn,
} from "../../api-types.gen";
import type { GraphQLContext } from "../../context";
import type { SparseFlowRun } from "@local/hash-isomorphic-utils/flows/types";

export const getFlowRunsResolver: ResolverFn<
  {
    flowRuns: FlowRun[] | SparseFlowRun[];
    totalCount: number;
    nextCursor: string | null;
  },
  Record<string, never>,
  Pick<
    GraphQLContext,
    "authentication" | "dataSources" | "flowRunHistories" | "temporal"
  >,
  QueryGetFlowRunsArgs
> = async (_parent, args, context, info) => {
  /** Each run's events are read from its whole history, so a list would read every listed run's. */
  if (getRequestedFlowRunFieldNames(info).includes("events")) {
    throw Error.badRequest(
      "`events` can only be requested for a single run, with `getFlowRunById`",
    );
  }

  const includeDetails = wereDetailedFieldsRequested(info);

  const { authentication, dataSources, flowRunHistories, temporal } = context;

  const { flowDefinitionEntityIds, executionStatus, cursor, limit } = args;

  return await getFlowRuns({
    authentication,
    filters: {
      flowDefinitionEntityIds,
      executionStatus,
      cursor,
      limit,
    },
    graphApiClient: dataSources.graphApi,
    historiesByWorkflowId: flowRunHistories,
    includeDetails,
    storageProvider: dataSources.uploadProvider,
    temporalClient: temporal,
  });
};
