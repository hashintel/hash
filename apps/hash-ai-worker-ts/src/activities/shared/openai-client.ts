import OpenAI from "openai";

const permittedOpenAiModels = [
  "gpt-3.5-turbo-1106",
  "gpt-4-1106-preview",
  "gpt-4-0125-preview",
  "gpt-4-turbo",
  "gpt-4",
  "gpt-4o",
  "gpt-4o-2024-08-06",
] as const;

export type PermittedOpenAiModel = (typeof permittedOpenAiModels)[number];

export const isPermittedOpenAiModel = (
  model: string,
): model is PermittedOpenAiModel =>
  permittedOpenAiModels.includes(model as PermittedOpenAiModel);

/** @see https://platform.openai.com/docs/models */
export const modelToContextWindow: Record<PermittedOpenAiModel, number> = {
  "gpt-3.5-turbo-1106": 16_385,
  "gpt-4-1106-preview": 128_000,
  "gpt-4-0125-preview": 128_000,
  "gpt-4-turbo": 128_000,
  "gpt-4": 8_192,
  "gpt-4o": 128_000,
  "gpt-4o-2024-08-06": 128_000,
};

export const isPermittedModel = (
  model: OpenAI.ChatCompletionCreateParams["model"],
): model is PermittedOpenAiModel =>
  Object.keys(modelToContextWindow).includes(model);

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY environment variable not set.");
}

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
