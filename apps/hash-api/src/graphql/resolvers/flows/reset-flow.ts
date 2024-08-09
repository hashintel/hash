import { getFlowRunEntityById } from "@local/hash-backend-utils/flows";
import { temporalNamespace } from "@local/hash-backend-utils/temporal";
import type { EntityUuid } from "@local/hash-graph-types/entity";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import proto from "@temporalio/proto";
import { ApolloError } from "apollo-server-errors";
import { ForbiddenError } from "apollo-server-express";
import Long from "long";

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
  { flowUuid, checkpointId, eventId },
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

  console.log(
    "TEST",
    proto.temporal.api.enums.v1.ResetReapplyType.RESET_REAPPLY_TYPE_NONE,
  );

  await temporal.workflowService.resetWorkflowExecution({
    namespace: temporalNamespace,
    workflowExecution: {
      workflowId: flowUuid,
    },
    resetReapplyType:
      proto.temporal.api.enums.v1.ResetReapplyType.RESET_REAPPLY_TYPE_NONE,
    reason: checkpointId,
    requestId: generateUuid(),
    workflowTaskFinishEventId: Long.fromInt(eventId),
  });

  return true;
};
