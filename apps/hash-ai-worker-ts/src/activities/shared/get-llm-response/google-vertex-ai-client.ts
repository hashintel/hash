import { GoogleGenAI } from "@google/genai";

import { getVertexAuthClient } from "./google-auth-client.js";

import type { MessageCreateParamsBase } from "@anthropic-ai/sdk/resources/messages.mjs";

const permittedGoogleAiModels = [
  "gemini-3.1-pro-preview",
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
  "gemini-3.1-pro-preview": 1_048_576,
};

/** @see https://cloud.google.com/vertex-ai/generative-ai/docs/learn/models */
export const googleAiMessageModelToMaxOutput: Record<
  PermittedGoogleAiModel,
  number
> = {
  "gemini-3.1-pro-preview": 65_536,
};
const googleCloudProjectId = process.env.GOOGLE_CLOUD_HASH_PROJECT_ID;
const vertexAiLocation = process.env.GOOGLE_CLOUD_VERTEX_LOCATION ?? "global";

let _vertexAi: GoogleGenAI | undefined;

export const getVertexAiClient = () => {
  if (!googleCloudProjectId) {
    throw new Error(
      "GOOGLE_CLOUD_HASH_PROJECT_ID environment variable is not set",
    );
  }

  if (_vertexAi) {
    return _vertexAi;
  }

  const authClient = getVertexAuthClient();

  const vertexAI = new GoogleGenAI({
    vertexai: true,
    project: googleCloudProjectId,
    location: vertexAiLocation,
    googleAuthOptions: authClient ? { authClient } : undefined,
  });

  _vertexAi = vertexAI;

  return vertexAI;
};
