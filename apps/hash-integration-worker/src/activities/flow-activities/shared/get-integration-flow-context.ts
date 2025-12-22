import type {
  EntityId,
  EntityUuid,
  UserId,
  WebId,
} from "@blockprotocol/type-system";
import { entityIdFromComponents } from "@blockprotocol/type-system";
import { createTemporalClient } from "@local/hash-backend-utils/temporal";
import { parseHistoryItemPayload } from "@local/hash-backend-utils/temporal/parse-history-item-payload";
import type {
  BaseRunFlowWorkflowParams,
  RunAiFlowWorkflowParams,
} from "@local/hash-isomorphic-utils/flows/temporal-types";
import { Context } from "@temporalio/activity";
import type { Client as TemporalClient } from "@temporalio/client";
import type { MemoryCache } from "cache-manager";
import { caching } from "cache-manager";

let _temporalClient: TemporalClient | undefined;

let _runFlowWorkflowParamsCache: MemoryCache | undefined;

type PartialRunFlowWorkflowParams = Pick<
  BaseRunFlowWorkflowParams,
  "webId" | "userAuthentication"
>;

const getCache = async () => {
  _runFlowWorkflowParamsCache =
    _runFlowWorkflowParamsCache ??
    (await caching("memory", {
      max: 100, // 100 items
      ttl: 10 * 60 * 1000, // 10 minutes
    }));
  return _runFlowWorkflowParamsCache;
};

export const getTemporalClient = async () => {
  _temporalClient = _temporalClient ?? (await createTemporalClient());
  return _temporalClient;
};

const getPartialRunFlowWorkflowParams = async (params: {
  workflowId: string;
}): Promise<PartialRunFlowWorkflowParams> => {
  const { workflowId } = params;

  const runFlowWorkflowParamsCache = await getCache();

  const cachedPartialRunFlowWorkflowParams =
    await runFlowWorkflowParamsCache.get<PartialRunFlowWorkflowParams>(
      workflowId,
    );

  if (cachedPartialRunFlowWorkflowParams) {
    return cachedPartialRunFlowWorkflowParams;
  }

  const temporalClient = await getTemporalClient();
  const handle = temporalClient.workflow.getHandle(workflowId);

  const { events } = await handle.fetchHistory();

  if (!events) {
    throw new Error(`No events found for workflowId ${workflowId}`);
  }

  const workflowExecutionStartedEventAttributes =
    events.find((event) => event.workflowExecutionStartedEventAttributes)
      ?.workflowExecutionStartedEventAttributes ?? undefined;

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

  const [runFlowWorkflowParams] = inputs as RunAiFlowWorkflowParams[];

  if (!runFlowWorkflowParams) {
    throw new Error(
      `No parameters of the "runFlow" workflow found for workflowId ${workflowId}`,
    );
  }

  /**
   * Avoid caching the entire `RunFlowWorkflowParams` object to reduce memory usage
   * of the cache.
   */
  const partialRunFlowWorkflowParams: PartialRunFlowWorkflowParams = {
    userAuthentication: runFlowWorkflowParams.userAuthentication,
    webId: runFlowWorkflowParams.webId,
  };

  await runFlowWorkflowParamsCache.set(
    workflowId,
    partialRunFlowWorkflowParams,
  );

  return partialRunFlowWorkflowParams;
};

type FlowContext = {
  flowEntityId: EntityId;
  stepId: string;
  userAuthentication: { actorId: UserId };
  webId: WebId;
};

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

  const { userAuthentication, webId } = await getPartialRunFlowWorkflowParams({
    workflowId,
  });

  const flowEntityId = entityIdFromComponents(
    webId,
    // Assumes the flow entity UUID is the same as the workflow ID
    workflowId as EntityUuid,
  );

  const { activityId: stepId } = Context.current().info;

  return {
    userAuthentication,
    flowEntityId,
    webId,
    stepId,
  };
};
