import { getFlowRunById } from "@local/hash-backend-utils/flows";
import type { SparseFlowRun } from "@local/hash-isomorphic-utils/flows/types";
import type { EntityUuid } from "@local/hash-subgraph";
import { ApolloError } from "apollo-server-errors";

import type {
  FlowRun,
  QueryGetFlowRunByIdArgs,
  ResolverFn,
} from "../../api-types.gen";
import type { GraphQLContext } from "../../context";
import { wereDetailedFieldsRequested } from "./shared/were-detailed-fields-requested";

export const getFlowRunByIdResolver: ResolverFn<
  FlowRun | SparseFlowRun,
  Record<string, never>,
  Pick<GraphQLContext, "authentication" | "dataSources" | "temporal">,
  QueryGetFlowRunByIdArgs
> = async (_parent, args, context, info) => {
  const { flowRunId } = args;

  const includeDetails = wereDetailedFieldsRequested(info);

  const flowRun = await getFlowRunById({
    flowRunId: flowRunId as EntityUuid,
    graphApiClient: context.dataSources.graphApi,
    includeDetails,
    temporalClient: context.temporal,
    userAuthentication: context.authentication,
  });

  if (!flowRun) {
    throw new ApolloError(
      `Flow run with id ${flowRunId} not found`,
      "NOT_FOUND",
    );
  }

  return flowRun;
};
