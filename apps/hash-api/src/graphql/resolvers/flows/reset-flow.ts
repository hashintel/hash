import type { EntityUuid } from "@blockprotocol/type-system";
import { getFlowRunEntityById } from "@local/hash-backend-utils/flows";
import { temporalNamespace } from "@local/hash-backend-utils/temporal";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import proto from "@temporalio/proto";
import Long from "long";

import { checkEntityPermission } from "../../../graph/knowledge/primitive/entity";
import type { MutationResetFlowArgs, ResolverFn } from "../../api-types.gen";
import type { LoggedInGraphQLContext } from "../../context";
import * as Error from "../../error";

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
    throw Error.notFound(`Flow with id ${flowUuid} not found`);
  }

  const userCanModify = await checkEntityPermission(
    { graphApi: dataSources.graphApi, provenance },
    authentication,
    {
      entityId: flow.entityId,
      permission: "updateEntity",
    },
  );

  if (!userCanModify) {
    throw Error.forbidden("You do not have permission to modify this flow.");
  }

  await temporal.workflowService.resetWorkflowExecution({
    namespace: temporalNamespace,
    workflowExecution: {
      workflowId: flowUuid,
    },
    /**
     * If we don't set this, Temporal will replay signals sent after the cancellation point to the new workflow execution.
     * Instead, we just want the events for any signals sent _prior_ to the cancellation point in the history.
     */
    resetReapplyType:
      proto.temporal.api.enums.v1.ResetReapplyType.RESET_REAPPLY_TYPE_NONE,
    reason: checkpointId,
    requestId: generateUuid(),
    workflowTaskFinishEventId: Long.fromInt(eventId),
  });

  return true;
};
