import { getFlowRunById } from "@local/hash-backend-utils/flows";

import * as Error from "../../error";
import { wereDetailedFieldsRequested } from "./shared/were-detailed-fields-requested";

import type {
  FlowRun,
  QueryGetFlowRunByIdArgs,
  ResolverFn,
} from "../../api-types.gen";
import type { GraphQLContext } from "../../context";
import type { SparseFlowRun } from "@local/hash-isomorphic-utils/flows/types";

export const getFlowRunByIdResolver: ResolverFn<
  FlowRun | SparseFlowRun,
  Record<string, never>,
  Pick<
    GraphQLContext,
    "authentication" | "dataSources" | "flowRunHistories" | "temporal"
  >,
  QueryGetFlowRunByIdArgs
> = async (_parent, args, context, info) => {
  const { flowRunEntityId } = args;

  const includeDetails = wereDetailedFieldsRequested(info);

  const flowRun = await getFlowRunById({
    flowRunEntityId,
    graphApiClient: context.dataSources.graphApi,
    historiesByWorkflowId: context.flowRunHistories,
    includeDetails,
    storageProvider: context.dataSources.uploadProvider,
    temporalClient: context.temporal,
    userAuthentication: context.authentication,
  });

  if (!flowRun) {
    throw Error.notFound(`Flow run with id ${flowRunEntityId} not found`);
  }

  return flowRun;
};
