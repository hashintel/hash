import type { EntityId, UserId, WebId } from "@blockprotocol/type-system";
import {
  extractEntityUuidFromEntityId,
  extractWebIdFromEntityId,
} from "@blockprotocol/type-system";
import {
  getFlowContextCache,
  getFlowEntityInfo,
} from "@local/hash-backend-utils/flows/get-flow-context";
import { createTemporalClient } from "@local/hash-backend-utils/temporal";
import { parseHistoryItemPayload } from "@local/hash-backend-utils/temporal/parse-history-item-payload";
import { type HashEntity, queryEntities } from "@local/hash-graph-sdk/entity";
import type { ManualInferenceTriggerInputName } from "@local/hash-isomorphic-utils/flows/browser-plugin-flow-types";
import type { GoalFlowTriggerInput } from "@local/hash-isomorphic-utils/flows/goal-flow-definitions";
import type { RunAiFlowWorkflowParams } from "@local/hash-isomorphic-utils/flows/temporal-types";
import type { FlowDataSources } from "@local/hash-isomorphic-utils/flows/types";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import { normalizeWhitespace } from "@local/hash-isomorphic-utils/normalize";
import type { File } from "@local/hash-isomorphic-utils/system-types/shared";
import { Context } from "@temporalio/activity";
import type { Client as TemporalClient } from "@temporalio/client";

import { graphApiClient } from "./graph-api-client.js";

let _temporalClient: TemporalClient | undefined;

/**
 * AI-specific workflow params that extend the base params with draft and data source info.
 */
type AiWorkflowParams = {
  createEntitiesAsDraft: boolean;
  dataSources: FlowDataSources;
  userAuthentication: { actorId: UserId };
  webId: WebId;
};

export const getTemporalClient = async () => {
  _temporalClient = _temporalClient ?? (await createTemporalClient());
  return _temporalClient;
};

/**
 * Get AI-specific workflow params from Temporal workflow history.
 * Extends the base workflow params with createEntitiesAsDraft and dataSources.
 */
const getAiWorkflowParams = async (params: {
  workflowId: string;
}): Promise<AiWorkflowParams> => {
  const { workflowId } = params;

  const cache = await getFlowContextCache();
  const cacheKey = `aiWorkflowParams-${workflowId}`;

  const cachedParams = await cache.get<AiWorkflowParams>(cacheKey);
  if (cachedParams) {
    return cachedParams;
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

  const draftTriggerInputNames: (
    | GoalFlowTriggerInput
    | ManualInferenceTriggerInputName
  )[] = ["Create as draft", "draft"];

  const createEntitiesAsDraft =
    !!runFlowWorkflowParams.flowTrigger.outputs?.find((output) =>
      draftTriggerInputNames.includes(output.outputName as "draft"),
    )?.payload.value;

  const aiParams: AiWorkflowParams = {
    createEntitiesAsDraft,
    dataSources: runFlowWorkflowParams.dataSources,
    userAuthentication: runFlowWorkflowParams.userAuthentication,
    webId: runFlowWorkflowParams.webId,
  };

  await cache.set(cacheKey, aiParams);
  return aiParams;
};

type FlowContext = {
  createEntitiesAsDraft: boolean;
  dataSources: FlowDataSources;
  flowEntityId: EntityId;
  runId: string;
  stepId: string;
  userAuthentication: { actorId: UserId };
  webId: WebId;
  workflowId: string;
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

  const { workflowId, runId } = activityContext.info.workflowExecution;

  const { createEntitiesAsDraft, dataSources, userAuthentication, webId } =
    await getAiWorkflowParams({
      workflowId,
    });

  // Query for the flow entity by workflowId (stored as a property on the entity)
  // This is necessary because the entity UUID may not match the workflow ID
  // Uses shared utility with retry logic for race condition handling
  const { flowEntityId } = await getFlowEntityInfo({
    workflowId,
    userAuthentication,
    graphApiClient,
  });

  const { activityId: stepId } = Context.current().info;

  return {
    createEntitiesAsDraft,
    dataSources,
    userAuthentication,
    flowEntityId,
    runId,
    webId,
    stepId,
    workflowId,
  };
};

export const getProvidedFiles = async (): Promise<HashEntity<File>[]> => {
  const {
    dataSources: { files },
    flowEntityId,
    userAuthentication: { actorId },
  } = await getFlowContext();

  if (files.fileEntityIds.length === 0) {
    return [];
  }

  const filesCacheKey = `files-${flowEntityId}`;
  const cache = await getFlowContextCache();

  const cachedFiles = await cache.get<HashEntity<File>[]>(filesCacheKey);

  if (cachedFiles) {
    return cachedFiles;
  }

  const { entities } = await queryEntities<File>(
    { graphApi: graphApiClient },
    { actorId },
    {
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
                { path: ["webId"] },
                { parameter: extractWebIdFromEntityId(fileEntityId) },
              ],
            },
            { equal: [{ path: ["archived"] }, { parameter: false }] },
          ],
        })),
      },
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts: false,
      includePermissions: false,
    },
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
 * - a URL in the database may contain whitespace characters (e.g. NBSP / U+00A0 / 160) which are played back differently (U+0020 / 32)
 */
export const areUrlsTheSameAfterNormalization = (
  first: string,
  second: string,
) =>
  decodeURIComponent(normalizeWhitespace(first)) ===
  decodeURIComponent(normalizeWhitespace(second));

export const getProvidedFileByUrl = async (
  url: string,
): Promise<HashEntity<File> | undefined> => {
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

/**
 * This will return `true` if the activity receives a cancellation request or if the workflow run has otherwise reached a 'closed' state, e.g.:
 *   - a call to 'reset' the workflow was made, which terminates the current run and starts a new one with event history up to the reset point
 *   - the workflow was terminated (the difference with 'cancelled' being that the workflow doesn't receive cancellation errors from activities)
 *   - the workflow was 'continue-as-new' while the activity was still running, which completes the old run and starts a new one with a fresh event history.
 *
 * @see https://docs.temporal.io/activities#cancellation
 */
export const isActivityCancelled = () =>
  Context.current().cancellationSignal.aborted;
