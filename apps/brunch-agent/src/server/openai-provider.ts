import { openaiProvider } from "@earendil-works/pi-ai/providers/openai";

import type { Model, Provider } from "@earendil-works/pi-ai";

/**
 * pi-ai's OpenAI catalogue plus two models it lacks. Flue 2.x resolves models
 * through pi-ai ^0.83.0, which lists GPT-5.5 only as the undated `gpt-5.5` and
 * predates GPT-6. Delete this module and register `openaiProvider()` once Flue
 * resolves a pi-ai that declares both.
 */

/** The snapshot Petrinaut assistants run by default: pi-ai 0.83.0's `gpt-5.5` entry under its dated id. */
const gpt55Snapshot: Model<"openai-responses"> = {
  id: "gpt-5.5-2026-04-23",
  name: "GPT-5.5 (2026-04-23)",
  api: "openai-responses",
  provider: "openai",
  baseUrl: "https://api.openai.com/v1",
  reasoning: true,
  input: ["text", "image"],
  cost: {
    input: 5,
    output: 30,
    cacheRead: 0.5,
    cacheWrite: 0,
    tiers: [
      {
        inputTokensAbove: 272000,
        input: 10,
        output: 45,
        cacheRead: 1,
        cacheWrite: 0,
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
    max: null,
  },
  compat: {
    supportsStrictMode: true,
    supportsOpenAIGrammarTools: true,
    supportsToolSearch: true,
  },
};

/** An opt-in for testing, copied from the pi-ai 0.87.1 catalogue. */
const gpt6Sol: Model<"openai-responses"> = {
  id: "gpt-6-sol",
  name: "GPT-6 Sol",
  api: "openai-responses",
  provider: "openai",
  baseUrl: "https://api.openai.com/v1",
  reasoning: true,
  input: ["text", "image"],
  cost: {
    input: 2,
    output: 10,
    cacheRead: 0.2,
    cacheWrite: 2.5,
    tiers: [
      {
        inputTokensAbove: 272000,
        input: 4,
        output: 15,
        cacheRead: 0.4,
        cacheWrite: 5,
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
export const openaiProviderWithAddedModels = (): Provider => {
  const catalogue = openaiProvider();
  return {
    ...catalogue,
    getModels: () => [...catalogue.getModels(), gpt55Snapshot, gpt6Sol],
  };
};
