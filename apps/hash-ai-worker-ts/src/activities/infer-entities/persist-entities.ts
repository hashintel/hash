import type { VersionedUrl } from "@blockprotocol/type-system/slim";
import { createGraphChangeNotification } from "@local/hash-backend-utils/notifications";
import type { GraphApi } from "@local/hash-graph-client";
import type { InferEntitiesReturn } from "@local/hash-isomorphic-utils/ai-inference-types";
import type { AccountId, Entity, OwnedById } from "@local/hash-subgraph";
import { StatusCode } from "@local/status";
import dedent from "dedent";
import type OpenAI from "openai";

import { getResultsFromInferenceState } from "./get-results-from-inference-state";
import type {
  CompletionPayload,
  DereferencedEntityTypesByTypeId,
  InferenceState,
} from "./inference-types";
import { log } from "./log";
import { createEntities } from "./persist-entities/create-entities";
import type {
  ProposedEntityCreationsByType,
  ProposedEntityUpdatesByType,
} from "./persist-entities/generate-persist-entities-tools";
import {
  generatePersistEntitiesTools,
  validateProposedEntitiesByType,
} from "./persist-entities/generate-persist-entities-tools";
import { updateEntities } from "./persist-entities/update-entities";
import { firstUserMessageIndex } from "./shared/first-user-message-index";
import { getOpenAiResponse } from "./shared/get-open-ai-response";
import { stringify } from "./stringify";

export const persistEntities = async (params: {
  authentication: { machineActorId: AccountId };
  createAs: "draft" | "live";
  completionPayload: CompletionPayload;
  entityTypes: DereferencedEntityTypesByTypeId;
  inferenceState: InferenceState;
  graphApiClient: GraphApi;
  originalPromptMessages: OpenAI.ChatCompletionMessageParam[];
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
    originalPromptMessages,
    ownedById,
    requestingUserAccountId,
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
      contents: [
        {
          results: getResultsFromInferenceState(inferenceState),
          usage: inferenceState.usage,
        },
      ],
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

  const entityTypeIds = Object.keys(entityTypes);

  const tools = generatePersistEntitiesTools(Object.values(entityTypes));

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
      contents: [
        {
          results: getResultsFromInferenceState(inferenceState),
          usage: inferenceState.usage,
        },
      ],
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

    return persistEntities({
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
            results: getResultsFromInferenceState(inferenceState),
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
              results: getResultsFromInferenceState(inferenceState),
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

    case "content_filter": {
      log(
        `The content filter was triggered on attempt ${iterationCount} with input: ${stringify(
          completionPayload.messages,
        )}, `,
      );

      return {
        code: StatusCode.InvalidArgument,
        contents: [
          {
            results: getResultsFromInferenceState(inferenceState),
            usage: latestUsage,
          },
        ],
        message: "The content filter was triggered",
      };
    }

    case "tool_calls": {
      if (!toolCalls) {
        const errorMessage =
          "AI Model returned 'tool_calls' finish reason with no tool calls";

        log(`${errorMessage}. Message: ${stringify(message)}`);

        return {
          code: StatusCode.Internal,
          contents: [
            {
              results: getResultsFromInferenceState(inferenceState),
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
              inferenceState,
              log,
              ownedById,
              proposedEntitiesByType,
              requestedEntityTypes: entityTypes,
            });

            log(`Creation successes: ${stringify(creationSuccesses)}`);
            log(`Creation failures: ${stringify(creationFailures)}`);
            log(`Update candidates: ${stringify(updateCandidates)}`);

            const successes = Object.values(creationSuccesses);
            const failures = Object.values(creationFailures);
            const unchangeds = Object.values(unchangedEntities);
            const updates = Object.values(updateCandidates);

            for (const result of [
              ...successes,
              ...failures,
              ...unchangeds,
              ...updates,
            ]) {
              inferenceState.resultsByTemporaryId[
                result.proposedEntity.entityId
              ] = result;

              if (result.status === "success") {
                inferenceState.inProgressEntityIds =
                  inferenceState.inProgressEntityIds.filter(
                    (inProgressEntityId) =>
                      inProgressEntityId !== result.proposedEntity.entityId,
                  );
              }
            }

            if (createAs === "live") {
              for (const success of successes) {
                void createInferredEntityNotification({
                  entity: success.entity,
                  operation: "create",
                });
              }
            }

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
              requiresOriginalContextForRetry = true;
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
                  updateCandidate.entity.metadata.recordId.entityId
                }
                entityTypeId: ${updateCandidate.entity.metadata.entityTypeId}
                Current properties: ${stringify(
                  updateCandidate.entity.properties,
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
                  results: getResultsFromInferenceState(inferenceState),
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

            log(`Update successes: ${stringify(updateSuccesses)}`);
            log(`Update failures: ${stringify(updateFailures)}`);

            for (const success of successes) {
              if (createAs === "live") {
                void createInferredEntityNotification({
                  entity: success.entity,
                  operation: "update",
                });
              }

              inferenceState.inProgressEntityIds =
                inferenceState.inProgressEntityIds.filter(
                  (inProgressEntityId) =>
                    inProgressEntityId !== success.proposedEntity.entityId,
                );
            }

            for (const result of [...successes, ...failures]) {
              inferenceState.resultsByTemporaryId[
                result.proposedEntity.entityId
              ] = result;
            }

            /**
             * Sometimes the model decides to propose updates for entities that it hasn't been asked to.
             * These will fail because we are not tracking an entityId to update for them.
             * It tends to do this for entities which it's already provided some other response for.
             */
            const failuresToRetry = failures.filter((failure) =>
              inProgressEntityIds.includes(failure.proposedEntity.entityId),
            );
            if (failuresToRetry.length > 0) {
              retryMessages.push({
                role: "tool",
                tool_call_id: toolCallId,
                content: dedent(`
                  Some of the entities you suggested for update were invalid. Please review their properties and try again. 
                  The entities you should review and make a 'update_entities' call for are:
                  ${failuresToRetry
                    .map(
                      (failure) => `
                    your proposed entity: ${stringify(failure.proposedEntity)}
                    failure reason: ${failure.failureReason}
                  `,
                    )
                    .join("\n")}
                `),
                requiresOriginalContext: true,
              });
            }
          } catch (err) {
            return {
              code: StatusCode.Internal,
              contents: [
                {
                  results: getResultsFromInferenceState(inferenceState),
                  usage: latestUsage,
                },
              ],
              message: `Error update entities: ${(err as Error).message}`,
            };
          }
        }
      }

      if (
        inferenceState.proposedEntitySummaries.find(
          (entity) => !entity.takenFromQueue,
        )
      ) {
        log(`Entities remain to be inferred, continuing.`);
        retryMessages.push({
          content:
            "There are other entities you haven't yet provided details for",
          role: "user",
          requiresOriginalContext: true,
        });
      }

      if (retryMessages.length === 0) {
        const results = getResultsFromInferenceState(inferenceState);
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
    contents: [
      {
        results: getResultsFromInferenceState(inferenceState),
        usage: latestUsage,
      },
    ],
    message: errorMessage,
  };
};
