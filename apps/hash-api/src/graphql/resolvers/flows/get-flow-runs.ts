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
  FlowRun[] | SparseFlowRun[],
  Record<string, never>,
  Pick<GraphQLContext, "authentication" | "dataSources" | "temporal">,
  QueryGetFlowRunsArgs
> = async (_parent, args, context, info) => {
  const includeDetails = wereDetailedFieldsRequested(info);

  const { authentication, dataSources, temporal } = context;

  const { flowDefinitionIds, executionStatus } = args;

  return await getFlowRuns({
    authentication,
    filters: {
      flowDefinitionIds,
      executionStatus,
    },
    graphApiClient: dataSources.graphApi,
    includeDetails,
    storageProvider: dataSources.uploadProvider,
    temporalClient: temporal,
  });
};
