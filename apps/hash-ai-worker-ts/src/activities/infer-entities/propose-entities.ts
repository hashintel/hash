import type { EntityUuid, VersionedUrl } from "@blockprotocol/type-system";
import { entityIdFromComponents } from "@blockprotocol/type-system";
import { typedEntries } from "@local/advanced-types/typed-entries";
import { mergePropertyObjectAndMetadata } from "@local/hash-graph-sdk/entity";
import type { DeprecatedProposedEntity } from "@local/hash-isomorphic-utils/ai-inference-types";
import type { Status } from "@local/status";
import { StatusCode } from "@local/status";
import { Context } from "@temporalio/activity";
import dedent from "dedent";

import { logger } from "../shared/activity-logger.js";
import { getFlowContext } from "../shared/get-flow-context.js";
import { getLlmResponse } from "../shared/get-llm-response.js";
import type {
  LlmMessage,
  LlmUserMessage,
} from "../shared/get-llm-response/llm-message.js";
import { getToolCallsFromLlmAssistantMessage } from "../shared/get-llm-response/llm-message.js";
import { graphApiClient } from "../shared/graph-api-client.js";
import { logProgress } from "../shared/log-progress.js";
import { stringify } from "../shared/stringify.js";
import { inferEntitiesSystemPrompt } from "./infer-entities-system-prompt.js";
import type {
  DereferencedEntityTypesByTypeId,
  InferenceState,
} from "./inference-types.js";
import { validateProposedEntitiesByType } from "./persist-entities/generate-persist-entities-tools.js";
import { extractErrorMessage } from "./shared/extract-validation-failure-details.js";
import type { ProposedEntityToolCreationsByType } from "./shared/generate-propose-entities-tools.js";
import { generateProposeEntitiesTools } from "./shared/generate-propose-entities-tools.js";
import { mapSimplifiedPropertiesToProperties } from "./shared/map-simplified-properties-to-properties.js";

/**
 * This method is used by the 'infer-entities-from-web-page-activity', which is used by the browser plugin inference flow.
 * @todo H-3163 make the browser plugin Flow use the same 'claims first, then entity proposals' system as other flows.
 */
export const proposeEntities = async (params: {
  maxTokens?: number;
  firstUserMessage: string;
  previousMessages?: LlmMessage[];
  entityTypes: DereferencedEntityTypesByTypeId;
  inferenceState: InferenceState;
}): Promise<Status<InferenceState>> => {
  const {
    maxTokens,
    previousMessages,
    entityTypes,
    inferenceState,
    firstUserMessage,
  } = params;

  const {
    iterationCount,
    inProgressEntityIds,
    proposedEntitySummaries,
    usage: usageFromLastIteration,
  } = inferenceState;

  if (iterationCount > 30) {
    logger.info(
      `Model reached maximum number of iterations. Messages: ${stringify(
        previousMessages,
      )}`,
    );

    return {
      code: StatusCode.ResourceExhausted,
      contents: [inferenceState],
      message: `Maximum number of iterations reached.`,
    };
  }

  for (const inProgressEntityId of inProgressEntityIds) {
    const inProgressEntity = proposedEntitySummaries.find(
      (entity) => entity.entityId === inProgressEntityId,
    );
    if (inProgressEntity) {
      inProgressEntity.takenFromQueue = true;
    } else {
      logger.error(
        `Could not find in progress entity with id ${inProgressEntityId} in proposedEntitySummaries: ${stringify(
          proposedEntitySummaries,
        )}`,
      );
    }
  }

  /**
   * Only ask the model to provide full details for maximum 10 entities at a time.
   * We may have carried some over from the previous iteration if there were validation failures.
   *
   * @todo vary the number of entities asked for based on the likely size of their properties (how many, value type)
   */
  const spaceInQueue = 10 - inProgressEntityIds.length;
  for (let i = 0; i < spaceInQueue; i++) {
    const nextProposedEntity = proposedEntitySummaries.find(
      (entity) => !entity.takenFromQueue,
    );
    if (!nextProposedEntity) {
      break;
    }
    inProgressEntityIds.push(nextProposedEntity.entityId);
    nextProposedEntity.takenFromQueue = true;
  }

  logger.info(
    `Iteration ${iterationCount} begun, seeking details on entities with temporary ids ${inProgressEntityIds.join(
      ", ",
    )}.`,
  );

  const { tools, simplifiedEntityTypeIdMappings } =
    generateProposeEntitiesTools({
      entityTypes: Object.values(entityTypes),
    });

  const entitiesToUpdate = inProgressEntityIds.filter(
    (inProgressEntityId) =>
      inferenceState.resultsByTemporaryId[inProgressEntityId]?.status ===
      "update-candidate",
  );

  const entitiesToCreate = inProgressEntityIds.filter(
    (inProgressEntityId) => !entitiesToUpdate.includes(inProgressEntityId),
  );

  const createMessage =
    entitiesToCreate.length > 0
      ? `create_entities with temporary id ${entitiesToCreate.join(", ")}`
      : null;
  const updateMessage =
    entitiesToUpdate.length > 0
      ? `update_entities with temporary ids ${entitiesToUpdate.join(", ")}`
      : null;
  const innerMessage = [createMessage, updateMessage]
    .filter(Boolean)
    .join(" and ");

  const instructions = dedent(`
    Please make calls to ${innerMessage}.
    Remember to include as many properties as you can find matching values for in the website content.
    If you can't find a value for a specified property, just omit it – don't pass 'null' as a value.
  `);

  const messages: LlmMessage[] =
    previousMessages && previousMessages.length > 1
      ? [
          ...previousMessages.slice(0, -1),
          {
            role: "user",
            content: [
              ...(previousMessages[previousMessages.length - 1]!
                .content as LlmUserMessage["content"]),
              {
                type: "text",
                text: instructions,
              },
            ],
          },
        ]
      : [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: dedent(`
                ${firstUserMessage}
                ${instructions}
              `),
              },
            ],
          },
        ];

  logger.debug(`Next messages to model: ${stringify(messages)}`);

  const { userAuthentication, flowEntityId, stepId, webId } =
    await getFlowContext();

  const llmResponse = await getLlmResponse(
    {
      model: "gpt-4o-2024-08-06",
      maxTokens,
      systemPrompt: inferEntitiesSystemPrompt,
      messages,
      tools,
      /**
       * We prefer consistency over creativity for the inference agent,
       * so set the `temperature` to `0`.
       */
      temperature: 0,
    },
    {
      customMetadata: {
        stepId,
        taskName: "propose-entities",
      },
      userAccountId: userAuthentication.actorId,
      graphApiClient,
      incurredInEntities: [{ entityId: flowEntityId }],
      webId,
    },
  );

  if (llmResponse.status !== "ok") {
    return {
      code: StatusCode.Internal,
      contents: [inferenceState],
    };
  }

  const { stopReason, usage, message } = llmResponse;

  const latestUsage = [...usageFromLastIteration, usage];

  inferenceState.usage = latestUsage;

  const retryWithMessages = ({
    retryMessageContent,
    requiresOriginalContext,
  }: {
    retryMessageContent: LlmUserMessage["content"];
    requiresOriginalContext: boolean;
  }) => {
    logger.debug(
      `Retrying with additional message: ${stringify(retryMessageContent)}`,
    );

    const newMessages: LlmMessage[] = [
      requiresOriginalContext
        ? {
            role: "user",
            content: [{ type: "text", text: firstUserMessage }],
          }
        : {
            role: "user",
            content: [
              {
                type: "text",
                text: "I provided you text to infer entities, and you responded below – please see further instructions after your message.",
              },
            ],
          },
      {
        role: "assistant",
        content: message.content,
      },
      {
        role: "user",
        content: retryMessageContent,
      },
    ];

    return proposeEntities({
      ...params,
      inferenceState: {
        ...inferenceState,
        iterationCount: iterationCount + 1,
      },
      previousMessages: newMessages,
    });
  };

  const toolCalls = getToolCallsFromLlmAssistantMessage({ message });

  switch (stopReason) {
    case "stop": {
      const errorMessage = `AI Model returned 'stop' finish reason, with message content: ${stringify(
        message.content,
      )}`;

      logger.error(errorMessage);

      return {
        code: StatusCode.Unknown,
        contents: [inferenceState],
        message:
          message.content.length > 0
            ? stringify(message.content)
            : "No entities could be inferred from the page.",
      };
    }

    case "length": {
      logger.error(
        `AI Model returned 'length' finish reason on attempt ${iterationCount}.`,
      );

      const toolCallId = toolCalls[0]?.id;

      if (!toolCallId) {
        return {
          code: StatusCode.ResourceExhausted,
          contents: [inferenceState],
          message:
            "The maximum amount of tokens was reached before the model returned a completion, with no tool call to respond to.",
        };
      }

      return retryWithMessages({
        retryMessageContent: [
          {
            type: "tool_result",
            tool_use_id: toolCallId,
            // @todo see if we can get the model to respond continuing off the previous JSON argument to the function call
            content:
              "Your previous response was cut off for length – please respond again with a shorter function call.",
          },
        ],
        requiresOriginalContext: true,
      });
    }

    case "content_filter": {
      logger.error(
        `The content filter was triggered on attempt ${iterationCount} with input: ${stringify(
          message.content,
        )}, `,
      );

      return {
        code: StatusCode.InvalidArgument,
        contents: [inferenceState],
        message: "The content filter was triggered",
      };
    }

    case "tool_use": {
      const retryMessageContent: (LlmUserMessage["content"][number] & {
        requiresOriginalContext: boolean;
      })[] = [];

      for (const toolCall of toolCalls) {
        if (toolCall.name === "abandon_entities") {
          // The model is giving up on these entities

          // First, check the argument is valid
          const abandonedEntityIds = toolCall.input;
          if (
            !Array.isArray(abandonedEntityIds) ||
            !abandonedEntityIds.every((item) => typeof item === "number")
          ) {
            logger.error(
              `Model provided invalid argument to abandon_entities function. Argument provided: ${stringify(
                toolCall.input,
              )}`,
            );

            retryMessageContent.push({
              type: "tool_result",
              content:
                "You provided an invalid argument to abandon_entities. Please try again",
              requiresOriginalContext: true,
              tool_use_id: toolCall.id,
            });
            continue;
          }

          // Remove the abandoned entities from the list of entities in progress
          inferenceState.inProgressEntityIds =
            inferenceState.inProgressEntityIds.filter(
              (inProgressEntityId) =>
                !abandonedEntityIds.includes(inProgressEntityId),
            );
        }

        if (toolCall.name === "create_entities") {
          const proposedEntitiesByType =
            toolCall.input as ProposedEntityToolCreationsByType;

          try {
            validateProposedEntitiesByType(proposedEntitiesByType, false);
          } catch {
            logger.error(
              `Model provided invalid argument to create_entities function. Argument provided: ${stringify(
                toolCall.input,
              )}`,
            );

            retryMessageContent.push({
              type: "tool_result",
              content:
                "You provided an invalid argument to create_entities. Please try again",
              requiresOriginalContext: true,
              tool_use_id: toolCall.id,
            });
            continue;
          }

          let retryMessageContentText = "";
          let requiresOriginalContextForRetry = false;

          /**
           * Check if any proposed entities are invalid according to the Graph API,
           * to prevent a validation error when creating the entity in the graph.
           */
          const invalidProposedEntities = await Promise.all(
            Object.entries(proposedEntitiesByType).map(
              async ([simplifiedEntityTypeId, proposedEntitiesOfType]) => {
                const invalidProposedEntitiesOfType = await Promise.all(
                  proposedEntitiesOfType.map(async (proposedEntityOfType) => {
                    try {
                      const entityTypeId =
                        simplifiedEntityTypeIdMappings[simplifiedEntityTypeId];

                      if (!entityTypeId) {
                        throw new Error(
                          `Could not find entity type id for simplified entity type id ${simplifiedEntityTypeId}`,
                        );
                      }

                      const { simplifiedPropertyTypeMappings } =
                        entityTypes[entityTypeId] ?? {};

                      if (!simplifiedPropertyTypeMappings) {
                        throw new Error(
                          `Could not find simplified property type mappings for entity type id ${entityTypeId}`,
                        );
                      }

                      const { properties: simplifiedProperties } =
                        proposedEntityOfType;

                      const properties = mergePropertyObjectAndMetadata(
                        simplifiedProperties
                          ? mapSimplifiedPropertiesToProperties({
                              simplifiedProperties,
                              simplifiedPropertyTypeMappings,
                            })
                          : {},
                        undefined,
                      );

                      await graphApiClient.validateEntity(
                        userAuthentication.actorId,
                        {
                          entityTypes: [entityTypeId],
                          components: {
                            linkData: false,
                            numItems: false,
                            requiredProperties: false,
                          },
                          properties,
                        },
                      );

                      return [];
                    } catch (error) {
                      const invalidReason = `${extractErrorMessage(error)}.`;

                      return {
                        invalidProposedEntity: proposedEntityOfType,
                        invalidReason,
                      };
                    }
                  }),
                ).then((invalidProposals) => invalidProposals.flat());

                return invalidProposedEntitiesOfType;
              },
            ),
          ).then((invalidProposals) => invalidProposals.flat());

          if (invalidProposedEntities.length > 0) {
            retryMessageContentText += dedent(`
              Some of the entities you suggested for creation were invalid. Please review their properties and try again.
              The entities you should review and make a 'create_entities' call for are:
              ${invalidProposedEntities
                .map(
                  ({ invalidProposedEntity, invalidReason }) => `
                your proposed entity: ${stringify(invalidProposedEntity)}
                invalid reason: ${invalidReason}
              `,
                )
                .join("\n")}
            `);
            requiresOriginalContextForRetry = true;
          }

          const validProposedEntitiesByType = Object.fromEntries(
            typedEntries(proposedEntitiesByType).map<
              [VersionedUrl, DeprecatedProposedEntity[]]
            >(([simplifiedEntityTypeId, entities]) => {
              const entityTypeId =
                simplifiedEntityTypeIdMappings[simplifiedEntityTypeId];

              if (!entityTypeId) {
                throw new Error(
                  `Could not find entity type id for simplified entity type id ${simplifiedEntityTypeId}`,
                );
              }

              return [
                entityTypeId,
                entities
                  .filter(
                    ({ entityId }) =>
                      // Don't include invalid entities
                      !invalidProposedEntities.some(
                        ({
                          invalidProposedEntity: { entityId: invalidEntityId },
                        }) => invalidEntityId === entityId,
                      ) &&
                      // Ignore entities we've inferred in a previous iteration, otherwise we'll get duplicates
                      !inferenceState.proposedEntityCreationsByType[
                        entityTypeId
                      ]?.some(
                        (existingEntity) =>
                          existingEntity.entityId === entityId,
                      ),
                  )
                  .map(
                    ({
                      properties: simplifiedProperties,
                      ...proposedEntity
                    }) => {
                      const { simplifiedPropertyTypeMappings } =
                        entityTypes[entityTypeId] ?? {};

                      if (!simplifiedPropertyTypeMappings) {
                        throw new Error(
                          `Could not find simplified property type mappings for entity type id ${entityTypeId}`,
                        );
                      }

                      const properties = simplifiedProperties
                        ? mapSimplifiedPropertiesToProperties({
                            simplifiedProperties,
                            simplifiedPropertyTypeMappings,
                          })
                        : {};

                      return {
                        ...proposedEntity,
                        properties,
                      };
                    },
                  ),
              ];
            }),
          );

          const validProposedEntities = Object.values(
            validProposedEntitiesByType,
          ).flat();

          const now = new Date().toISOString();

          if (validProposedEntities.length > 0) {
            logProgress(
              typedEntries(validProposedEntitiesByType).flatMap(
                ([entityTypeId, entities]) =>
                  entities.map((entity) => ({
                    isUpdateToExistingProposal: false,
                    proposedEntity: {
                      ...entity,
                      claims: {
                        isSubjectOf: [],
                        isObjectOf: [],
                      },
                      localEntityId: entityIdFromComponents(
                        webId,
                        /**
                         * @todo H-3163: this is not a valid UUID, but it's only used in a progress log so won't be used
                         *    as the entity's UUID when persisting it. this file in its entirety will be removed as part of H-3163
                         *    when we migrate the browser plugin flows to use the same claims -> entity process as other flows.
                         *    The same applies to the sourceEntityId and targetEntityId below.
                         */
                        entity.entityId.toString() as EntityUuid,
                      ),
                      entityTypeIds: [entityTypeId as VersionedUrl],
                      properties: entity.properties ?? {},
                      propertyMetadata: { value: {} },
                      sourceEntityId:
                        "sourceEntityId" in entity
                          ? {
                              kind: "proposed-entity",
                              localId: entityIdFromComponents(
                                webId,
                                entity.sourceEntityId.toString() as EntityUuid,
                              ),
                            }
                          : undefined,
                      targetEntityId:
                        "targetEntityId" in entity
                          ? {
                              kind: "proposed-entity",
                              localId: entityIdFromComponents(
                                webId,
                                entity.targetEntityId.toString() as EntityUuid,
                              ),
                            }
                          : undefined,
                    },
                    recordedAt: now,
                    type: "ProposedEntity",
                    stepId: Context.current().info.activityId,
                    workerType: "Link explorer",
                    parentInstanceId: null,
                    workerInstanceId: "browser-plugin-flow",
                    toolCallId: null,
                  })),
              ),
            );
          }

          logger.info(
            `Proposed ${validProposedEntities.length} valid additional entities.`,
          );
          logger.info(
            `Proposed ${invalidProposedEntities.length} invalid additional entities.`,
          );

          /**
           * Remove the valid entities from the list of entities in progress.
           */
          inferenceState.inProgressEntityIds =
            inferenceState.inProgressEntityIds.filter(
              (inProgressEntityId) =>
                !validProposedEntities.some(
                  ({ entityId }) => entityId === inProgressEntityId,
                ),
            );

          /**
           * The agent may have inferred valid entities that we didn't yet ask it for,
           * in which case we need to mark them as taken from the queue so we don't
           * ask for them again.
           */
          inferenceState.proposedEntitySummaries =
            inferenceState.proposedEntitySummaries.map(
              (proposedEntitySummary) => {
                if (
                  !proposedEntitySummary.takenFromQueue &&
                  validProposedEntities.some(
                    ({ entityId }) =>
                      entityId === proposedEntitySummary.entityId,
                  )
                ) {
                  return {
                    ...proposedEntitySummary,
                    takenFromQueue: true,
                  };
                }
                return proposedEntitySummary;
              },
            );

          inferenceState.proposedEntityCreationsByType = Object.entries(
            validProposedEntitiesByType,
          ).reduce((prev, [entityTypeId, proposedEntitiesOfType]) => {
            return {
              ...prev,
              [entityTypeId]: [
                ...(prev[entityTypeId as VersionedUrl] ?? []),
                ...proposedEntitiesOfType,
              ],
            };
          }, inferenceState.proposedEntityCreationsByType);

          if (retryMessageContentText) {
            retryMessageContent.push({
              type: "tool_result",
              content: retryMessageContentText,
              tool_use_id: toolCall.id,
              requiresOriginalContext: requiresOriginalContextForRetry,
            });
          }
        }
      }

      const remainingEntitySummaries =
        inferenceState.proposedEntitySummaries.filter(
          (entity) => !entity.takenFromQueue,
        ).length + inferenceState.inProgressEntityIds.length;

      if (remainingEntitySummaries > 0) {
        logger.info(
          `${remainingEntitySummaries} entities remain to be inferred, continuing.`,
        );
        retryMessageContent.push({
          type: "text",
          text: "There are other entities you haven't yet provided details for",
          requiresOriginalContext: true,
        });
      }

      if (retryMessageContent.length === 0) {
        logger.info(
          `Returning proposed entities: ${stringify(
            inferenceState.proposedEntityCreationsByType,
          )}`,
        );

        return {
          code: StatusCode.Ok,
          contents: [inferenceState],
        };
      }

      const toolCallsWithoutProblems = toolCalls.filter(
        (toolCall) =>
          !retryMessageContent.some(
            (content) =>
              typeof content === "object" &&
              content.type === "tool_result" &&
              content.tool_use_id === toolCall.id,
          ),
      );

      /**
       * We require exactly one response to each tool call for subsequent messages – this fallback ensures that.
       * They must come before any other messages.
       */
      retryMessageContent.unshift(
        ...toolCallsWithoutProblems.map((toolCall) => ({
          type: "tool_result" as const,
          tool_use_id: toolCall.id,
          content: "No problems found with this tool call.",
          requiresOriginalContext: false,
        })),
      );

      return retryWithMessages({
        retryMessageContent: retryMessageContent.map(
          ({ requiresOriginalContext: _, ...content }) => content,
        ),
        requiresOriginalContext: retryMessageContent.some(
          (retryMessage) => retryMessage.requiresOriginalContext,
        ),
      });
    }
  }

  const errorMessage = `AI Model returned unhandled finish reason: ${stopReason}`;
  logger.error(errorMessage);

  return {
    code: StatusCode.Internal,
    contents: [inferenceState],
    message: errorMessage,
  };
};
