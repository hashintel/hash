import { getHashInstanceAdminAccountGroupId } from "@local/hash-backend-utils/hash-instance";
import { getMachineActorId } from "@local/hash-backend-utils/machine-actors";
import type { GraphApi } from "@local/hash-graph-client";
import type {
  InferEntitiesCallerParams,
  InferEntitiesReturn,
} from "@local/hash-isomorphic-utils/ai-inference-types";
import { systemLinkEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { AccountId } from "@local/hash-subgraph";
import { StatusCode } from "@local/status";
import { CancelledFailure, Context } from "@temporalio/activity";
import dedent from "dedent";

import { logger } from "../shared/logger";
import { createInferenceUsageRecordActivity } from "./create-inference-usage-record-activity";
import { getAiAssistantAccountIdActivity } from "./get-ai-assistant-account-id-activity";
import { getDereferencedEntityTypesActivity } from "./get-dereferenced-entity-types-activity";
import { getResultsFromInferenceState } from "./infer-entities/get-results-from-inference-state";
import { inferEntitiesSystemMessage } from "./infer-entities/infer-entities-system-message";
import { inferEntitySummariesFromWebPage } from "./infer-entities/infer-entity-summaries-from-web-page";
import type {
  DereferencedEntityTypesByTypeId,
  InferenceState,
} from "./infer-entities/inference-types";
import { persistEntities } from "./infer-entities/persist-entities";
import { modelAliasToSpecificModel } from "./shared/openai";
import { stringify } from "./shared/stringify";
import { userExceededServiceUsageLimitActivity } from "./user-exceeded-service-usage-limit-activity";

/**
 * Infer and create entities of the requested types from the provided text input.
 *
 * @param authentication should belong to the user making the request
 * @param requestUuid a unique request id that will be assigned to the workflow and used in logs
 */
const inferEntities = async ({
  authentication: userAuthenticationInfo,
  graphApiClient,
  inferenceState,
  requestUuid,
  userArguments,
}: InferEntitiesCallerParams & {
  graphApiClient: GraphApi;
  inferenceState: InferenceState;
}): Promise<InferEntitiesReturn> => {
  /** Check if the user has exceeded their usage limits */

  /**
   * @todo: once `inferEntities` has been refactored to become a workflow,
   * use the `userExceededServiceUsageLimitActivity` function as an activity
   * instead of directly calling the underlying function.
   */
  const userExceedServiceUsageLimitReason =
    await userExceededServiceUsageLimitActivity({
      graphApiClient,
      userAccountId: userAuthenticationInfo.actorId,
    });

  if (userExceedServiceUsageLimitReason.code !== StatusCode.Ok) {
    return userExceedServiceUsageLimitReason;
  }

  const {
    createAs,
    entityTypeIds,
    maxTokens,
    model: modelAlias,
    ownedById,
    sourceTitle,
    sourceUrl,
    temperature,
    textInput,
  } = userArguments;

  /** Check if the user has entity creation permissions in the requested web */
  const userHasPermission = await graphApiClient
    .checkWebPermission(
      userAuthenticationInfo.actorId,
      ownedById,
      "create_entity",
    )
    .then(({ data }) => data.has_permission);

  if (!userHasPermission) {
    return {
      code: StatusCode.PermissionDenied,
      contents: [],
      message: `You do not have permission to create entities in requested web with id ${ownedById}.`,
    };
  }

  /** Fetch the AI Assistant actor and ensure it has permission to create entities in the requested web */

  const aiAssistantAccountId =
    /**
     * @todo: once `inferEntities` has been refactored to become a workflow,
     * use the `getAiAssistantAccountIdActivity` function as an activity
     * instead of directly calling the underlying function.
     */
    await getAiAssistantAccountIdActivity({
      authentication: userAuthenticationInfo,
      grantCreatePermissionForWeb: ownedById,
      graphApiClient,
    });

  if (!aiAssistantAccountId) {
    return {
      code: StatusCode.Internal,
      contents: [],
      message: "Could not retrieve hash-ai entity",
    };
  }

  /** The AI Assistant has permission in the specified web, proceed with inference */

  const model = modelAliasToSpecificModel[modelAlias];

  let entityTypes: DereferencedEntityTypesByTypeId;

  try {
    /**
     * @todo: once `inferEntities` has been refactored to become a workflow,
     * use the `getDereferencedEntityTypesActivity` function as an activity
     * instead of directly calling the underlying function.
     */
    entityTypes = await getDereferencedEntityTypesActivity({
      entityTypeIds,
      graphApiClient,
      actorId: aiAssistantAccountId,
    });
  } catch (err) {
    return {
      code: StatusCode.Internal,
      contents: [],
      message: `Error retrieving and dereferencing entity types: ${
        (err as Error).message
      }`,
    };
  }

  /**
   * Inference step 1: get a list of entities that can be inferred from the input text, without property details
   *
   * The two-step approach is intended to:
   * 1. Allow for inferring more entities than completion token limits would allow for if all entity details were
   * inferred in one step
   * 2. Split the task into steps to encourage the model to infer as many entities as possible first, before filling
   * out the details
   *
   * This step may need its own internal iteration if there are very many entities to infer – to be handled inside the
   * inferEntitySummaries function.
   */

  const { code, message } = await inferEntitySummariesFromWebPage({
    webPage: {
      title: sourceTitle,
      url: sourceUrl,
      textContent: textInput,
    },
    maxTokens,
    model,
    temperature,
    entityTypes,
    inferenceState,
  });

  logger.debug(
    `Inference state after entity summaries: ${stringify(inferenceState)}`,
  );

  if (code !== StatusCode.Ok) {
    logger.error(
      `Returning early after error inferring entity summaries: ${
        message ?? "no message provided"
      }`,
    );
    return {
      code,
      contents: [{ results: [], usage: inferenceState.usage }],
      message,
    };
  }

  /**
   * Step 2: Ask the model to create (or update) the entities inferred in step 1
   *
   * The function should handle pagination internally to keep within completion token limits.
   */

  /**
   * We want to leave links until the end, since they will depend on entities processed earlier
   * This assumes that links do not link to other links.
   */
  inferenceState.proposedEntitySummaries.sort((a, b) => {
    const aIsLink = !!a.sourceEntityId;
    const bIsLink = !!b.sourceEntityId;

    if ((aIsLink && bIsLink) || (!aIsLink && !bIsLink)) {
      return 0;
    }
    if (aIsLink && !bIsLink) {
      return 1;
    }
    return -1;
  });

  const persistEntitiesPrompt = dedent(`
    The website page title is ${sourceTitle}, hosted at ${sourceUrl}. Its content is as follows:
    ${textInput}
    ---WEBSITE CONTENT ENDS---
    
    You already provided a summary of the entities you can infer from the website. Here it is:
    ${JSON.stringify(Object.values(inferenceState.proposedEntitySummaries))}
  `);

  const promptMessages = [
    inferEntitiesSystemMessage,
    {
      role: "user",
      content: persistEntitiesPrompt,
    } as const,
  ];

  return await persistEntities({
    authentication: { machineActorId: aiAssistantAccountId },
    completionPayload: {
      max_tokens: maxTokens,
      messages: [
        inferEntitiesSystemMessage,
        {
          role: "user",
          content: persistEntitiesPrompt,
        },
      ],
      model,
      temperature,
    },
    createAs,
    entityTypes,
    graphApiClient,
    inferenceState: {
      ...inferenceState,
      iterationCount: inferenceState.iterationCount + 1,
    },
    originalPromptMessages: promptMessages,
    ownedById,
    requestingUserAccountId: userAuthenticationInfo.actorId,
    requestUuid,
  });
};

export const inferEntitiesActivity = async ({
  authentication: userAuthenticationInfo,
  graphApiClient,
  requestUuid,
  userArguments,
}: InferEntitiesCallerParams & {
  graphApiClient: GraphApi;
}): Promise<InferEntitiesReturn> => {
  /**
   * The heartbeat is required for the workflow to be cancellable
   */
  const heartbeatInterval = setInterval(() => {
    Context.current().heartbeat();
  }, 5_000);
  void Context.current().cancelled.catch(() => {
    clearInterval(heartbeatInterval);
  });

  const inferenceState: InferenceState = {
    iterationCount: 1,
    inProgressEntityIds: [],
    proposedEntitySummaries: [],
    proposedEntityCreationsByType: {},
    resultsByTemporaryId: {},
    usage: [],
  };

  /**
   * Wait for the job to complete, or a cancellation error to be returned, whichever comes first
   */
  const resultOrCancelledError = await Promise.race([
    inferEntities({
      authentication: userAuthenticationInfo,
      graphApiClient,
      inferenceState,
      requestUuid,
      userArguments,
    }),
    Context.current().cancelled.catch((cancellationErr) => {
      return cancellationErr as Error;
    }),
  ]);

  const model = modelAliasToSpecificModel[userArguments.model];

  /**
   * @todo we pass the inference state around the child functions of this activity,
   *    and have them return the contents (usage and results), but doing either is pointless:
   *    (a) the inferenceState is the same object in memory as it is here, we don't need to pass it around
   *        - and in fact we rely on that being the case in many places
   *    (b) 'usage' and 'results' can be derived from the inferenceState, so we don't need to return them
   *   The only thing the child functions need to do is return a code and message to accompany the results.
   *    TODO clean this up when we do any further refactoring of the process
   */
  const usage = inferenceState.usage;
  const results = getResultsFromInferenceState(inferenceState);

  /**
   * Whether the job was allowed to complete or was cancelled, we need to record the tokens used to this point,
   * and link the entities created or updated by the activity from the usage record.
   *
   * If an inference job has no usage and no results, it was probably cancelled basically immediately,
   * and there's no point creating empty usage records that have no tokens and link to nothing.
   *
   * In theory checking that 'usage.length > 0' should be sufficient, as there shouldn't be results without usage
   * logged, but we check both in case there is somehow results without usage.
   */
  if (results.length !== 0 || usage.length !== 0) {
    // We act as the HASH AI machine actor to create these entities
    let aiAssistantAccountId: AccountId;
    try {
      aiAssistantAccountId = await getMachineActorId(
        { graphApi: graphApiClient },
        userAuthenticationInfo,
        { identifier: "hash-ai" },
      );
    } catch {
      return {
        code: StatusCode.Internal,
        contents: [],
        message: "Could not retrieve hash-ai entity",
      };
    }

    /**
     * @todo: once `inferEntities` has been refactored to become a workflow,
     * use the `createInferenceUsageRecordActivity` function as an activity
     * instead of directly calling the underlying function.
     */
    const usageRecordMetadata = await createInferenceUsageRecordActivity({
      aiAssistantAccountId,
      graphApiClient,
      modelName: model,
      usage,
      userAccountId: userAuthenticationInfo.actorId,
    });

    const hashInstanceAdminGroupId = await getHashInstanceAdminAccountGroupId(
      { graphApi: graphApiClient },
      { actorId: aiAssistantAccountId },
    );

    for (const entityResult of results) {
      if (entityResult.status === "success") {
        await graphApiClient.createEntity(aiAssistantAccountId, {
          draft: false,
          properties: {},
          ownedById: userAuthenticationInfo.actorId,
          entityTypeIds: [
            entityResult.operation === "create"
              ? systemLinkEntityTypes.created.linkEntityTypeId
              : systemLinkEntityTypes.updated.linkEntityTypeId,
          ],
          linkData: {
            leftEntityId: usageRecordMetadata.recordId.entityId,
            rightEntityId: entityResult.entity.metadata.recordId.entityId,
          },
          relationships: [
            {
              relation: "administrator",
              subject: {
                kind: "account",
                subjectId: aiAssistantAccountId,
              },
            },
            {
              relation: "viewer",
              subject: {
                kind: "account",
                subjectId: userAuthenticationInfo.actorId,
              },
            },
            {
              relation: "viewer",
              subject: {
                kind: "accountGroup",
                subjectId: hashInstanceAdminGroupId,
              },
            },
          ],
        });
      }
    }
  }

  if ("code" in resultOrCancelledError) {
    /**
     * The job completed, return the result
     */
    return {
      ...resultOrCancelledError,
      contents: [{ results, usage }],
    };
  }

  /**
   * This must be a cancellation, throw it. We pass the results back to the workflow as details inside the cancellation
   * error. We could just return the results, but we have to throw this error for Temporal to categorise the activity
   * as cancelled.
   */
  throw new CancelledFailure(
    "Activity cancelled",
    [
      {
        code: StatusCode.Cancelled,
        contents: [
          {
            results,
            usage,
          },
        ],
        message: "Activity cancelled",
      },
    ],
    resultOrCancelledError,
  );
};
