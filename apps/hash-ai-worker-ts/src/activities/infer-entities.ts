import type { VersionedUrl } from "@blockprotocol/type-system";
import {
  getHashInstanceAdminAccountGroupId,
  isUserHashInstanceAdmin,
} from "@local/hash-backend-utils/hash-instance";
import {
  getMachineActorId,
  getWebMachineActorId,
} from "@local/hash-backend-utils/machine-actors";
import { createGraphChangeNotification } from "@local/hash-backend-utils/notifications";
import {
  createUsageRecord,
  getUserServiceUsage,
} from "@local/hash-backend-utils/service-usage";
import type { GraphApi } from "@local/hash-graph-client";
import type {
  InferenceModelName,
  InferEntitiesCallerParams,
  InferEntitiesReturn,
} from "@local/hash-isomorphic-utils/ai-inference-types";
import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { systemLinkEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type {
  AccountId,
  Entity,
  OwnedById,
  Subgraph,
  Timestamp,
} from "@local/hash-subgraph";
import { StatusCode } from "@local/status";
import dedent from "dedent";
import OpenAI from "openai";

import { createEntities } from "./infer-entities/create-entities";
import {
  DereferencedEntityType,
  dereferenceEntityType,
} from "./infer-entities/dereference-entity-type";
import {
  CompletionPayload,
  DereferencedEntityTypesByTypeId,
  InferenceState,
  PermittedOpenAiModel,
} from "./infer-entities/inference-types";
import { log } from "./infer-entities/log";
import {
  generatePersistEntitiesTools,
  ProposedEntityCreationsByType,
  ProposedEntityUpdatesByType,
  validateProposedEntitiesByType,
} from "./infer-entities/persist-entities/generate-persist-entities-tools";
import { firstUserMessageIndex } from "./infer-entities/shared/first-user-message-index";
import { getOpenAiResponse } from "./infer-entities/shared/get-open-ai-response";
import { stringify } from "./infer-entities/stringify";
import { updateEntities } from "./infer-entities/update-entities";

/**
 * A map of the API consumer-facing model names to the values provided to OpenAI.
 * Allows for using preview models before they take over the general alias.
 */
const modelAliasToSpecificModel = {
  "gpt-3.5-turbo": "gpt-3.5-turbo-1106", // bigger context window, will be the resolved value for gpt-3.5-turbo from 11 Dec 2023
  "gpt-4-turbo": "gpt-4-1106-preview", // 'gpt-4-turbo' is not a valid model name in the OpenAI API yet, it's in preview only
  "gpt-4": "gpt-4", // this points to the latest available anyway as of 6 Dec 2023
} as const satisfies Record<InferenceModelName, PermittedOpenAiModel>;

const requestEntityInference = async (params: {
  authentication: { machineActorId: AccountId };
  createAs: "draft" | "live";
  completionPayload: CompletionPayload;
  entityTypes: DereferencedEntityTypesByTypeId;
  inferenceState: InferenceState;
  graphApiClient: GraphApi;
  ownedById: OwnedById;
  requestUuid: string;
  requestingUserAccountId: AccountId;
}): Promise<InferEntitiesReturn> => {
  const {
    authentication,
    completionPayload,
    createAs,
    entityTypes,
    inferenceState,
    graphApiClient,
    ownedById,
    requestingUserAccountId,
  } = params;

  const {
    iterationCount,
    iterationEntitiesByTemporaryId,
    proposedEntitySummaryByTemporaryId,
    resultsByTemporaryId,
    usage: usageFromLastIteration,
  } = inferenceState;

  if (iterationCount > 10) {
    log(
      `Model reached maximum number of iterations. Messages: ${stringify(
        completionPayload.messages,
      )}`,
    );

    return {
      code: StatusCode.ResourceExhausted,
      contents: [],
      message: `Maximum number of iterations reached.`,
    };
  }

  log(`Iteration ${iterationCount} begun.`);

  const createInferredEntityNotification = async ({
    entity,
    operation,
  }: {
    entity: Entity;
    operation: "create" | "update";
  }) => {
    const entityEditionTimestamp =
      entity.metadata.temporalVersioning.decisionTime.start.limit;

    await createGraphChangeNotification(
      { graphApi: graphApiClient },
      authentication,
      {
        changedEntityId: entity.metadata.recordId.entityId,
        changedEntityEditionId: entityEditionTimestamp,
        notifiedUserAccountId: requestingUserAccountId,
        operation,
      },
    );
  };

  const entityTypeIds = Object.keys(entityTypes);

  const tools = generatePersistEntitiesTools(Object.values(entityTypes));

  const openApiPayload: OpenAI.ChatCompletionCreateParams = {
    ...completionPayload,
    tools,
  };

  const openAiResponse = await getOpenAiResponse(openApiPayload);

  if (openAiResponse.code !== StatusCode.Ok) {
    return {
      ...openAiResponse,
      contents: [],
    };
  }

  const { response, usage } = openAiResponse.contents[0]!;

  const { finish_reason, message } = response;

  const toolCalls = message.tool_calls;

  const latestUsage = [...usageFromLastIteration, usage];

  const retryWithMessages = ({
    retryMessages,
    requiresOriginalContext,
  }: {
    retryMessages: (
      | OpenAI.ChatCompletionUserMessageParam
      | OpenAI.ChatCompletionToolMessageParam
    )[];
    requiresOriginalContext: boolean;
  }) => {
    log(`Retrying with additional messages: ${stringify(retryMessages)}`);

    const newMessages = [
      ...completionPayload.messages.map((msg, index) =>
        index === firstUserMessageIndex && !requiresOriginalContext
          ? {
              ...msg,
              content:
                "I provided you text to infer entities, and you responded below – please see further instructions after your messages",
            }
          : msg,
      ),
      message,
      ...retryMessages,
    ];

    return requestEntityInference({
      ...params,
      inferenceState: {
        ...inferenceState,
        iterationCount: iterationCount + 1,
        usage: latestUsage,
      },
      completionPayload: {
        ...completionPayload,
        messages: newMessages,
      },
    });
  };

  switch (finish_reason) {
    case "stop": {
      const errorMessage = `AI Model returned 'stop' finish reason, with message: ${
        message.content ?? "no message"
      }`;

      log(errorMessage);

      return {
        code: StatusCode.Unknown,
        contents: [
          {
            results: Object.values(inferenceState.resultsByTemporaryId),
            usage: latestUsage,
          },
        ],
        message:
          message.content ?? "No entities could be inferred from the page.",
      };
    }

    case "length": {
      log(
        `AI Model returned 'length' finish reason on attempt ${iterationCount}.`,
      );

      const toolCallId = toolCalls?.[0]?.id;
      if (!toolCallId) {
        return {
          code: StatusCode.ResourceExhausted,
          contents: [
            {
              results: Object.values(inferenceState.resultsByTemporaryId),
              usage: latestUsage,
            },
          ],
          message:
            "The maximum amount of tokens was reached before the model returned a completion, with no tool call to respond to.",
        };
      }

      return retryWithMessages({
        retryMessages: [
          {
            role: "tool",
            content:
              // @todo see if we can get the model to respond continuing off the previous JSON argument to the function call
              "Your previous response was cut off for length – please respond again with a shorter function call.",
            tool_call_id: toolCallId,
          },
        ],
        requiresOriginalContext: true,
      });
    }

    case "content_filter":
      log(
        `The content filter was triggered on attempt ${iterationCount} with input: ${stringify(
          completionPayload.messages,
        )}, `,
      );

      return {
        code: StatusCode.InvalidArgument,
        contents: [
          {
            results: Object.values(inferenceState.resultsByTemporaryId),
            usage: latestUsage,
          },
        ],
        message: "The content filter was triggered",
      };

    case "tool_calls": {
      if (!toolCalls) {
        const errorMessage =
          "AI Model returned 'tool_calls' finish reason with no tool calls";

        log(`${errorMessage}. Message: ${stringify(message)}`);

        return {
          code: StatusCode.Internal,
          contents: [
            {
              results: Object.values(inferenceState.resultsByTemporaryId),
              usage: latestUsage,
            },
          ],
          message: errorMessage,
        };
      }

      const retryMessages: ((
        | OpenAI.ChatCompletionUserMessageParam
        | OpenAI.ChatCompletionToolMessageParam
      ) & { requiresOriginalContext: boolean })[] = [];

      for (const toolCall of toolCalls) {
        const toolCallId = toolCall.id;

        const functionCall = toolCall.function;

        const { arguments: modelProvidedArgument, name: functionName } =
          functionCall;

        try {
          JSON.parse(modelProvidedArgument);
        } catch {
          log(
            `Could not parse AI Model response on attempt ${iterationCount}: ${stringify(
              modelProvidedArgument,
            )}`,
          );

          return retryWithMessages({
            retryMessages: [
              {
                role: "tool",
                content:
                  "Your previous response contained invalid JSON. Please try again.",
                tool_call_id: toolCallId,
              },
            ],
            requiresOriginalContext: true,
          });
        }

        if (functionName === "create_entities") {
          let proposedEntitiesByType: ProposedEntityCreationsByType;
          try {
            proposedEntitiesByType = JSON.parse(
              modelProvidedArgument,
            ) as ProposedEntityCreationsByType;
            validateProposedEntitiesByType(proposedEntitiesByType, false);
          } catch (err) {
            log(
              `Model provided invalid argument to create_entities function. Argument provided: ${stringify(
                modelProvidedArgument,
              )}`,
            );

            retryMessages.push({
              content:
                "You provided an invalid argument to create_entities. Please try again",
              requiresOriginalContext: true,
              role: "tool",
              tool_call_id: toolCallId,
            });
            continue;
          }

          const providedEntityTypes = Object.keys(proposedEntitiesByType);
          const notRequestedTypes = providedEntityTypes.filter(
            (providedEntityTypeId) =>
              !entityTypeIds.includes(providedEntityTypeId as VersionedUrl),
          );

          let retryMessageContent = "";
          let requiresOriginalContextForRetry = false;

          if (notRequestedTypes.length > 0) {
            requiresOriginalContextForRetry = true;
            retryMessageContent += `You provided entities of types ${notRequestedTypes.join(
              ", ",
            )}, which were not requested. Please try again without them\n`;
          }

          try {
            const {
              creationSuccesses,
              creationFailures,
              updateCandidates,
              unchangedEntities,
            } = await createEntities({
              actorId: authentication.machineActorId,
              createAsDraft: createAs === "draft",
              graphApiClient,
              log,
              ownedById,
              previousSuccesses: entitiesForLinks,
              proposedEntitiesByType,
              requestedEntityTypes: entityTypes,
            });

            log(`Creation successes: ${stringify(creationSuccesses)}`);
            log(`Creation failures: ${stringify(creationFailures)}`);
            log(`Update candidates: ${stringify(updateCandidates)}`);

            const successes = Object.values(creationSuccesses);
            const failures = Object.values(creationFailures);
            const updates = Object.values(updateCandidates);
            const unchangeds = Object.values(unchangedEntities);

            for (const unchanged of unchangeds) {
              entitiesForLinks[unchanged.proposedEntity.entityId] = {
                entity: unchanged.existingEntity,
              };
            }
            for (const success of successes) {
              entitiesForLinks[success.proposedEntity.entityId] = success;
            }

            for (const success of successes) {
              void createInferredEntityNotification({
                entity: success.entity,
                operation: "create",
              });
            }

            results.push(...successes, ...failures);

            if (failures.length > 0) {
              retryMessageContent += dedent(`
                Some of the entities you suggested for creation were invalid. Please review their properties and try again. 
                The entities you should review and make a 'create_entities' call for are:
                ${failures
                  .map(
                    (failure) => `
                  your proposed entity: ${stringify(failure.proposedEntity)}
                  failure reason: ${failure.failureReason}
                `,
                  )
                  .join("\n")}
              `);
            }

            if (updates.length > 0) {
              retryMessageContent += dedent(`
              Some of the entities you suggest for creation already exist. Please review their properties and call update_entities
              to update them instead. Please include ALL properties when updating, including any you aren't changing.
              The entities you should update are:
              ${updates
                .map(
                  (updateCandidate) => `
                your proposed entity: ${stringify(
                  updateCandidate.proposedEntity,
                )}
                updateEntityId to use: ${
                  updateCandidate.existingEntity.metadata.recordId.entityId
                }
                entityTypeId: ${
                  updateCandidate.existingEntity.metadata.entityTypeId
                }
                Current properties: ${stringify(
                  updateCandidate.existingEntity.properties,
                )}
              `,
                )
                .join("\n")}
              `);
            }

            if (retryMessageContent) {
              retryMessages.push({
                role: "tool",
                tool_call_id: toolCallId,
                content: retryMessageContent,
                requiresOriginalContext: requiresOriginalContextForRetry,
              });
            }
          } catch (err) {
            const errorMessage = `Error creating entities: ${
              (err as Error).message
            }`;
            log(errorMessage);

            return {
              code: StatusCode.Internal,
              contents: [
                {
                  results: Object.values(inferenceState.resultsByTemporaryId),
                  usage: latestUsage,
                },
              ],
              message: errorMessage,
            };
          }
        }
        if (functionName === "update_entities") {
          let proposedEntityUpdatesByType: ProposedEntityUpdatesByType;
          try {
            proposedEntityUpdatesByType = JSON.parse(
              modelProvidedArgument,
            ) as ProposedEntityUpdatesByType;

            validateProposedEntitiesByType(proposedEntityUpdatesByType, true);
          } catch (err) {
            log(
              `Model provided invalid argument to update_entities function. Argument provided: ${stringify(
                modelProvidedArgument,
              )}`,
            );

            retryMessages.push({
              content:
                "You provided an invalid argument to update_entities. Please try again",
              role: "tool",
              tool_call_id: toolCallId,
              requiresOriginalContext: true,
            });
            continue;
          }

          const providedEntityTypes = Object.keys(proposedEntityUpdatesByType);
          const notRequestedTypes = providedEntityTypes.filter(
            (providedEntityTypeId) =>
              !entityTypeIds.includes(providedEntityTypeId as VersionedUrl),
          );

          if (notRequestedTypes.length > 0) {
            retryMessages.push({
              content: `You provided entities of types ${notRequestedTypes.join(
                ", ",
              )} for update, which were not requested. Please try again`,
              role: "tool",
              tool_call_id: toolCallId,
              requiresOriginalContext: true,
            });
            continue;
          }

          try {
            const { updateSuccesses, updateFailures } = await updateEntities({
              actorId: authentication.machineActorId,
              graphApiClient,
              log,
              ownedById,
              proposedEntityUpdatesByType,
              requestedEntityTypes: entityTypes,
            });

            const successes = Object.values(updateSuccesses);
            const failures = Object.values(updateFailures);

            for (const success of successes) {
              void createInferredEntityNotification({
                entity: success.entity,
                operation: "update",
              });
            }

            results.push(...successes, ...failures);

            if (failures.length > 0) {
              retryMessages.push({
                role: "tool",
                tool_call_id: toolCallId,
                content: dedent(`
                  Some of the entities you suggested for update were invalid. Please review their properties and try again. 
                  The entities you should review and make a 'update_entities' call for are:
                  ${failures
                    .map(
                      (failure) => `
                    your proposed entity: ${stringify(failure.proposedEntity)}
                    failure reason: ${failure.failureReason}
                  `,
                    )
                    .join("\n")}
                `),
                requiresOriginalContext: false,
              });
            }
          } catch (err) {
            return {
              code: StatusCode.Internal,
              contents: [
                {
                  results: Object.values(inferenceState.resultsByTemporaryId),
                  usage: latestUsage,
                },
              ],
              message: `Error update entities: ${(err as Error).message}`,
            };
          }
        }
      }

      if (retryMessages.length === 0) {
        const results = Object.values(resultsByTemporaryId);
        log(`Returning results: ${stringify(results)}`);
        return {
          code: StatusCode.Ok,
          contents: [{ results, usage: latestUsage }],
        };
      }

      const toolCallsWithoutProblems = toolCalls.filter(
        (toolCall) =>
          !retryMessages.some(
            (msg) => msg.role === "tool" && msg.tool_call_id === toolCall.id,
          ),
      );

      /**
       * We require exactly one response to each tool call for subsequent messages – this fallback ensures that.
       */
      retryMessages.push(
        ...toolCallsWithoutProblems.map((toolCall) => ({
          role: "tool" as const,
          tool_call_id: toolCall.id,
          content: "No problems found with this tool call.",
          requiresOriginalContext: false,
        })),
      );

      return retryWithMessages({
        retryMessages: retryMessages.map(
          ({ requiresOriginalContext: _, ...msg }) => msg,
        ),
        requiresOriginalContext: retryMessages.some(
          (retryMessage) => retryMessage.requiresOriginalContext,
        ),
      });
    }
  }

  const errorMessage = `AI Model returned unhandled finish reason: ${finish_reason}`;
  log(errorMessage);

  return {
    code: StatusCode.Internal,
    contents: [
      {
        results: Object.values(inferenceState.resultsByTemporaryId),
        usage: latestUsage,
      },
    ],
    message: errorMessage,
  };
};

const systemMessage: OpenAI.ChatCompletionSystemMessageParam = {
  role: "system",
  content: dedent(`
    You are an Entity Inference Assistant. The user provides you with a text input, from which you infer entities for creation. 
    You create the entities by calling the provided create_entities function, which specifies the schemas of entities you may create. 
    Each created entity should be given a unique numerical identifier as their 'entityId' property. 
    Some entities require sourceEntityId and targetEntityId properties – these are links between other entities, 
      and sourceEntityId and targetEntityId must correspond to the entityId of other entities you create.
      The schema of the source entity will show which links are valid for it, under the 'links' field. 
    The provided user text is your only source of information, so make sure to extract as much information as possible, 
      and do not rely on other information about the entities in question you may know. 
    Empty properties should be left out. Pay close attention to the JSON Schema of each entity to create! 
    Please do not add any properties which are not listed in the schema, but DO try and fill out as many of the properties
      in the schema as possible, if you can find any relevant information in the text. 
    The entities you create must be suitable for the schema chosen 
      – ignore any entities in the provided text which do not have an appropriate schema to use. 
      The keys of the entities 'properties' objects are URLs which end in a trailing slash. This is intentional –
      please do not omit the trailing slash.
    Make sure you attempt to create entities of all the provided types, if there is data to do so!
    The user may respond advising you that some proposed entities already exist, and give you a new string identifier for them,
      as well as their existing properties. You can then call update_entities instead to update the relevant entities, 
      making sure that you retain any useful information in the existing properties, augmenting it with what you have inferred. 
    The more entities you infer, the happier the user will be! 
    The user has requested that you fill out as many properties as possible, so please do so. Do not optimise for short responses
    – this user is hungry for lots of data.
  `),
};

const usageCostLimit = {
  admin: {
    day: 100,
    month: 500,
  },
  user: {
    day: 10,
    month: 50,
  },
};

/**
 * Infer and create entities of the requested types from the provided text input.
 * @param authentication information on the user making the request
 * @param graphApiClient
 * @param userArguments
 */
export const inferEntities = async ({
  authentication: userAuthenticationInfo,
  graphApiClient,
  requestUuid,
  userArguments,
}: InferEntitiesCallerParams & {
  graphApiClient: GraphApi;
}): Promise<InferEntitiesReturn> => {
  const now = new Date();

  const userServiceUsage = await getUserServiceUsage(
    { graphApi: graphApiClient },
    userAuthenticationInfo,
    {
      userAccountId: userAuthenticationInfo.actorId,
      decisionTimeInterval: {
        start: {
          kind: "inclusive",
          limit: new Date(
            now.valueOf() - 1000 * 60 * 60 * 24 * 30,
          ).toISOString() as Timestamp,
        },
        end: { kind: "inclusive", limit: now.toISOString() as Timestamp },
      },
    },
  );

  const { lastDaysCost, lastThirtyDaysCost } = userServiceUsage.reduce(
    (acc, usageRecord) => {
      acc.lastDaysCost += usageRecord.last24hoursTotalCostInUsd;
      acc.lastThirtyDaysCost += usageRecord.totalCostInUsd;
      return acc;
    },
    { lastDaysCost: 0, lastThirtyDaysCost: 0 },
  );

  const isUserAdmin = await isUserHashInstanceAdmin(
    { graphApi: graphApiClient },
    userAuthenticationInfo,
    { userAccountId: userAuthenticationInfo.actorId },
  );

  const { day: dayLimit, month: monthLimit } =
    usageCostLimit[isUserAdmin ? "admin" : "user"];

  if (lastDaysCost >= dayLimit) {
    return {
      code: StatusCode.ResourceExhausted,
      contents: [],
      message: `You have exceeded your daily usage limit of ${dayLimit}.`,
    };
  }
  if (lastThirtyDaysCost >= monthLimit) {
    return {
      code: StatusCode.ResourceExhausted,
      contents: [],
      message: `You have exceeded your monthly usage limit of ${monthLimit}.`,
    };
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

  const aiAssistantHasPermission = await graphApiClient
    .checkWebPermission(aiAssistantAccountId, ownedById, "update_entity")
    .then((resp) => resp.data.has_permission);

  if (!aiAssistantHasPermission) {
    const webMachineActorId = await getWebMachineActorId(
      { graphApi: graphApiClient },
      userAuthenticationInfo,
      {
        ownedById,
      },
    );

    await graphApiClient.modifyWebAuthorizationRelationships(
      webMachineActorId,
      [
        {
          operation: "create",
          resource: ownedById,
          relationAndSubject: {
            subject: {
              kind: "account",
              subjectId: aiAssistantAccountId,
            },
            relation: "entityCreator",
          },
        },
        {
          operation: "create",
          resource: ownedById,
          relationAndSubject: {
            subject: {
              kind: "account",
              subjectId: aiAssistantAccountId,
            },
            relation: "entityEditor",
          },
        },
      ],
    );
  }

  const entityTypes: Record<
    VersionedUrl,
    { isLink: boolean; schema: DereferencedEntityType }
  > = {};

  try {
    const { data: entityTypesSubgraph } =
      await graphApiClient.getEntityTypesByQuery(aiAssistantAccountId, {
        filter: {
          any: entityTypeIds.map((entityTypeId) => ({
            equal: [{ path: ["versionedUrl"] }, { parameter: entityTypeId }],
          })),
        },
        graphResolveDepths: {
          ...zeroedGraphResolveDepths,
          constrainsValuesOn: { outgoing: 255 },
          constrainsPropertiesOn: { outgoing: 255 },
          inheritsFrom: { outgoing: 255 },
        },
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: false,
      });

    for (const entityTypeId of entityTypeIds) {
      entityTypes[entityTypeId] = dereferenceEntityType(
        entityTypeId,
        entityTypesSubgraph as Subgraph,
      );
    }
  } catch (err) {
    return {
      code: StatusCode.Internal,
      contents: [],
      message: `Error retrieving and dereferencing entity types: ${
        (err as Error).message
      }`,
    };
  }

  const model = modelAliasToSpecificModel[modelAlias];

  const content = dedent(`
    Please infer as many entities as you can, with many properties as you can, from the following website content.
    The website page title is ${sourceTitle}, hosted at ${sourceUrl}.
    Pay particular attention to providing responses for entities which are most prominent in the page,
      and any which are mentioned in the title or URL – but include as many other entities as you can find also.
    Here is the website body content:
    ${textInput}
    
    Your detailed, comprehensive response, with as many entities and properties as possible:
  `);

  const response = await requestEntityInference({
    authentication: { machineActorId: aiAssistantAccountId },
    completionPayload: {
      max_tokens: maxTokens,
      messages: [
        systemMessage,
        {
          role: "user",
          content,
        },
      ],
      model,
      temperature,
    },
    createAs,
    entityTypes,
    graphApiClient,
    inferenceState: {
      iterationCount: 1,
      iterationEntitiesByTemporaryId: {},
      proposedEntitySummaryByTemporaryId: {},
      resultsByTemporaryId: {},
      usage: [],
    },
    ownedById,
    requestingUserAccountId: userAuthenticationInfo.actorId,
    requestUuid,
  });

  if (response.contents[0]?.usage) {
    const hashInstanceAdminGroupId = await getHashInstanceAdminAccountGroupId(
      { graphApi: graphApiClient },
      { actorId: aiAssistantAccountId },
    );

    const { inputUnitCount, outputUnitCount } =
      response.contents[0].usage.reduce(
        (acc, usageRecord) => {
          acc.inputUnitCount += usageRecord.prompt_tokens;
          acc.outputUnitCount += usageRecord.completion_tokens;
          return acc;
        },
        { inputUnitCount: 0, outputUnitCount: 0 },
      );

    const usageRecordMetadata = await createUsageRecord(
      { graphApi: graphApiClient },
      { actorId: aiAssistantAccountId },
      {
        serviceName: "OpenAI",
        featureName: model,
        userAccountId: userAuthenticationInfo.actorId,
        inputUnitCount,
        outputUnitCount,
      },
    );

    for (const entityResult of response.contents[0].results) {
      if (entityResult.status === "success") {
        await graphApiClient.createEntity(aiAssistantAccountId, {
          draft: false,
          properties: {},
          ownedById: userAuthenticationInfo.actorId,
          entityTypeId:
            entityResult.operation === "create"
              ? systemLinkEntityTypes.created.linkEntityTypeId
              : systemLinkEntityTypes.updated.linkEntityTypeId,
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

  return response;
};
