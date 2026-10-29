import { getFlowRuns } from "@local/hash-backend-utils/flows";

import type {
  PaginatedFlowRuns,
  QueryGetFlowRunsArgs,
  ResolverFn,
} from "../../api-types.gen";
import type { GraphQLContext } from "../../context";

export const getFlowRunsResolver: ResolverFn<
  PaginatedFlowRuns,
  Record<string, never>,
  Pick<GraphQLContext, "authentication" | "dataSources">,
  QueryGetFlowRunsArgs
> = async (_parent, args, context) => {
  const { authentication, dataSources } = context;

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
  });
};
