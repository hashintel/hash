import { createGraphClient } from "@local/hash-backend-utils/create-graph-client";
import { createTemporalClient } from "@local/hash-backend-utils/temporal";
import { parseHistoryItemPayload } from "@local/hash-backend-utils/temporal/parse-history-item-payload";
import type { GraphApi } from "@local/hash-graph-client";
import { getRequiredEnv } from "@local/hash-isomorphic-utils/environment";
import type { RunFlowWorkflowParams } from "@local/hash-isomorphic-utils/flows/temporal-types";
import type {
  AccountId,
  EntityId,
  EntityUuid,
  OwnedById,
} from "@local/hash-subgraph";
import { entityIdFromComponents } from "@local/hash-subgraph";
import { Context } from "@temporalio/activity";

import { logToConsole } from "../../shared/logger";

const temporalClient = await createTemporalClient();

const getWorkflowExecutionStartedEventAttributesOfWorkflow = async (params: {
  workflowId: string;
}) => {
  const { workflowId } = params;

  const handle = temporalClient.workflow.getHandle(workflowId);

  const { events } = await handle.fetchHistory();

  if (!events) {
    throw new Error(`No events found for workflowId ${workflowId}`);
  }

  const workflowExecutionStartedEventAttributes =
    events.find((event) => event.workflowExecutionStartedEventAttributes)
      ?.workflowExecutionStartedEventAttributes ?? undefined;

  return { workflowExecutionStartedEventAttributes };
};

type FlowContext = {
  flowEntityId: EntityId;
  graphApiClient: GraphApi;
  userAuthentication: { actorId: AccountId };
  webId: OwnedById;
};

const graphApiClient = createGraphClient(logToConsole, {
  host: getRequiredEnv("HASH_GRAPH_API_HOST"),
  port: parseInt(getRequiredEnv("HASH_GRAPH_API_PORT"), 10),
});

/**
 * Get the context of the flow that is currently being executed
 * from a temporal activity.
 *
 * This method must be called from a temporal activity that is
 * called within the `runFlow` temporal workflow.
 */
export const getFlowContext = async (): Promise<FlowContext> => {
  const activityContext = Context.current();

  const { workflowId } = activityContext.info.workflowExecution;

  /**
   * @todo: consider caching the result of this, so that multiple calls
   * to `getFlowContext` within the same flow do not result in individual
   * calls to the Temporal API.
   */
  const { workflowExecutionStartedEventAttributes } =
    await getWorkflowExecutionStartedEventAttributesOfWorkflow({
      workflowId,
    });

  if (!workflowExecutionStartedEventAttributes) {
    throw new Error(
      `No workflow execution started event attributes found for workflowId ${workflowId}`,
    );
  }

  const inputs = parseHistoryItemPayload(
    workflowExecutionStartedEventAttributes.input,
  );

  if (!inputs) {
    throw new Error(
      `No inputs found for workflowId ${workflowId} in the workflow execution started event`,
    );
  }

  const [runFlowWorkflowParams] = inputs as RunFlowWorkflowParams[];

  if (!runFlowWorkflowParams) {
    throw new Error(
      `No parameters of the "runFlow" workflow found for workflowId ${workflowId}`,
    );
  }

  const { userAuthentication, webId } = runFlowWorkflowParams;

  const flowEntityId = entityIdFromComponents(
    /** @todo: replace this with the `webId` input parameter */
    webId,
    // Assumes the flow entity UUID is the same as the workflow ID
    workflowId as EntityUuid,
  );

  return { userAuthentication, graphApiClient, flowEntityId, webId };
};
