import type { EntityId, UserId, WebId } from "@blockprotocol/type-system";
import {
  getBaseWorkflowParams,
  getFlowContextCache,
  getFlowEntityInfo,
} from "@local/hash-backend-utils/flows/get-flow-context";
import { createTemporalClient } from "@local/hash-backend-utils/temporal";
import type { GraphApi } from "@local/hash-graph-client";
import { Context } from "@temporalio/activity";
import type { Client as TemporalClient } from "@temporalio/client";

let _temporalClient: TemporalClient | undefined;

export const getTemporalClient = async () => {
  _temporalClient = _temporalClient ?? (await createTemporalClient());
  return _temporalClient;
};

type BaseFlowContext = {
  runId: string;
  stepId: string;
  userAuthentication: { actorId: UserId };
  webId: WebId;
  workflowId: string;
};

type FlowContextWithEntity = BaseFlowContext & {
  flowEntityId: EntityId;
};

/**
 * Get the context of the flow that is currently being executed
 * from a temporal activity.
 *
 * This method must be called from a temporal activity that is
 * called within the `runFlow` temporal workflow.
 *
 * @param params.graphApiClient - The Graph API client to use for entity queries.
 *   Required to get `flowEntityId`. If not provided, `flowEntityId` will not be available.
 */
export async function getFlowContext(params: {
  graphApiClient: GraphApi;
}): Promise<FlowContextWithEntity>;
export async function getFlowContext(params?: {
  graphApiClient?: undefined;
}): Promise<BaseFlowContext>;
export async function getFlowContext(params?: {
  graphApiClient?: GraphApi;
}): Promise<BaseFlowContext | FlowContextWithEntity> {
  const activityContext = Context.current();
  const { workflowId, runId } = activityContext.info.workflowExecution;

  const temporalClient = await getTemporalClient();
  const cache = await getFlowContextCache();

  // Get base workflow params from Temporal history
  const { userAuthentication, webId } = await getBaseWorkflowParams({
    workflowId,
    temporalClient,
    cache,
  });

  const { activityId: stepId } = Context.current().info;

  const baseContext: BaseFlowContext = {
    userAuthentication,
    runId,
    webId,
    stepId,
    workflowId,
  };

  // If graphApiClient is provided, query for the flow entity
  if (params?.graphApiClient) {
    // Query for the flow entity by workflowId property
    // This is necessary because the entity UUID may not match the workflow ID
    // Uses shared utility with retry logic for race condition handling
    const { flowEntityId } = await getFlowEntityInfo({
      workflowId,
      userAuthentication,
      graphApiClient: params.graphApiClient,
      cache,
    });

    return {
      ...baseContext,
      flowEntityId,
    };
  }

  return baseContext;
}
