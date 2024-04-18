import type { VersionedUrl } from "@blockprotocol/type-system";
import type { GraphApi } from "@local/hash-graph-client";
import { type AccountId } from "@local/hash-subgraph";
import type { Status } from "@local/status";
import { StatusCode } from "@local/status";
import dedent from "dedent";
import type OpenAI from "openai";

import { logger } from "../../shared/logger";
import { getLlmResponse } from "../shared/get-llm-response";
import { stringify } from "../shared/stringify";
import type {
  CompletionPayload,
  DereferencedEntityTypesByTypeId,
  InferenceState,
} from "./inference-types";
import { validateProposedEntitiesByType } from "./persist-entities/generate-persist-entities-tools";
import { extractErrorMessage } from "./shared/extract-validation-failure-details";
import { firstUserMessageIndex } from "./shared/first-user-message-index";
import type { ProposedEntityCreationsByType } from "./shared/generate-propose-entities-tools";
import { generateProposeEntitiesTools } from "./shared/generate-propose-entities-tools";

/**
 * This method is based on the logic from the existing `persistEntities` method, which
 * would ideally be reconciled to reduce code duplication. The primary difference
 * is that instead of persisting entities in the graph (by creating or updating an existing
 * entity), it pushes the entities to the `proposedEntities` array in the `InferenceState`.
 */
export const proposeEntities = async (params: {
  completionPayload: CompletionPayload;
  entityTypes: DereferencedEntityTypesByTypeId;
  inferenceState: InferenceState;
  validationActorId: AccountId;
  graphApiClient: GraphApi;
  originalPromptMessages: OpenAI.ChatCompletionMessageParam[];
}): Promise<Status<InferenceState>> => {
  const {
    completionPayload,
    entityTypes,
    validationActorId,
    graphApiClient,
    inferenceState,
    originalPromptMessages,
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
        completionPayload.messages,
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

  const tools = generateProposeEntitiesTools(Object.values(entityTypes));

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

  const nextMessage = {
    role: "user",
    content: dedent(
      `Please make calls to ${innerMessage}. Remember to include as many properties as you can find matching values for in the website content.
      If you can't find a value for a specified property, just omit it – don't pass 'null' as a value.`,
    ),
  } as const;

  logger.debug(`Next message to model: ${stringify(nextMessage)}`);

  const llmResponse = await getLlmResponse({
    ...completionPayload,
    messages: [...completionPayload.messages, nextMessage],
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

  const { stopReason, usage, parsedToolCalls } = llmResponse;

  const { message } = llmResponse.choices[0];

  const latestUsage = [...usageFromLastIteration, usage];

  inferenceState.usage = latestUsage;

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
    logger.debug(
      `Retrying with additional messages: ${stringify(retryMessages)}`,
    );

    const newMessages = [
      ...originalPromptMessages.map((msg, index) =>
        index === firstUserMessageIndex && !requiresOriginalContext
          ? {
              ...msg,
              content:
                "I provided you text to infer entities, and you responded below – please see further instructions after your message.",
            }
          : msg,
      ),
      message,
      ...retryMessages,
    ];

    return proposeEntities({
      ...params,
      inferenceState: {
        ...inferenceState,
        iterationCount: iterationCount + 1,
      },
      completionPayload: {
        ...completionPayload,
        messages: newMessages,
      },
    });
  };

  switch (stopReason) {
    case "stop": {
      const errorMessage = `AI Model returned 'stop' finish reason, with message: ${
        message.content ?? "no message"
      }`;

      logger.error(errorMessage);

      return {
        code: StatusCode.Unknown,
        contents: [inferenceState],
        message:
          message.content ?? "No entities could be inferred from the page.",
      };
    }

    case "length": {
      logger.error(
        `AI Model returned 'length' finish reason on attempt ${iterationCount}.`,
      );

      const toolCallId = parsedToolCalls[0]?.id;

      if (!toolCallId) {
        return {
          code: StatusCode.ResourceExhausted,
          contents: [inferenceState],
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

    case "content_filter": {
      logger.error(
        `The content filter was triggered on attempt ${iterationCount} with input: ${stringify(
          completionPayload.messages,
        )}, `,
      );

      return {
        code: StatusCode.InvalidArgument,
        contents: [inferenceState],
        message: "The content filter was triggered",
      };
    }

    case "tool_use": {
      const retryMessages: ((
        | OpenAI.ChatCompletionUserMessageParam
        | OpenAI.ChatCompletionToolMessageParam
      ) & { requiresOriginalContext: boolean })[] = [];

      for (const toolCall of parsedToolCalls) {
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

            retryMessages.push({
              content:
                "You provided an invalid argument to abandon_entities. Please try again",
              requiresOriginalContext: true,
              role: "tool",
              tool_call_id: toolCall.id,
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
          let proposedEntitiesByType: ProposedEntityCreationsByType;
          try {
            proposedEntitiesByType =
              toolCall.input as ProposedEntityCreationsByType;

            validateProposedEntitiesByType(proposedEntitiesByType, false);

            let retryMessageContent = "";
            let requiresOriginalContextForRetry = false;

            /**
             * Check if any proposed entities are invalid according to the Graph API,
             * to prevent a validation error when creating the entity in the graph.
             */
            const invalidProposedEntities = await Promise.all(
              Object.entries(proposedEntitiesByType).map(
                async ([entityTypeId, proposedEntitiesOfType]) => {
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

                        await graphApiClient.validateEntity(validationActorId, {
                          entityTypes: [entityTypeId],
                          components: {
                            linkData: false,
                            numItems: false,
                            requiredProperties: false,
                          },
                          properties: proposedEntityOfType.properties ?? {},
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
              retryMessageContent += dedent(`
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

            const validProposedEntities = Object.values(proposedEntitiesByType)
              .flat()
              .filter(
                ({ entityId }) =>
                  !invalidProposedEntities.some(
                    ({
                      invalidProposedEntity: { entityId: invalidEntityId },
                    }) => invalidEntityId === entityId,
                  ),
              );

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
              proposedEntitiesByType,
            ).reduce(
              (prev, [entityTypeId, proposedEntitiesOfType]) => ({
                ...prev,
                [entityTypeId]: [
                  ...(prev[entityTypeId as VersionedUrl] ?? []),
                  ...proposedEntitiesOfType.filter(
                    ({ entityId }) =>
                      // Don't include invalid entities
                      !invalidProposedEntities.some(
                        ({
                          invalidProposedEntity: { entityId: invalidEntityId },
                        }) => invalidEntityId === entityId,
                      ) &&
                      // Ignore entities we've inferred in a previous iteration, otherwise we'll get duplicates
                      !inferenceState.proposedEntityCreationsByType[
                        entityTypeId as VersionedUrl
                      ]?.some(
                        (existingEntity) =>
                          existingEntity.entityId === entityId,
                      ),
                  ),
                ],
              }),
              inferenceState.proposedEntityCreationsByType,
            );

            if (retryMessageContent) {
              retryMessages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: retryMessageContent,
                requiresOriginalContext: requiresOriginalContextForRetry,
              });
            }
          } catch (err) {
            logger.error(
              `Model provided invalid argument to create_entities function. Argument provided: ${stringify(
                toolCall.input,
              )}`,
            );

            retryMessages.push({
              content:
                "You provided an invalid argument to create_entities. Please try again",
              requiresOriginalContext: true,
              role: "tool",
              tool_call_id: toolCall.id,
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
        retryMessages.push({
          content:
            "There are other entities you haven't yet provided details for",
          role: "user",
          requiresOriginalContext: true,
        });
      }

      if (retryMessages.length === 0) {
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

      const toolCallsWithoutProblems = parsedToolCalls.filter(
        (toolCall) =>
          !retryMessages.some(
            (msg) => msg.role === "tool" && msg.tool_call_id === toolCall.id,
          ),
      );

      /**
       * We require exactly one response to each tool call for subsequent messages – this fallback ensures that.
       * They must come before any other messages.
       */
      retryMessages.unshift(
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

  const errorMessage = `AI Model returned unhandled finish reason: ${stopReason}`;
  logger.error(errorMessage);

  return {
    code: StatusCode.Internal,
    contents: [inferenceState],
    message: errorMessage,
  };
};
