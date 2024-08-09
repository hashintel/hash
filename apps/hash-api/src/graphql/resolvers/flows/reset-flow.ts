import { getFlowRunEntityById } from "@local/hash-backend-utils/flows";
import type { EntityUuid } from "@local/hash-graph-types/entity";
import { ApolloError } from "apollo-server-errors";
import { ForbiddenError } from "apollo-server-express";
import Long from "long";

import { temporalNamespace } from "@local/hash-backend-utils/temporal";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import { checkEntityPermission } from "../../../graph/knowledge/primitive/entity";
import type { MutationResetFlowArgs, ResolverFn } from "../../api-types.gen";
import type { LoggedInGraphQLContext } from "../../context";

export const resetFlow: ResolverFn<
  Promise<boolean>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationResetFlowArgs
> = async (
  _,
  { flowUuid, checkpointId },
  { authentication, dataSources, provenance, temporal },
) => {
  const flow = await getFlowRunEntityById({
    flowRunId: flowUuid as EntityUuid,
    graphApiClient: dataSources.graphApi,
    userAuthentication: authentication,
  });

  if (!flow) {
    throw new ApolloError(`Flow with id ${flowUuid} not found`, "NOT_FOUND");
  }

  const userCanModify = await checkEntityPermission(
    { graphApi: dataSources.graphApi, provenance },
    authentication,
    {
      entityId: flow.entityId,
      permission: "update",
    },
  );

  if (!userCanModify) {
    throw new ForbiddenError("You do not have permission to modify this flow.");
  }

  await temporal.workflowService.resetWorkflowExecution({
    namespace: temporalNamespace,
    workflowExecution: {
      workflowId: flowUuid,
    },
    requestId: generateUuid(),
    workflowTaskFinishEventId: Long.fromInt(checkpointId),
  });

  return true;
};
