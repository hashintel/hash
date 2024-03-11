import type { VersionedUrl } from "@blockprotocol/type-system";
import type { GraphApi } from "@local/hash-graph-client";
import type { AccountId } from "@local/hash-subgraph";
import type { Status} from "@local/status";
import { StatusCode } from "@local/status";
import dedent from "dedent";
import type OpenAI from "openai";

import type {
  CompletionPayload,
  DereferencedEntityTypesByTypeId,
  InferenceState,
} from "./inference-types";
import { log } from "./log";
import type {
  ProposedEntityCreationsByType} from "./persist-entities/generate-persist-entities-tools";
import {
  validateProposedEntitiesByType,
} from "./persist-entities/generate-persist-entities-tools";
import { generateProposeEntitiesTools } from "./propose-entities/generate-propose-entities-tools";
import { extractErrorMessage } from "./shared/extract-validation-failure-details";
import { firstUserMessageIndex } from "./shared/first-user-message-index";
import { getOpenAiResponse } from "./shared/get-open-ai-response";
import { stringify } from "./stringify";

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
    log(
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
      log(
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

  log(
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

  log(`Next message to model: ${stringify(nextMessage)}`);

  const openApiPayload: OpenAI.ChatCompletionCreateParams = {
    ...completionPayload,
    messages: [...completionPayload.messages, nextMessage],
    tools,
  };

  const openAiResponse = await getOpenAiResponse(openApiPayload);

  if (openAiResponse.code !== StatusCode.Ok) {
    return {
      ...openAiResponse,
      contents: [inferenceState],
    };
  }

  const { response, usage } = openAiResponse.contents[0]!;

  const { finish_reason, message } = response;

  const toolCalls = message.tool_calls;

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
    log(`Retrying with additional messages: ${stringify(retryMessages)}`);

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

  switch (finish_reason) {
    case "stop": {
      const errorMessage = `AI Model returned 'stop' finish reason, with message: ${
        message.content ?? "no message"
      }`;

      log(errorMessage);

      return {
        code: StatusCode.Unknown,
        contents: [inferenceState],
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

    case "content_filter":
      log(
        `The content filter was triggered on attempt ${iterationCount} with input: ${stringify(
          completionPayload.messages,
        )}, `,
      );

      return {
        code: StatusCode.InvalidArgument,
        contents: [inferenceState],
        message: "The content filter was triggered",
      };

    case "tool_calls": {
      if (!toolCalls) {
        const errorMessage =
          "AI Model returned 'tool_calls' finish reason with no tool calls";

        log(`${errorMessage}. Message: ${stringify(message)}`);

        return {
          code: StatusCode.Internal,
          contents: [inferenceState],
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

        if (functionName === "abandon_entities") {
          // The model is giving up on these entities

          // First, check the argument is valid
          const abandonedEntityIds = JSON.parse(
            modelProvidedArgument,
          ) as unknown;
          if (
            !Array.isArray(abandonedEntityIds) ||
            !abandonedEntityIds.every((item) => typeof item === "number")
          ) {
            log(
              `Model provided invalid argument to abandon_entities function. Argument provided: ${stringify(
                modelProvidedArgument,
              )}`,
            );

            retryMessages.push({
              content:
                "You provided an invalid argument to abandon_entities. Please try again",
              requiresOriginalContext: true,
              role: "tool",
              tool_call_id: toolCallId,
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

        if (functionName === "create_entities") {
          let proposedEntitiesByType: ProposedEntityCreationsByType;
          try {
            proposedEntitiesByType = JSON.parse(
              modelProvidedArgument,
            ) as ProposedEntityCreationsByType;
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
                        await graphApiClient.validateEntity(validationActorId, {
                          entityType: entityTypeId,
                          profile: "draft",
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

            log(
              `Proposed ${validProposedEntities.length} valid additional entities.`,
            );
            log(
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
                      !invalidProposedEntities.some(
                        ({
                          invalidProposedEntity: { entityId: invalidEntityId },
                        }) => invalidEntityId === entityId,
                      ),
                  ),
                ],
              }),
              inferenceState.proposedEntityCreationsByType,
            );

            if (retryMessageContent) {
              retryMessages.push({
                role: "tool",
                tool_call_id: toolCallId,
                content: retryMessageContent,
                requiresOriginalContext: requiresOriginalContextForRetry,
              });
            }
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
        }
      }

      const remainingEntitySummaries =
        inferenceState.proposedEntitySummaries.filter(
          (entity) => !entity.takenFromQueue,
        );

      if (remainingEntitySummaries.length > 0) {
        log(
          `${remainingEntitySummaries.length} entities remain to be inferred, continuing.`,
        );
        retryMessages.push({
          content:
            "There are other entities you haven't yet provided details for",
          role: "user",
          requiresOriginalContext: true,
        });
      }

      if (retryMessages.length === 0) {
        log(
          `Returning proposed entities: ${stringify(inferenceState.proposedEntityCreationsByType)}`,
        );

        return {
          code: StatusCode.Ok,
          contents: [inferenceState],
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

  const errorMessage = `AI Model returned unhandled finish reason: ${finish_reason}`;
  log(errorMessage);

  return {
    code: StatusCode.Internal,
    contents: [inferenceState],
    message: errorMessage,
  };
};
