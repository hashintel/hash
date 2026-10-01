import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { brunchEnv } from "@hashintel/brunch-agent";

import { assertChatModelConfigured } from "../src/chat-model-configuration.ts";
import { openaiProviderWithAddedModels } from "../src/openai-provider.ts";

const providers = [anthropicProvider(), openaiProviderWithAddedModels()];
const syntheticKey = "synthetic-config-fixture-not-a-real-credential";

beforeEach(() => {
  for (const variable of [
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_AUTH_TOKEN",
    "ANTHROPIC_OAUTH_TOKEN",
    "OPENAI_API_KEY",
    brunchEnv.chatModel,
  ]) {
    vi.stubEnv(variable, undefined);
  }
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("chat model configuration", () => {
  test("rejects the default OpenAI model without OPENAI_API_KEY", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", syntheticKey);
    await expect(assertChatModelConfigured(providers)).rejects.toThrow(
      'provider "openai" is not configured',
    );
  });

  test("accepts the default OpenAI model with OPENAI_API_KEY", async () => {
    vi.stubEnv("OPENAI_API_KEY", syntheticKey);
    await expect(assertChatModelConfigured(providers)).resolves.toBeUndefined();
  });

  test("checks the provider of an overriding model", async () => {
    vi.stubEnv(brunchEnv.chatModel, "claude-haiku-4-5");
    vi.stubEnv("OPENAI_API_KEY", syntheticKey);
    await expect(assertChatModelConfigured(providers)).rejects.toThrow(
      'provider "anthropic" is not configured',
    );
    vi.stubEnv("ANTHROPIC_API_KEY", syntheticKey);
    await expect(assertChatModelConfigured(providers)).resolves.toBeUndefined();
  });

  test.each(["openai/no-such-model", "no-such-provider/model"])(
    "rejects undeclared model %s",
    async (specifier) => {
      vi.stubEnv(brunchEnv.chatModel, specifier);
      vi.stubEnv("OPENAI_API_KEY", syntheticKey);
      const failure = assertChatModelConfigured(providers);
      await expect(failure).rejects.toThrow(
        "is not declared by a registered provider",
      );
      await expect(failure).rejects.not.toThrow(syntheticKey);
    },
  );
});
