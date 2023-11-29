import type { VersionedUrl } from "@blockprotocol/type-system";
import { Logger } from "@local/hash-backend-utils/logger";
import type { GraphApi } from "@local/hash-graph-client";
import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import type {
  InferEntitiesCallerParams,
  InferEntitiesReturn,
} from "@local/hash-isomorphic-utils/temporal-types";
import { InferredEntityChangeResult } from "@local/hash-isomorphic-utils/temporal-types";
import type { AccountId, OwnedById, Subgraph } from "@local/hash-subgraph";
import { StatusCode } from "@local/status";
import dedent from "dedent";
import OpenAI from "openai";

import { createEntities } from "./infer-entities/create-entities";
import {
  DereferencedEntityType,
  dereferenceEntityType,
} from "./infer-entities/dereference-entity-type";
import {
  CouldNotInferEntitiesReturn,
  generateTools,
  ProposedEntityCreationsByType,
  ProposedEntityUpdatesByType,
  validateProposedEntitiesByType,
} from "./infer-entities/generate-tools";
import { updateEntities } from "./infer-entities/update-entities";

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY environment variable not set.");
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const logger = new Logger({
  mode: process.env.NODE_ENV === "production" ? "prod" : "dev",
  serviceName: "hash-ai-infer-entities-activity",
});

type DereferencedEntityTypesByTypeId = Record<
  VersionedUrl,
  { isLink: boolean; schema: DereferencedEntityType }
>;

const requestEntityInference = async (params: {
  authentication: { actorId: AccountId };
  completionPayload: Omit<
    OpenAI.ChatCompletionCreateParams,
    "stream" | "tools"
  >;
  entityTypes: DereferencedEntityTypesByTypeId;
  iterationCount: number;
  graphApiClient: GraphApi;
  ownedById: OwnedById;
  results: InferredEntityChangeResult[];
}): Promise<InferEntitiesReturn> => {
  const {
    authentication,
    completionPayload,
    entityTypes,
    iterationCount,
    graphApiClient,
    ownedById,
    results,
  } = params;

  if (iterationCount > 5) {
    logger.debug(
      `Model reached maximum number of iterations. Messages: ${JSON.stringify(
        completionPayload.messages,
        undefined,
        2,
      )}`,
    );

    return {
      code: StatusCode.ResourceExhausted,
      contents: [],
      message: `Maximum number of iterations reached.`,
    };
  }

  logger.debug(
    `Iteration ${iterationCount} with payload: ${JSON.stringify(
      completionPayload,
    )}`,
  );

  const entityTypeIds = Object.keys(entityTypes);

  const tools = generateTools(Object.values(entityTypes));

  const openApiPayload: OpenAI.ChatCompletionCreateParams = {
    ...completionPayload,
    stream: false,
    tools,
  };

  let data: OpenAI.ChatCompletion;
  try {
    data = await openai.chat.completions.create(openApiPayload);
  } catch (err) {
    return {
      code: StatusCode.Internal,
      contents: [],
      message: `Error from AI Model: ${(err as Error).message}`,
    };
  }

  const response = data.choices[0];

  if (!response) {
    return {
      code: StatusCode.Internal,
      contents: [],
      message: `No data choice available in AI Model response`,
    };
  }

  const { finish_reason, message } = response;

  const toolCalls = message.tool_calls;

  const retryWithMessages = (
    userMessages: (
      | OpenAI.ChatCompletionUserMessageParam
      | OpenAI.ChatCompletionToolMessageParam
    )[],
    latestResults: InferredEntityChangeResult[],
  ) =>
    requestEntityInference({
      ...params,
      iterationCount: iterationCount + 1,
      completionPayload: {
        ...completionPayload,
        messages: [...completionPayload.messages, message, ...userMessages],
      },
      results: latestResults,
    });

  switch (finish_reason) {
    case "stop": {
      const errorMessage = `AI Model returned 'stop' finish reason, with message: ${
        message.content ?? "no message"
      }`;
      logger.debug(message);

      return {
        code: StatusCode.Unknown,
        contents: [],
        message: errorMessage,
      };
    }
    case "length":
      logger.debug(
        `AI Model returned 'length' finish reason on attempt ${iterationCount}.`,
      );

      // @todo request more tokens and track where a message is a continuation of a previous message

      return {
        code: StatusCode.ResourceExhausted,
        contents: [],
        message:
          "The maximum amount of tokens was reached before the model returned a completion.",
      };
    case "content_filter":
      logger.debug(
        `The content filter was triggered on attempt ${iterationCount} with input: ${JSON.stringify(
          completionPayload.messages,
          undefined,
          2,
        )}, `,
      );

      return {
        code: StatusCode.InvalidArgument,
        contents: [],
        message: "The content filter was triggered",
      };

    case "tool_calls": {
      if (!toolCalls) {
        const errorMessage =
          "AI Model returned 'tool_calls' finish reason no tool calls";

        logger.debug(
          errorMessage,
          `Message: ${JSON.stringify(message, undefined, 2)}`,
        );

        return {
          code: StatusCode.Internal,
          contents: [],
          message: errorMessage,
        };
      }

      const retryMessages: (
        | OpenAI.ChatCompletionUserMessageParam
        | OpenAI.ChatCompletionToolMessageParam
      )[] = [];

      for (const toolCall of toolCalls) {
        const toolCallId = toolCall.id;

        const functionCall = toolCall.function;

        const { arguments: modelProvidedArgument, name: functionName } =
          functionCall;

        try {
          JSON.parse(modelProvidedArgument);
        } catch {
          logger.debug(
            `Could not parse AI Model response on attempt ${iterationCount}: ${modelProvidedArgument}`,
          );

          return retryWithMessages(
            [
              {
                role: "user",
                content:
                  "Your previous response contained invalid JSON. Please try again.",
              },
            ],
            results,
          );
        }

        if (functionName === "could_not_infer_entities") {
          if (results.length > 0) {
            continue;
          }

          const parsedResponse = JSON.parse(
            modelProvidedArgument,
          ) as CouldNotInferEntitiesReturn;

          return {
            code: StatusCode.InvalidArgument,
            contents: [],
            message: parsedResponse.reason,
          };
        }

        if (functionName === "create_entities") {
          let proposedEntitiesByType: ProposedEntityCreationsByType;
          try {
            proposedEntitiesByType = JSON.parse(
              modelProvidedArgument,
            ) as ProposedEntityCreationsByType;
            validateProposedEntitiesByType(proposedEntitiesByType, false);
          } catch (err) {
            logger.debug(
              `Model provided invalid argument to create_entities function. Argument provided: ${JSON.stringify(
                modelProvidedArgument,
                undefined,
                2,
              )}`,
            );

            retryMessages.push({
              content:
                "You provided an invalid argument to create_entities. Please try again",
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

          if (notRequestedTypes.length > 0) {
            retryMessages.push({
              content: `You provided entities of types ${notRequestedTypes.join(
                ", ",
              )}, which were not requested. Please try again`,
              role: "tool",
              tool_call_id: toolCallId,
            });
            continue;
          }

          try {
            const { creationSuccesses, creationFailures, updateCandidates } =
              await createEntities({
                actorId: authentication.actorId,
                graphApiClient,
                ownedById,
                proposedEntitiesByType,
                requestedEntityTypes: entityTypes,
              });

            const successes = Object.values(creationSuccesses);
            const failures = Object.values(creationFailures);
            const updates = Object.values(updateCandidates);

            results.push(...successes, ...failures);

            let retryMessageContent = "";

            if (failures.length > 0) {
              retryMessageContent += dedent(`
                Some of the entities you suggested for creation were invalid. Please review their properties and try again. 
                The entities you should review and make a 'create_entities' call for are:
                ${failures
                  .map(
                    (failure) => `
                  your proposed entity: ${JSON.stringify(
                    failure.proposedEntity,
                  )}
                  failure reason: ${failure.failureReason}
                `,
                  )
                  .join("\n")}
              `);
            }

            if (updates.length > 0) {
              retryMessageContent += dedent(`
              Some of the entities you suggest for creation already exist. Please review their properties and call update_entities
              to update them instead. The entities you should update are:
              ${updates
                .map(
                  (updateCandidate) => `
                your proposed entity: ${JSON.stringify(
                  updateCandidate.proposedEntity,
                )}
                updateEntityId to use: ${
                  updateCandidate.existingEntity.metadata.recordId.entityId
                }
                entityTypeId: ${
                  updateCandidate.existingEntity.metadata.entityTypeId
                }
                Current properties: ${JSON.stringify(
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
              });
            }
          } catch (err) {
            return {
              code: StatusCode.Internal,
              contents: [],
              message: `Error creating entities: ${(err as Error).message}`,
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
            logger.debug(
              `Model provided invalid argument to update_entities function. Argument provided: ${JSON.stringify(
                modelProvidedArgument,
                undefined,
                2,
              )}`,
            );

            retryMessages.push({
              content:
                "You provided an invalid argument to update_entities. Please try again",
              role: "tool",
              tool_call_id: toolCallId,
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
            });
            continue;
          }

          try {
            const { updateSuccesses, updateFailures } = await updateEntities({
              actorId: authentication.actorId,
              graphApiClient,
              ownedById,
              proposedEntityUpdatesByType,
              requestedEntityTypes: entityTypes,
            });

            const successes = Object.values(updateSuccesses);
            const failures = Object.values(updateFailures);

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
                  your proposed entity: ${JSON.stringify(
                    failure.proposedEntity,
                  )}
                  failure reason: ${failure.failureReason}
                `,
                  )
                  .join("\n")}
              `),
              });
            }
          } catch (err) {
            return {
              code: StatusCode.Internal,
              contents: [],
              message: `Error update entities: ${(err as Error).message}`,
            };
          }
        }
      }

      if (retryMessages.length === 0) {
        return {
          code: StatusCode.Ok,
          contents: results,
        };
      }

      const toolCallsWithoutProblems = toolCalls.filter(
        (toolCall) =>
          !retryMessages.some(
            (msg) => msg.role === "tool" && msg.tool_call_id === toolCall.id,
          ),
      );

      retryMessages.push(
        ...toolCallsWithoutProblems.map((toolCall) => ({
          role: "tool" as const,
          tool_call_id: toolCall.id,
          content: "No problems found with this tool call.",
        })),
      );

      logger.debug(
        `Retrying with messages: ${JSON.stringify(
          retryMessages,
          undefined,
          2,
        )}`,
      );

      return retryWithMessages(retryMessages, results);
    }
  }

  return {
    code: StatusCode.Internal,
    contents: [],
    message: `AI Model returned unhandled finish reason: ${finish_reason}`,
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
    Make sure you attempt to create entities of all the provided types, if there is data to do so!
    The user may respond advising you that some proposed entities already exist, and give you a new string identifier for them,
      as well as their existing properties. You can then call update_entities instead to update the relevant entities, 
      making sure that you retain any useful information in the existing properties, augmenting it with what you have inferred. 
  `),
};

/**
 * Infer and create entities of the requested types from the provided text input.
 * @param authentication information on the user making the request
 * @param graphApiClient
 * @param userArguments
 */
export const inferEntities = async ({
  authentication,
  graphApiClient,
  userArguments,
}: InferEntitiesCallerParams & {
  graphApiClient: GraphApi;
}): Promise<InferEntitiesReturn> => {
  const { entityTypeIds, maxTokens, model, ownedById, temperature, textInput } =
    userArguments;

  const entityTypes: Record<
    VersionedUrl,
    { isLink: boolean; schema: DereferencedEntityType }
  > = {};

  try {
    const { data: entityTypesSubgraph } =
      await graphApiClient.getEntityTypesByQuery(authentication.actorId, {
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

  return requestEntityInference({
    authentication,
    completionPayload: {
      max_tokens: maxTokens,
      messages: [
        systemMessage,
        {
          role: "user",
          content: textInput,
        },
      ],
      model,
      response_format: { type: "json_object" },
      temperature,
    },
    entityTypes,
    graphApiClient,
    iterationCount: 1,
    ownedById,
    results: [],
  });
};
