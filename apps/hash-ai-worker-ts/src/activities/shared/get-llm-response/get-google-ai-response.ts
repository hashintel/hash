import { Storage } from "@google-cloud/storage";
import {
  FunctionCallingMode,
  type FunctionDeclaration,
} from "@google-cloud/vertexai";

import { getVertexAi } from "../../flow-activities/infer-metadata-from-document-action/get-llm-analysis-of-doc.js";
import { rewriteSchemaForGoogle } from "./get-google-ai-response/rewrite-schema-for-google.js";
import {
  mapGoogleVertexAiMessagesToLlmMessages,
  mapLlmMessageToGoogleVertexAiMessage,
} from "./llm-message.js";
import type {
  GoogleAiParams,
  LlmRequestMetadata,
  LlmResponse,
  LlmToolDefinition,
  LlmUsage,
} from "./types.js";

let _googleCloudStorage: Storage | undefined;

const storageBucket = process.env.GOOGLE_CLOUD_STORAGE_BUCKET;

const getGoogleCloudStorage = () => {
  if (_googleCloudStorage) {
    return _googleCloudStorage;
  }

  const storage = new Storage();
  _googleCloudStorage = storage;

  return storage;
};

const mapLlmToolDefinitionToGoogleAiToolDefinition = (
  tool: LlmToolDefinition,
): FunctionDeclaration => ({
  name: tool.name,
  description: tool.description,
  parameters: rewriteSchemaForGoogle(tool.inputSchema),
});

export const getGoogleAiResponse = async <ToolName extends string>(
  params: GoogleAiParams<ToolName>,
  metadata: LlmRequestMetadata,
): Promise<LlmResponse<GoogleAiParams<ToolName>>> => {
  if (!storageBucket) {
    throw new Error(
      "GOOGLE_CLOUD_STORAGE_BUCKET environment variable is not set",
    );
  }

  const {
    model,
    tools,
    systemPrompt,
    messages,
    previousInvalidResponses,
    toolChoice,
    retryContext,
  } = params;

  const vertexAi = getVertexAi();

  const gemini = vertexAi.getGenerativeModel({
    model,
  });

  const timeBeforeRequest = Date.now();

  const { response } = await gemini.generateContent({
    contents: messages.map(mapLlmMessageToGoogleVertexAiMessage),
    systemInstruction: systemPrompt,
    toolConfig: toolChoice
      ? {
          functionCallingConfig: {
            mode: FunctionCallingMode.ANY,
            allowedFunctionNames:
              toolChoice === "required" ? undefined : [toolChoice],
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
  });

  const currentRequestTime = Date.now() - timeBeforeRequest;

  const { previousUsage } = retryContext ?? {};

  const totalRequestTime =
    previousInvalidResponses?.reduce(
      (acc, { requestTime }) => acc + requestTime,
      currentRequestTime,
    ) ?? currentRequestTime;

  const responseContent = response.candidates?.[0]?.content;

  if (!responseContent) {
    throw new Error("No response content");
  }

  const responseMessages = mapGoogleVertexAiMessagesToLlmMessages({
    messages: [responseContent],
  });

  const message = responseMessages[0];

  if (!message) {
    throw new Error("No response message");
  }

  if (message.role === "user") {
    throw new Error("Unexpected user message in response");
  }

  const { usageMetadata, promptFeedback } = response;

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
    service: "google-ai",
    usage,
    lastRequestTime: currentRequestTime,
    totalRequestTime,
    message,
  };

  return normalizedResponse;
};
