import { getFlowRunEntityById } from "@local/hash-backend-utils/flows";
import { temporalNamespace } from "@local/hash-backend-utils/temporal";
import type { EntityUuid } from "@local/hash-graph-types/entity";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import { ApolloError } from "apollo-server-errors";
import { ForbiddenError } from "apollo-server-express";

import { checkEntityPermission } from "../../../graph/knowledge/primitive/entity";
import type { MutationResetFlowArgs, ResolverFn } from "../../api-types.gen";
import type { LoggedInGraphQLContext } from "../../context";

export const cancelFlow: ResolverFn<
  Promise<boolean>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationResetFlowArgs
> = async (
  _,
  { flowUuid },
  { authentication, dataSources, provenance, temporal, user },
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
    throw new ForbiddenError("You do not have permission to cancel this flow.");
  }

  await temporal.workflowService.requestCancelWorkflowExecution({
    namespace: temporalNamespace,
    workflowExecution: {
      workflowId: flowUuid,
    },
    reason: `Cancelled via GraphQL API by @${user.shortname}`,
    requestId: generateUuid(),
  });

  return true;
};
