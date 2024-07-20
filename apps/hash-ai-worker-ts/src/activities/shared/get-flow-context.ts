import type { caching, MemoryCache } from "cache-manager";
import { createTemporalClient } from "@local/hash-backend-utils/temporal";
import { parseHistoryItemPayload } from "@local/hash-backend-utils/temporal/parse-history-item-payload";
import { Entity } from "@local/hash-graph-sdk/entity";
import type { AccountId } from "@local/hash-graph-types/account";
import type { EntityId, EntityUuid } from "@local/hash-graph-types/entity";
import type { OwnedById } from "@local/hash-graph-types/web";
import type { RunFlowWorkflowParams } from "@local/hash-isomorphic-utils/flows/temporal-types";
import type { FlowDataSources } from "@local/hash-isomorphic-utils/flows/types";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import { normalizeWhitespace } from "@local/hash-isomorphic-utils/normalize";
import type { File } from "@local/hash-isomorphic-utils/system-types/shared";
import {
  entityIdFromComponents,
  extractEntityUuidFromEntityId,
  extractOwnedByIdFromEntityId,
} from "@local/hash-subgraph";
import { Context } from "@temporalio/activity";
import type { Client as TemporalClient } from "@temporalio/client";

import { graphApiClient } from "./graph-api-client.js";

let _temporalClient: TemporalClient | undefined;

let _runFlowWorkflowParamsCache: MemoryCache | undefined;

type PartialRunFlowWorkflowParams = Pick<
  RunFlowWorkflowParams,
  "dataSources" | "webId" | "userAuthentication"
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

const getTemporalClient = async () => {
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

  const [runFlowWorkflowParams] = inputs as RunFlowWorkflowParams[];

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
    dataSources: runFlowWorkflowParams.dataSources,
    userAuthentication: runFlowWorkflowParams.userAuthentication,
    webId: runFlowWorkflowParams.webId,
  };

  await runFlowWorkflowParamsCache.set(
    workflowId,
    partialRunFlowWorkflowParams,
  );

  return partialRunFlowWorkflowParams;
};

interface FlowContext {
  dataSources: FlowDataSources;
  flowEntityId: EntityId;
  stepId: string;
  userAuthentication: { actorId: AccountId };
  webId: OwnedById;
}

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

  const { dataSources, userAuthentication, webId } =
    await getPartialRunFlowWorkflowParams({
      workflowId,
    });

  const flowEntityId = entityIdFromComponents(
    webId,
    // Assumes the flow entity UUID is the same as the workflow ID
    workflowId as EntityUuid,
  );

  const { activityId: stepId } = Context.current().info;

  return { dataSources, userAuthentication, flowEntityId, webId, stepId };
};

export const getProvidedFiles = async (): Promise<Entity<File>[]> => {
  const {
    dataSources: { files },
    flowEntityId,
    userAuthentication: { actorId },
  } = await getFlowContext();

  if (files.fileEntityIds.length === 0) {
    return [];
  }

  const filesCacheKey = `files-${flowEntityId}`;
  const cache = await getCache();

  const cachedFiles = await cache.get<Entity<File>[]>(filesCacheKey);

  if (cachedFiles) {
    return cachedFiles;
  }

  const entities = await graphApiClient
    .getEntities(actorId, {
      includeDrafts: false,
      filter: {
        any: files.fileEntityIds.map((fileEntityId) => ({
          all: [
            {
              equal: [
                { path: ["uuid"] },
                { parameter: extractEntityUuidFromEntityId(fileEntityId) },
              ],
            },
            {
              equal: [
                { path: ["ownedById"] },
                { parameter: extractOwnedByIdFromEntityId(fileEntityId) },
              ],
            },
            { equal: [{ path: ["archived"] }, { parameter: false }] },
          ],
        })),
      },
      temporalAxes: currentTimeInstantTemporalAxes,
    })
    .then(({ data: response }) =>
      response.entities.map((entity) => new Entity<File>(entity)),
    );

  await cache.set(filesCacheKey, entities);

  return entities;
};

/**
 * Compare two URLs to determine if they are the same.
 *
 * A URL taken from the database and sent to an LLM, and then passed back from the LLM as part of a tool call,
 * may have differences in whitespace and escape characters, e.g.
 * - a URL from the database with spaces escaped (%20) may be played back with spaces
 * - a URL in the database may contain whitespace characters (e.g. NBSP / U+00A0 / 160) which are played back differently (U+0020 / 32).
 */
export const areUrlsTheSameAfterNormalization = (
  first: string,
  second: string,
) =>
  decodeURIComponent(normalizeWhitespace(first)) ===
  decodeURIComponent(normalizeWhitespace(second));

export const getProvidedFileByUrl = async (
  url: string,
): Promise<Entity<File> | undefined> => {
  const files = await getProvidedFiles();

  return files.find((file) => {
    /**
     * The URL may have been provided by an LLM, in which case it may be missing escape characters which may be present in the original.
     */
    return areUrlsTheSameAfterNormalization(
      url,
      file.properties[
        "https://blockprotocol.org/@blockprotocol/types/property-type/file-url/"
      ],
    );
  });
};
