import proto from "@temporalio/proto";
import Long from "long";

import { getFlowRunEntityById } from "@local/hash-backend-utils/flows";
import { getFlowRunRecord } from "@local/hash-backend-utils/flows/run-record";
import { correctFlowRunStatusFromRecord } from "@local/hash-backend-utils/flows/shared/save-flow-run-status";
import { saveOpenInputRequests } from "@local/hash-backend-utils/flows/shared/save-open-input-requests";
import { temporalNamespace } from "@local/hash-backend-utils/temporal";
import { getOpenInputRequests } from "@local/hash-isomorphic-utils/flows/run-events";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";

import { checkEntityPermission } from "../../../graph/knowledge/primitive/entity";
import * as Error from "../../error";

import type { MutationResetFlowArgs, ResolverFn } from "../../api-types.gen";
import type { LoggedInGraphQLContext } from "../../context";

export const resetFlow: ResolverFn<
  Promise<boolean>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationResetFlowArgs
> = async (
  _,
  { flowRunEntityId, checkpointId, eventId },
  { authentication, dataSources, provenance, temporal },
) => {
  const flow = await getFlowRunEntityById({
    flowRunEntityId,
    graphApiClient: dataSources.graphApi,
    userAuthentication: authentication,
  });

  if (!flow) {
    throw Error.notFound(`Flow with id ${flowRunEntityId} not found`);
  }

  const workflowId =
    flow.properties["https://hash.ai/@h/types/property-type/workflow-id/"];

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
      workflowId,
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

  /*
   * A reset reopens the run and changes which requests are open, without the workflow saving either: it saves its
   * status only when it ends, and its requests only as it raises and answers them.
   */
  const { header, events } = await getFlowRunRecord({
    storageProvider: dataSources.uploadProvider,
    temporalClient: temporal,
    workflowId,
  });

  await correctFlowRunStatusFromRecord({
    flowRunEntity: flow,
    graphApiClient: dataSources.graphApi,
    header,
    userAuthentication: authentication,
  });

  const openInputRequests = getOpenInputRequests(events);

  const savedOpenInputRequests =
    flow.properties[
      "https://hash.ai/@h/types/property-type/open-input-request/"
    ] ?? [];

  if (openInputRequests.length > 0 || savedOpenInputRequests.length > 0) {
    await saveOpenInputRequests({
      graphApiClient: dataSources.graphApi,
      openInputRequests,
      temporalWorkflowId: workflowId,
      userAuthentication: authentication,
    });
  }

  return true;
};
