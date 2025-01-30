import type { MessageCreateParamsBase } from "@anthropic-ai/sdk/resources/messages.mjs";
import { VertexAI } from "@google-cloud/vertexai";

const permittedGoogleAiModels = [
  "gemini-1.5-pro-002",
] satisfies MessageCreateParamsBase["model"][];

export type PermittedGoogleAiModel = (typeof permittedGoogleAiModels)[number];

export const isPermittedGoogleAiModel = (
  model: string,
): model is PermittedGoogleAiModel =>
  permittedGoogleAiModels.includes(model as PermittedGoogleAiModel);

/** @see https://cloud.google.com/vertex-ai/generative-ai/docs/learn/models */
export const googleAiMessageModelToContextWindow: Record<
  PermittedGoogleAiModel,
  number
> = {
  "gemini-1.5-pro-002": 2_097_152,
};

/** @see https://cloud.google.com/vertex-ai/generative-ai/docs/learn/models */
export const googleAiMessageModelToMaxOutput: Record<
  PermittedGoogleAiModel,
  number
> = {
  "gemini-1.5-pro-002": 8_192,
};
const googleCloudProjectId = process.env.GOOGLE_CLOUD_HASH_PROJECT_ID;

let _vertexAi: VertexAI | undefined;

export const getVertexAiClient = () => {
  if (!googleCloudProjectId) {
    throw new Error(
      "GOOGLE_CLOUD_HASH_PROJECT_ID environment variable is not set",
    );
  }

  if (_vertexAi) {
    return _vertexAi;
  }

  const vertexAI = new VertexAI({
    project: googleCloudProjectId,
    location: "us-east4",
  });

  _vertexAi = vertexAI;

  return vertexAI;
};
