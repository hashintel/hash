import type { VersionedUrl } from "@blockprotocol/type-system/slim";
import type { GraphApi } from "@local/hash-graph-client";
import type { AccountId, Entity } from "@local/hash-subgraph";
import type { Status } from "@local/status";
import { StatusCode } from "@local/status";
import dedent from "dedent";
import type OpenAI from "openai";

import { logger } from "../shared/activity-logger";
import { getLlmResponse } from "../shared/get-llm-response";
import {
  getTextContentFromLlmMessage,
  getToolCallsFromLlmAssistantMessage,
  mapLlmMessageToOpenAiMessages,
  mapOpenAiMessagesToLlmMessages,
} from "../shared/get-llm-response/llm-message";
import { stringify } from "../shared/stringify";
import { inferEntitiesSystemPrompt } from "./infer-entities-system-prompt";
import type {
  CouldNotInferEntitiesReturn,
  ProposedEntitySummariesByType,
} from "./infer-entity-summaries/generate-summary-tools";
import {
  generateSummaryTools,
  validateEntitySummariesByType,
} from "./infer-entity-summaries/generate-summary-tools";
import type {
  CompletionPayload,
  DereferencedEntityTypesByTypeId,
  InferenceState,
  ProposedEntitySummary,
} from "./inference-types";

export const inferEntitySummaries = async (params: {
  completionPayload: CompletionPayload;
  entityTypes: DereferencedEntityTypesByTypeId;
  inferenceState: InferenceState;
  providedOrRerequestedEntityTypes: Set<VersionedUrl>;
  existingEntities?: Entity[];
  userAccountId: AccountId;
  graphApiClient: GraphApi;
}): Promise<Status<InferenceState>> => {
  const {
    completionPayload,
    entityTypes,
    inferenceState,
    providedOrRerequestedEntityTypes,
    existingEntities,
    userAccountId,
    graphApiClient,
  } = params;

  const { iterationCount, usage: usageFromPreviousIterations } = inferenceState;

  if (iterationCount > 10) {
    logger.info(
      `Model reached maximum number of iterations for generating summaries. Messages: ${stringify(
        completionPayload.messages,
      )}`,
    );

    return {
      code: StatusCode.ResourceExhausted,
      contents: [],
      message: `Maximum number of iterations reached.`,
    };
  }

  logger.info(`Iteration ${iterationCount} begun.`);

  const tools = generateSummaryTools({
    entityTypes: Object.values(entityTypes),
    canLinkToExistingEntities:
      !!existingEntities && existingEntities.length > 0,
  });

  const llmResponse = await getLlmResponse({
    ...completionPayload,
    systemPrompt: inferEntitiesSystemPrompt,
    messages: mapOpenAiMessagesToLlmMessages({
      messages: completionPayload.messages,
    }),
    tools,
    userAccountId,
    graphApiClient,
  });

  if (llmResponse.status !== "ok") {
    return {
      code: StatusCode.Internal,
      contents: [],
    };
  }

  const { stopReason, usage, message } = llmResponse;

  inferenceState.usage = [...usageFromPreviousIterations, usage];

  const retryWithMessages = (
    retryMessages: (
      | OpenAI.ChatCompletionToolMessageParam
      | OpenAI.ChatCompletionUserMessageParam
    )[],
    proposedEntitySummaries: ProposedEntitySummary[],
  ) => {
    logger.debug(
      `Retrying with additional message: ${stringify(retryMessages)}`,
    );

    const newMessages = [
      ...completionPayload.messages,
      ...mapLlmMessageToOpenAiMessages({ message }),
      ...retryMessages,
    ];

    return inferEntitySummaries({
      ...params,
      inferenceState: {
        ...inferenceState,
        proposedEntitySummaries,
        iterationCount: iterationCount + 1,
      },
      completionPayload: {
        ...completionPayload,
        messages: newMessages,
      },
    });
  };

  const toolCalls = getToolCallsFromLlmAssistantMessage({ message });

  switch (stopReason) {
    case "stop": {
      const textContent = getTextContentFromLlmMessage({ message });
      const errorMessage = `AI Model returned 'stop' finish reason, with message: ${
        textContent ?? "no message"
      }`;

      logger.error(errorMessage);

      return {
        code: StatusCode.Unknown,
        contents: [inferenceState],
        message: textContent ?? "No entities could be inferred from the page.",
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

      return retryWithMessages(
        [
          {
            role: "tool",
            content:
              // @todo see if we can get the model to respond continuing off the previous JSON argument to the function call
              "Your previous response was cut off for length – please respond again with a shorter function call.",
            tool_call_id: toolCallId,
          },
        ],
        inferenceState.proposedEntitySummaries,
      );
    }

    case "content_filter":
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

    case "tool_use": {
      const retryMessages: (
        | OpenAI.ChatCompletionToolMessageParam
        | OpenAI.ChatCompletionUserMessageParam
      )[] = [];

      for (const toolCall of toolCalls) {
        if (toolCall.name === "could_not_infer_entities") {
          if (Object.keys(inferenceState.proposedEntitySummaries).length > 0) {
            return {
              code: StatusCode.Ok,
              contents: [inferenceState],
            };
          }

          const parsedResponse = toolCall.input as CouldNotInferEntitiesReturn;

          return {
            code: StatusCode.Aborted,
            contents: [inferenceState],
            message: parsedResponse.reason,
          };
        }

        if (toolCall.name === "register_entity_summaries") {
          let proposedEntitySummariesByType: ProposedEntitySummariesByType;
          try {
            proposedEntitySummariesByType =
              toolCall.input as ProposedEntitySummariesByType;
          } catch (err) {
            logger.error(
              `Model provided invalid argument to register_entity_summaries function. Argument provided: ${stringify(
                toolCall.input,
              )}`,
            );

            retryMessages.push({
              content: `Invalid JSON, please try again: ${
                (err as Error).message
              }`,
              role: "tool",
              tool_call_id: toolCall.id,
            });
            continue;
          }

          const { validSummaries, errorMessage } =
            validateEntitySummariesByType({
              parsedJson: proposedEntitySummariesByType,
              entityTypesById: entityTypes,
              existingSummaries: inferenceState.proposedEntitySummaries,
              existingEntities,
            });

          for (const validSummary of validSummaries) {
            if (
              !inferenceState.proposedEntitySummaries.some(
                (summary) => summary.entityId === validSummary.entityId,
              )
            ) {
              inferenceState.proposedEntitySummaries.push(validSummary);
            }
            providedOrRerequestedEntityTypes.add(validSummary.entityTypeId);
          }

          if (errorMessage) {
            retryMessages.push({
              content: `There were problems with some of your proposals. Please correct these and try again: ${errorMessage}.
              Remember, if you have specified a sourceEntityId and targetEntityId for an entity, you must provide entities with an entityId for each of the source and target!
              `,
              role: "tool",
              tool_call_id: toolCall.id,
            });
          }
        }
      }

      const typesWithNoSuggestionsToRerequest = Object.values(
        entityTypes,
      ).filter(
        ({ schema }) =>
          // We track which types we've already requested the model try again for – we won't ask again
          !providedOrRerequestedEntityTypes.has(schema.$id),
      );

      /**
       * If some types have been requested by the user but not inferred, ask the model to try again.
       * This is a common oversight of GPT-4 Turbo at least, as of Dec 2023.
       */
      if (typesWithNoSuggestionsToRerequest.length > 0) {
        logger.info(
          `No suggestions for entity types: ${typesWithNoSuggestionsToRerequest.join(
            ", ",
          )}`,
        );

        for (const { schema } of typesWithNoSuggestionsToRerequest) {
          providedOrRerequestedEntityTypes.add(schema.$id);
        }

        const isMissingEntities = typesWithNoSuggestionsToRerequest.some(
          ({ isLink }) => !isLink,
        );

        const isMissingLinks = typesWithNoSuggestionsToRerequest.some(
          ({ isLink }) => isLink,
        );

        const missingContentKinds = `${isMissingEntities ? "entities" : ""}${isMissingEntities && isMissingLinks ? " or " : ""}${isMissingLinks ? "links" : ""}`;

        retryMessages.push({
          content: dedent(`
            You did not suggest any ${missingContentKinds} of the following types: ${typesWithNoSuggestionsToRerequest.join(
              ", ",
            )}.
            
            Please reconsider the input text to see if you can identify any ${missingContentKinds} of those types${existingEntities && existingEntities.length > 0 && isMissingLinks ? ", including whether any links can be created to the existing entities provided." : "."}
          `),
          role: "user",
        });
      }

      if (retryMessages.length === 0) {
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
        })),
      );

      return retryWithMessages(
        retryMessages,
        inferenceState.proposedEntitySummaries,
      );
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
