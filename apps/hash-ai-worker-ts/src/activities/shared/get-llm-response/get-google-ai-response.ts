import {
  type Content,
  FunctionCallingMode,
  type FunctionDeclaration,
  type GenerateContentRequest,
  type GenerateContentResponse,
  type Part,
} from "@google-cloud/vertexai";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import { stringifyError } from "@local/hash-isomorphic-utils/stringify-error";
import type { File } from "@local/hash-isomorphic-utils/system-types/shared";

import { logger } from "../activity-logger.js";
import { isActivityCancelled } from "../get-flow-context.js";
import { mapGoogleMessagesToLlmMessages } from "./get-google-ai-response/map-google-messages-to-llm-messages.js";
import { mapLlmContentToGooglePartAndUploadFiles } from "./get-google-ai-response/map-parts-and-upload-files.js";
import { rewriteSchemaForGoogle } from "./get-google-ai-response/rewrite-schema-for-google.js";
import { getVertexAiClient } from "./google-vertex-ai-client.js";
import { type LlmMessage } from "./llm-message.js";
import type {
  GoogleAiParams,
  LlmRequestMetadata,
  LlmResponse,
  LlmToolDefinition,
  LlmUsage,
} from "./types.js";

const mapLlmToolDefinitionToGoogleAiToolDefinition = (
  tool: LlmToolDefinition,
): FunctionDeclaration => ({
  name: tool.name,
  description: tool.description,
  parameters: rewriteSchemaForGoogle(tool.inputSchema),
});

export const getGoogleAiResponse = async <ToolName extends string>(
  params: GoogleAiParams<ToolName>,
  _metadata: LlmRequestMetadata,
): Promise<{
  llmResponse: LlmResponse<GoogleAiParams<ToolName>>;
  transformedRequest: Record<string, unknown>;
}> => {
  const {
    model,
    tools,
    toolChoice,
    systemPrompt,
    messages,
    previousInvalidResponses,
    retryContext,
  } = params;

  const vertexAi = getVertexAiClient();

  const gemini = vertexAi.getGenerativeModel({
    model,
  });

  const timeBeforeRequest = Date.now();

  const contents: Content[] = [];
  const fileEntities: Pick<HashEntity<File>, "entityId" | "properties">[] = [];

  for (const message of messages) {
    const parts: Part[] = [];

    for (const llmContent of message.content) {
      if (llmContent.type === "file") {
        fileEntities.push(llmContent.fileEntity);
      }

      parts.push(await mapLlmContentToGooglePartAndUploadFiles(llmContent));
    }

    contents.push({
      role: message.role,
      parts,
    });
  }

  let response: GenerateContentResponse;

  const transformedRequest = {
    contents,
    systemInstruction: systemPrompt,
    // @ts-expect-error -- the casing in the library is toolConfig/functionCallingConfig but this doesn't work.
    tool_config:
      toolChoice && tools
        ? {
            function_calling_config: {
              mode: FunctionCallingMode.ANY,
              allowed_function_names:
                toolChoice !== "required"
                  ? [toolChoice]
                  : tools.map((tool) => tool.name),
            },
          }
        : undefined,
    tools: tools
      ? [
          {
            functionDeclarations: tools.map(
              mapLlmToolDefinitionToGoogleAiToolDefinition,
            ),
          },
        ]
      : undefined,
  } satisfies GenerateContentRequest;

  try {
    ({ response } = await gemini.generateContent(transformedRequest));
  } catch (error) {
    logger.error(`Google AI API error: ${stringifyError(error)}`);

    if (isActivityCancelled()) {
      return {
        llmResponse: {
          status: "aborted",
          provider: "google-vertex-ai",
        },
        transformedRequest,
      };
    }

    const message =
      "message" in (error as Error)
        ? (error as Error).message
        : "Unknown error";

    return {
      llmResponse: {
        status: "api-error",
        provider: "google-vertex-ai",
        message,
        error,
      },
      transformedRequest,
    };
  }

  const currentRequestTime = Date.now() - timeBeforeRequest;

  const { previousUsage } = retryContext ?? {};

  const totalRequestTime =
    previousInvalidResponses?.reduce(
      (acc, { requestTime }) => acc + requestTime,
      currentRequestTime,
    ) ?? currentRequestTime;

  const responseContent = response.candidates?.[0]?.content;

  const { usageMetadata, promptFeedback } = response;

  if (!responseContent && !promptFeedback) {
    throw new Error("No response content or prompt feedback");
  }

  const responseMessages: LlmMessage[] = responseContent
    ? mapGoogleMessagesToLlmMessages({
        messages: [responseContent],
        fileEntities,
      })
    : [
        {
          role: "assistant",
          content: [
            {
              type: "text",
              text: promptFeedback?.blockReason
                ? `Content blocked. Reason: ${promptFeedback.blockReasonMessage}.${promptFeedback.blockReasonMessage ? ` ${promptFeedback.blockReasonMessage}` : ""}`
                : "Content blocked, no reason given.",
            },
          ],
        },
      ];

  const message = responseMessages[0];

  if (!message) {
    throw new Error("No response message");
  }

  if (message.role === "user") {
    throw new Error("Unexpected user message in response");
  }

  const usage: LlmUsage = {
    inputTokens:
      (previousUsage?.inputTokens ?? 0) +
      (usageMetadata?.promptTokenCount ?? 0),
    outputTokens:
      (previousUsage?.outputTokens ?? 0) +
      (usageMetadata?.candidatesTokenCount ?? 0),
    totalTokens:
      (previousUsage?.totalTokens ?? 0) + (usageMetadata?.totalTokenCount ?? 0),
  };

  const normalizedResponse: LlmResponse<GoogleAiParams> = {
    invalidResponses: previousInvalidResponses ?? [],
    status: "ok",
    stopReason: promptFeedback?.blockReason ? "content_filter" : "stop",
    provider: "google-vertex-ai",
    usage,
    lastRequestTime: currentRequestTime,
    totalRequestTime,
    message,
  };

  return {
    llmResponse: normalizedResponse,
    transformedRequest,
  };
};
