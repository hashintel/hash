import OpenAI from "openai";

const permittedOrcaRouterModels = ["orcarouter/auto"] as const;

export type PermittedOrcaRouterModel = (typeof permittedOrcaRouterModels)[number];

export const isPermittedOrcaRouterModel = (
  model: string,
): model is PermittedOrcaRouterModel =>
  permittedOrcaRouterModels.includes(model as PermittedOrcaRouterModel);

/**
 * `orcarouter/auto` routes each request to the best available model at call
 * time, so the effective context window is not known up-front. We use a
 * conservative estimate to ensure the message-trimming logic never assumes
 * more head-room than the smallest widely-routed model provides.
 *
 * @see https://docs.orcarouter.ai
 */
export const orcarouterModelToContextWindow: Record<
  PermittedOrcaRouterModel,
  number
> = {
  "orcarouter/auto": 128_000,
};

export const isPermittedModel = (
  model: OpenAI.ChatCompletionCreateParams["model"],
): model is PermittedOrcaRouterModel =>
  Object.keys(orcarouterModelToContextWindow).includes(model);

if (!process.env.ORCAROUTER_API_KEY) {
  throw new Error("ORCAROUTER_API_KEY environment variable not set.");
}

export const orcarouter = new OpenAI({
  apiKey: process.env.ORCAROUTER_API_KEY,
  baseURL: "https://api.orcarouter.ai/v1",
});
