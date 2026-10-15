import { openrouterProvider } from "@earendil-works/pi-ai/providers/openrouter";

import type { Model, Provider } from "@earendil-works/pi-ai";

/**
 * pi-ai's OpenRouter catalogue plus the models it lacks. pi-ai 0.83.0's
 * OpenRouter catalogue predates GPT-6. Delete this module and register
 * `openrouterProvider()` once Flue resolves a pi-ai that declares it.
 */

/**
 * An opt-in for development, from OpenRouter's `openai/gpt-6.1-sol` endpoint
 * listing with its OpenAI endpoint pricing. Transport follows pi-ai 0.83.0's
 * OpenRouter entries for GPT-5.6 Sol; the thinking levels follow the direct
 * `gpt-6.1-sol` entry, which offers neither `off` nor `minimal`.
 */
const gpt61Sol: Model<"openai-completions"> = {
  id: "openai/gpt-6.1-sol",
  name: "OpenAI: GPT-6.1 Sol",
  api: "openai-completions",
  provider: "openrouter",
  baseUrl: "https://openrouter.ai/api/v1",
  reasoning: true,
  input: ["text", "image"],
  cost: {
    input: 2,
    output: 10,
    cacheRead: 0.1,
    cacheWrite: 2.5,
    tiers: [
      {
        inputTokensAbove: 272000,
        input: 4,
        output: 15,
        cacheRead: 0.2,
        cacheWrite: 5,
      },
    ],
  },
  contextWindow: 1050000,
  maxTokens: 128000,
  thinkingLevelMap: {
    off: null,
    minimal: null,
    xhigh: "xhigh",
    max: "max",
  },
  compat: { thinkingFormat: "openrouter" },
};

/** Streams and auth stay the native provider's own. */
export const openrouterProviderWithAddedModels = (): Provider => {
  const catalogue = openrouterProvider();
  return {
    ...catalogue,
    getModels: () => [...catalogue.getModels(), gpt61Sol],
  };
};
