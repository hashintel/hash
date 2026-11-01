import { getFlowRunById } from "@local/hash-backend-utils/flows";

import * as Error from "../../error";

import type {
  FlowRunSummary,
  QueryGetFlowRunByIdArgs,
  ResolverFn,
} from "../../api-types.gen";
import type { GraphQLContext } from "../../context";

/** The run as its entity describes it. Its other fields have resolvers of their own, which read its record. */
export const getFlowRunByIdResolver: ResolverFn<
  FlowRunSummary,
  Record<string, never>,
  Pick<GraphQLContext, "authentication" | "dataSources">,
  QueryGetFlowRunByIdArgs
> = async (_parent, args, context) => {
  const { flowRunEntityId } = args;

  const flowRun = await getFlowRunById({
    flowRunEntityId,
    graphApiClient: context.dataSources.graphApi,
    userAuthentication: context.authentication,
  });

  if (!flowRun) {
    throw Error.notFound(`Flow run with id ${flowRunEntityId} not found`);
  }

  return flowRun;
};
