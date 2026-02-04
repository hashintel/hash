import type { EntityId, UserId, WebId } from "@blockprotocol/type-system";
import type { GraphApi } from "@local/hash-graph-client";
import { queryEntities } from "@local/hash-graph-sdk/entity";
import type { RunAiFlowWorkflowParams } from "@local/hash-isomorphic-utils/flows/temporal-types";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  systemEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { FlowRun as FlowRunEntity } from "@local/hash-isomorphic-utils/system-types/shared";
import type { Client as TemporalClient } from "@temporalio/client";
import { backOff } from "exponential-backoff";
import type { MemoryCache } from "cache-manager";
import { caching } from "cache-manager";

import { parseHistoryItemPayload } from "../temporal/parse-history-item-payload.js";

let _flowContextCache: MemoryCache | undefined;

/**
 * Get the shared memory cache for flow context data.
 * Creates the cache lazily on first access.
 */
export const getFlowContextCache = async (): Promise<MemoryCache> => {
  _flowContextCache =
    _flowContextCache ??
    (await caching("memory", {
      max: 100, // 100 items
      ttl: 10 * 60 * 1000, // 10 minutes
    }));
  return _flowContextCache;
};

export type FlowEntityInfo = {
  flowEntityId: EntityId;
};

/**
 * Query for the flow entity by workflowId property with retry logic.
 * The workflowId is stored as a property on the FlowRun entity.
 * Results are cached to avoid repeated queries.
 *
 * Includes retry logic to handle the race condition where an activity
 * starts executing before the FlowRun entity has been persisted.
 *
 * @param params.workflowId - The Temporal workflow ID
 * @param params.userAuthentication - Authentication context for the query
 * @param params.graphApiClient - The Graph API client to use
 * @param params.cache - Optional cache instance (defaults to shared cache)
 */
export const getFlowEntityInfo = async (params: {
  workflowId: string;
  userAuthentication: { actorId: UserId };
  graphApiClient: GraphApi;
  cache?: MemoryCache;
}): Promise<FlowEntityInfo> => {
  const { workflowId, userAuthentication, graphApiClient } = params;

  const cache = params.cache ?? (await getFlowContextCache());
  const cacheKey = `flowEntity-${workflowId}`;

  const cachedInfo = await cache.get<FlowEntityInfo>(cacheKey);
  if (cachedInfo) {
    return cachedInfo;
  }

  // Query for the flow entity using the workflowId property
  // Use backOff to handle the race condition where the entity might not be persisted yet
  const flowEntity = await backOff(
    async () => {
      const {
        entities: [entity],
      } = await queryEntities<FlowRunEntity>(
        { graphApi: graphApiClient },
        userAuthentication,
        {
          filter: {
            all: [
              {
                equal: [
                  {
                    path: [
                      "properties",
                      systemPropertyTypes.workflowId.propertyTypeBaseUrl,
                    ],
                  },
                  { parameter: workflowId },
                ],
              },
              generateVersionedUrlMatchingFilter(
                systemEntityTypes.flowRun.entityTypeId,
                { ignoreParents: true },
              ),
            ],
          },
          temporalAxes: currentTimeInstantTemporalAxes,
          includeDrafts: false,
          includePermissions: false,
        },
      );

      if (!entity) {
        throw new Error(
          `Flow entity not found for workflowId ${workflowId}. The flow entity may not have been persisted yet.`,
        );
      }

      return entity;
    },
    {
      numOfAttempts: 5,
      startingDelay: 500,
      maxDelay: 5000,
      jitter: "full",
    },
  );

  const flowEntityInfo: FlowEntityInfo = {
    flowEntityId: flowEntity.metadata.recordId.entityId,
  };

  await cache.set(cacheKey, flowEntityInfo);
  return flowEntityInfo;
};

/**
 * Base workflow params that are common to both AI and integration flows.
 */
export type BaseWorkflowParams = {
  webId: WebId;
  userAuthentication: { actorId: UserId };
};

/**
 * Parse base workflow params from Temporal workflow history.
 * Results are cached to avoid repeated Temporal API calls.
 *
 * @param params.workflowId - The Temporal workflow ID
 * @param params.temporalClient - The Temporal client to use
 * @param params.cache - Optional cache instance (defaults to shared cache)
 */
export const getBaseWorkflowParams = async (params: {
  workflowId: string;
  temporalClient: TemporalClient;
  cache?: MemoryCache;
}): Promise<BaseWorkflowParams> => {
  const { workflowId, temporalClient } = params;

  const cache = params.cache ?? (await getFlowContextCache());
  const cacheKey = `workflowParams-${workflowId}`;

  const cachedParams = await cache.get<BaseWorkflowParams>(cacheKey);
  if (cachedParams) {
    return cachedParams;
  }

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

  const baseParams: BaseWorkflowParams = {
    userAuthentication: runFlowWorkflowParams.userAuthentication,
    webId: runFlowWorkflowParams.webId,
  };

  await cache.set(cacheKey, baseParams);
  return baseParams;
};
