import { VersionedUrl } from "@blockprotocol/type-system/slim";
import { typedEntries, typedKeys } from "@local/advanced-types/typed-entries";
import { Status, StatusCode } from "@local/status";
import dedent from "dedent";
import OpenAI from "openai";

import {
  CouldNotInferEntitiesReturn,
  generateSummaryTools,
  ProposedEntitySummariesByType,
  validateEntitySummariesByType,
} from "./infer-entity-summaries/generate-summary-tools";
import {
  CompletionPayload,
  DereferencedEntityTypesByTypeId,
  InferenceState,
} from "./inference-types";
import { log } from "./log";
import { getOpenAiResponse } from "./shared/get-open-ai-response";
import { stringify } from "./stringify";

type InferEntitySummariesReturn = Status<InferenceState>;

export const inferEntitySummaries = async (params: {
  completionPayload: CompletionPayload;
  entityTypes: DereferencedEntityTypesByTypeId;
  inferenceState: InferenceState;
  rerequestedEntityTypes: Set<VersionedUrl>;
}): Promise<InferEntitySummariesReturn> => {
  const {
    completionPayload,
    entityTypes,
    inferenceState,
    rerequestedEntityTypes,
  } = params;

  const { iterationCount, usage: usageFromLastIteration } = inferenceState;

  log(`Iteration ${iterationCount} begun.`);

  const tools = generateSummaryTools(Object.values(entityTypes));

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

  const retryWithMessage = (
    retryMessage:
      | OpenAI.ChatCompletionUserMessageParam
      | OpenAI.ChatCompletionToolMessageParam,
  ) => {
    log(`Retrying with additional message: ${stringify(retryMessage)}`);

    const newMessages = [...completionPayload.messages, message, retryMessage];

    return inferEntitySummaries({
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

      return retryWithMessage({
        role: "tool",
        content:
          // @todo see if we can get the model to respond continuing off the previous JSON argument to the function call
          "Your previous response was cut off for length – please respond again with a shorter function call.",
        tool_call_id: toolCallId,
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

          return retryWithMessage({
            role: "tool",
            content:
              "Your previous response contained invalid JSON. Please try again.",
            tool_call_id: toolCallId,
          });
        }

        if (functionName === "could_not_infer_entities") {
          if (Object.keys(inferenceState.resultsByTemporaryId).length > 0) {
            return {
              code: StatusCode.Ok,
              contents: [inferenceState],
            };
          }

          const parsedResponse = JSON.parse(
            modelProvidedArgument,
          ) as CouldNotInferEntitiesReturn;

          return {
            code: StatusCode.Aborted,
            contents: [inferenceState],
            message: parsedResponse.reason,
          };
        }

        if (functionName === "register_entity_summaries") {
          let proposedEntitySummariesByType: ProposedEntitySummariesByType;
          try {
            proposedEntitySummariesByType = JSON.parse(
              modelProvidedArgument,
            ) as ProposedEntitySummariesByType;
            validateEntitySummariesByType(proposedEntitySummariesByType);
          } catch (err) {
            log(
              `Model provided invalid argument to register_entity_summaries function. Argument provided: ${stringify(
                modelProvidedArgument,
              )}`,
            );

            return retryWithMessage({
              content:
                "You provided an invalid argument to register_entity_summaries. Please try again",
              role: "tool",
              tool_call_id: toolCallId,
            });
          }

          for (const [entityTypeId, proposedEntitySummaries] of typedEntries(
            proposedEntitySummariesByType,
          )) {
            for (const summary of proposedEntitySummaries) {
              inferenceState.proposedEntitySummaries.push({
                ...summary,
                entityTypeId,
              });
            }
          }

          const modelProvidedEntityTypeIds = typedKeys(
            proposedEntitySummariesByType,
          );

          const typesWithNoSuggestionsToRerequest = typedKeys(
            entityTypes,
          ).filter(
            (entityTypeId) =>
              !modelProvidedEntityTypeIds.includes(entityTypeId) &&
              // We track which types we've already requested the model try again for – we won't ask again
              !rerequestedEntityTypes.has(entityTypeId),
          );

          /**
           * If some types have been requested by the user but not inferred, ask the model to try again.
           * This is a common oversight of GPT-4 Turbo at least, as of Dec 2023.
           */
          if (typesWithNoSuggestionsToRerequest.length > 0) {
            log(
              `No suggestions for entity types: ${typesWithNoSuggestionsToRerequest.join(
                ", ",
              )}`,
            );

            return retryWithMessage({
              content: dedent(`
                   You did not suggest any entities of the following entity types: ${typesWithNoSuggestionsToRerequest.join(
                     ", ",
                   )}. Please reconsider the input text to see if you can identify any entities of those types.
                `),
              role: "tool",
              tool_call_id: toolCallId,
            });
          }

          return {
            code: StatusCode.Ok,
            contents: [inferenceState],
          };
        }
      }
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
