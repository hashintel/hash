import type { VersionedUrl } from "@blockprotocol/type-system";
import { typedEntries } from "@local/advanced-types/typed-entries";
import type { GraphApi } from "@local/hash-graph-client";
import type { ProposedEntity } from "@local/hash-isomorphic-utils/ai-inference-types";
import { type AccountId } from "@local/hash-subgraph";
import type { Status } from "@local/status";
import { StatusCode } from "@local/status";
import { Context } from "@temporalio/activity";
import dedent from "dedent";

import { logger } from "../shared/activity-logger";
import { getLlmResponse } from "../shared/get-llm-response";
import type {
  LlmMessage,
  LlmUserMessage,
} from "../shared/get-llm-response/llm-message";
import { getToolCallsFromLlmAssistantMessage } from "../shared/get-llm-response/llm-message";
import { logProgress } from "../shared/log-progress";
import { stringify } from "../shared/stringify";
import { inferEntitiesSystemPrompt } from "./infer-entities-system-prompt";
import type {
  DereferencedEntityTypesByTypeId,
  InferenceState,
} from "./inference-types";
import { validateProposedEntitiesByType } from "./persist-entities/generate-persist-entities-tools";
import { extractErrorMessage } from "./shared/extract-validation-failure-details";
import type { ProposedEntityToolCreationsByType } from "./shared/generate-propose-entities-tools";
import { generateProposeEntitiesTools } from "./shared/generate-propose-entities-tools";
import { mapSimplifiedPropertiesToProperties } from "./shared/map-simplified-properties-to-properties";

/**
 * This method is based on the logic from the existing `persistEntities` method, which
 * would ideally be reconciled to reduce code duplication. The primary difference
 * is that instead of persisting entities in the graph (by creating or updating an existing
 * entity), it pushes the entities to the `proposedEntities` array in the `InferenceState`.
 */
export const proposeEntities = async (params: {
  maxTokens?: number;
  firstUserMessage: string;
  previousMessages?: LlmMessage[];
  entityTypes: DereferencedEntityTypesByTypeId;
  inferenceState: InferenceState;
  validationActorId: AccountId;
  graphApiClient: GraphApi;
}): Promise<Status<InferenceState>> => {
  const {
    maxTokens,
    previousMessages,
    entityTypes,
    validationActorId,
    graphApiClient,
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
    generateProposeEntitiesTools(Object.values(entityTypes));

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

  const llmResponse = await getLlmResponse({
    model: "claude-3-opus-20240229",
    maxTokens,
    systemPrompt: inferEntitiesSystemPrompt,
    messages,
    tools,
    /**
     * We prefer consistency over creativity for the inference agent,
     * so set the `temperature` to `0`.
     */
    temperature: 0,
  });

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
          let proposedEntitiesByType: ProposedEntityToolCreationsByType;
          try {
            proposedEntitiesByType =
              toolCall.input as ProposedEntityToolCreationsByType;

            validateProposedEntitiesByType(proposedEntitiesByType, false);

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
                        /**
                         * We can't validate links at the moment because they will always fail validation,
                         * since they don't have references to existing entities.
                         * @todo remove this when we can update the `validateEntity` call to only check properties
                         */
                        if ("sourceEntityId" in proposedEntityOfType) {
                          return [];
                        }

                        const entityTypeId =
                          simplifiedEntityTypeIdMappings[
                            simplifiedEntityTypeId
                          ];

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

                        const properties = simplifiedProperties
                          ? mapSimplifiedPropertiesToProperties({
                              simplifiedProperties,
                              simplifiedPropertyTypeMappings,
                            })
                          : {};

                        await graphApiClient.validateEntity(validationActorId, {
                          entityTypes: [entityTypeId],
                          components: {
                            linkData: false,
                            numItems: false,
                            requiredProperties: false,
                          },
                          properties,
                        });

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
              typedEntries(proposedEntitiesByType).map(
                ([simplifiedEntityTypeId, entities]) => {
                  const entityTypeId =
                    simplifiedEntityTypeIdMappings[simplifiedEntityTypeId];

                  if (!entityTypeId) {
                    throw new Error(
                      `Could not find entity type id for simplified entity type id ${simplifiedEntityTypeId}`,
                    );
                  }

                  return [
                    entityTypeId,
                    entities.filter(
                      ({ entityId }) =>
                        // Don't include invalid entities
                        !invalidProposedEntities.some(
                          ({
                            invalidProposedEntity: {
                              entityId: invalidEntityId,
                            },
                          }) => invalidEntityId === entityId,
                        ) &&
                        // Ignore entities we've inferred in a previous iteration, otherwise we'll get duplicates
                        !inferenceState.proposedEntityCreationsByType[
                          entityTypeId
                        ]?.some(
                          (existingEntity) =>
                            existingEntity.entityId === entityId,
                        ),
                    ),
                  ];
                },
              ),
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
                      proposedEntity: {
                        ...entity,
                        localEntityId: entity.entityId.toString(),
                        entityTypeId: entityTypeId as VersionedUrl,
                        properties: entity.properties ?? {},
                        /** @todo: figure out why TS cannot infer that `entity` has `ProposedEntityLinkFields` */
                        sourceEntityLocalId:
                          "sourceEntityId" in entity
                            ? entity.sourceEntityId.toString()
                            : undefined,
                        targetEntityLocalId:
                          "targetEntityId" in entity
                            ? entity.targetEntityId.toString()
                            : undefined,
                      },
                      recordedAt: now,
                      type: "ProposedEntity",
                      stepId: Context.current().info.activityId,
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

            for (const proposedEntity of validProposedEntities) {
              inferenceState.inProgressEntityIds =
                inferenceState.inProgressEntityIds.filter(
                  (inProgressEntityId) =>
                    inProgressEntityId !== proposedEntity.entityId,
                );
            }

            inferenceState.proposedEntityCreationsByType = Object.entries(
              validProposedEntitiesByType,
            ).reduce(
              (prev, [simplifiedEntityTypeId, proposedEntitiesOfType]) => {
                const entityTypeId =
                  simplifiedEntityTypeIdMappings[simplifiedEntityTypeId];

                if (!entityTypeId) {
                  throw new Error(
                    `Could not find entity type id for simplified entity type id ${simplifiedEntityTypeId}`,
                  );
                }

                return {
                  ...prev,
                  [entityTypeId]: [
                    ...(prev[entityTypeId] ?? []),
                    ...proposedEntitiesOfType
                      .filter(
                        ({ entityId }) =>
                          // Don't include invalid entities
                          !invalidProposedEntities.some(
                            ({
                              invalidProposedEntity: {
                                entityId: invalidEntityId,
                              },
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
                      .map<ProposedEntity>(
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
                  ],
                };
              },
              inferenceState.proposedEntityCreationsByType,
            );

            if (retryMessageContentText) {
              retryMessageContent.push({
                type: "tool_result",
                content: retryMessageContentText,
                tool_use_id: toolCall.id,
                requiresOriginalContext: requiresOriginalContextForRetry,
              });
            }
          } catch (err) {
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
