import proto from "@temporalio/proto";
import Long from "long";

import { getFlowRunEntityById } from "@local/hash-backend-utils/flows";
import { findCheckpointResetPoint } from "@local/hash-backend-utils/flows/run-events";
import { temporalNamespace } from "@local/hash-backend-utils/temporal";
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

  /* The current run, read and reset by its id, so a reset in between can't move the checkpoint to another run. */
  const { runId } = await temporal.workflow.getHandle(workflowId).describe();
  const { events } = await temporal.workflow
    .getHandle(workflowId, runId)
    .fetchHistory();
  const resetPoint = findCheckpointResetPoint(events ?? [], eventId);

  if (resetPoint === null) {
    throw Error.badRequest(
      `The run hasn't started a workflow task since checkpoint ${checkpointId}`,
    );
  }

  await temporal.workflowService.resetWorkflowExecution({
    namespace: temporalNamespace,
    workflowExecution: {
      workflowId,
      runId,
    },
    /**
     * If we don't set this, Temporal will replay signals sent after the cancellation point to the new workflow execution.
     * Instead, we just want the events for any signals sent _prior_ to the cancellation point in the history.
     */
    resetReapplyType:
      proto.temporal.api.enums.v1.ResetReapplyType.RESET_REAPPLY_TYPE_NONE,
    reason: checkpointId,
    requestId: generateUuid(),
    workflowTaskFinishEventId: Long.fromInt(resetPoint),
  });

  return true;
};
