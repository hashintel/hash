import { getFlowRuns } from "@local/hash-backend-utils/flows";
import type { SparseFlowRun } from "@local/hash-isomorphic-utils/flows/types";

import type {
  FlowRun,
  QueryGetFlowRunsArgs,
  ResolverFn,
} from "../../api-types.gen";
import type { GraphQLContext } from "../../context";
import { wereDetailedFieldsRequested } from "./shared/were-detailed-fields-requested";

export const getFlowRunsResolver: ResolverFn<
  { flowRuns: FlowRun[] | SparseFlowRun[]; totalCount: number },
  Record<string, never>,
  Pick<GraphQLContext, "authentication" | "dataSources" | "temporal">,
  QueryGetFlowRunsArgs
> = async (_parent, args, context, info) => {
  const includeDetails = wereDetailedFieldsRequested(info);

  const { authentication, dataSources, temporal } = context;

  const { flowDefinitionIds, executionStatus, offset, limit } = args;

  return await getFlowRuns({
    authentication,
    filters: {
      flowDefinitionIds,
      executionStatus,
      offset,
      limit,
    },
    graphApiClient: dataSources.graphApi,
    includeDetails,
    storageProvider: dataSources.uploadProvider,
    temporalClient: temporal,
  });
};
