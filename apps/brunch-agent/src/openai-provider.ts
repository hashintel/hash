import { openaiProvider } from "@earendil-works/pi-ai/providers/openai";

import type { Model, Provider } from "@earendil-works/pi-ai";

/**
 * pi-ai's OpenAI catalogue plus GPT-6 Luna, copied from the pi-ai 0.87.1 catalogue.
 * Flue 2.x resolves models through pi-ai ^0.83.0, which predates GPT-6. Delete
 * this module and register `openaiProvider()` once Flue resolves a pi-ai that
 * declares the model.
 */
const gpt6Luna: Model<"openai-responses"> = {
  id: "gpt-6-luna",
  name: "GPT-6 Luna",
  api: "openai-responses",
  provider: "openai",
  baseUrl: "https://api.openai.com/v1",
  reasoning: true,
  input: ["text", "image"],
  cost: {
    input: 0.1,
    output: 0.5,
    cacheRead: 0.01,
    cacheWrite: 0.125,
    tiers: [
      {
        inputTokensAbove: 272000,
        input: 0.2,
        output: 0.75,
        cacheRead: 0.02,
        cacheWrite: 0.25,
      },
    ],
  },
  contextWindow: 272000,
  maxTokens: 128000,
  thinkingLevelMap: {
    off: "none",
    minimal: null,
    low: "low",
    medium: "medium",
    high: "high",
    xhigh: "xhigh",
    max: "max",
  },
  compat: {
    supportsStrictMode: true,
    supportsOpenAIGrammarTools: true,
    supportsToolSearch: true,
    supportsExplicitPromptCacheMode: true,
  },
};

/** Streams stay the catalogue provider's own, so a faux catalogue under test keeps its responses. */
export const openaiProviderWithGpt6 = (): Provider => {
  const catalogue = openaiProvider();
  return {
    ...catalogue,
    getModels: () => [...catalogue.getModels(), gpt6Luna],
  };
};
