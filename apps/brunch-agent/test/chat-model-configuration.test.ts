import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { brunchEnv } from "@hashintel/brunch-agent";

import { verifyChatModel } from "../src/chat-model-configuration.ts";
import { openaiProviderWithAddedModels } from "../src/openai-provider.ts";

import type { Mock } from "vitest";

const providers = [anthropicProvider(), openaiProviderWithAddedModels()];
const syntheticKey = "synthetic-config-fixture-not-a-real-credential";

const fetchReturning = (status: number, body: unknown = {}) =>
  vi.fn<typeof fetch>(async () => Response.json(body, { status }));

const lookupFor = (fetchMock: Mock<typeof fetch>) => {
  const [url, init] = fetchMock.mock.calls[0] ?? [];
  return { url, headers: new Headers(init?.headers) };
};

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

describe("chat model credential presence", () => {
  test("rejects the default OpenAI model without OPENAI_API_KEY", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", syntheticKey);
    const fetchMock = fetchReturning(200);
    await expect(verifyChatModel(providers, fetchMock)).rejects.toThrow(
      'provider "openai" is not configured',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("checks the provider of an overriding model", async () => {
    vi.stubEnv(brunchEnv.chatModel, "claude-haiku-4-5");
    vi.stubEnv("OPENAI_API_KEY", syntheticKey);
    await expect(
      verifyChatModel(providers, fetchReturning(200)),
    ).rejects.toThrow('provider "anthropic" is not configured');
  });

  test.each(["openai/no-such-model", "no-such-provider/model"])(
    "rejects undeclared model %s",
    async (specifier) => {
      vi.stubEnv(brunchEnv.chatModel, specifier);
      vi.stubEnv("OPENAI_API_KEY", syntheticKey);
      const failure = verifyChatModel(providers, fetchReturning(200));
      await expect(failure).rejects.toThrow(
        "is not declared by a registered provider",
      );
      await expect(failure).rejects.not.toThrow(syntheticKey);
    },
  );
});

describe("chat model provider lookup", () => {
  test("looks up the default OpenAI model with its bearer key", async () => {
    vi.stubEnv("OPENAI_API_KEY", syntheticKey);
    const fetchMock = fetchReturning(200, {
      id: "gpt-5.5-2026-04-23",
      object: "model",
    });
    await expect(verifyChatModel(providers, fetchMock)).resolves.toEqual({
      verified: true,
    });
    const { url, headers } = lookupFor(fetchMock);
    expect(url).toBe("https://api.openai.com/v1/models/gpt-5.5-2026-04-23");
    expect(headers.get("authorization")).toBe(`Bearer ${syntheticKey}`);
  });

  test("looks up an Anthropic model with its API key", async () => {
    vi.stubEnv(brunchEnv.chatModel, "claude-haiku-4-5");
    vi.stubEnv("ANTHROPIC_API_KEY", syntheticKey);
    const fetchMock = fetchReturning(200, { id: "claude-haiku-4-5" });
    await expect(verifyChatModel(providers, fetchMock)).resolves.toEqual({
      verified: true,
    });
    const { url, headers } = lookupFor(fetchMock);
    expect(url).toBe("https://api.anthropic.com/v1/models/claude-haiku-4-5");
    expect(headers.get("x-api-key")).toBe(syntheticKey);
    expect(headers.get("anthropic-version")).toBe("2023-06-01");
  });

  test("reports an announced model shutdown", async () => {
    vi.stubEnv("OPENAI_API_KEY", syntheticKey);
    await expect(
      verifyChatModel(
        providers,
        fetchReturning(200, { shutdown_date: "2026-10-23" }),
      ),
    ).resolves.toEqual({ verified: true, shutdownDate: "2026-10-23" });
  });

  test.each([
    [
      "an invalid OpenAI key",
      "OPENAI_API_KEY",
      undefined,
      401,
      { error: { code: "invalid_api_key", message: "Incorrect API key" } },
      "the provider rejected the credential",
    ],
    [
      "an invalid Anthropic key",
      "ANTHROPIC_API_KEY",
      "claude-haiku-4-5",
      401,
      { type: "error", error: { type: "authentication_error" } },
      "the provider rejected the credential",
    ],
    [
      "a model the key cannot use",
      "OPENAI_API_KEY",
      undefined,
      404,
      { error: { code: "model_not_found" } },
      "the provider does not offer this model to this credential",
    ],
  ])(
    "refuses %s",
    async (_case, keyVariable, model, status, body, expected) => {
      vi.stubEnv(keyVariable, syntheticKey);
      if (model) vi.stubEnv(brunchEnv.chatModel, model);
      const failure = verifyChatModel(providers, fetchReturning(status, body));
      await expect(failure).rejects.toThrow(expected);
      await expect(failure).rejects.not.toThrow(syntheticKey);
    },
  );

  test.each([
    [
      "a key without model-read scope",
      401,
      { error: { message: "Missing scopes: api.model.read" } },
      "http-401",
    ],
    [
      "a forbidden lookup",
      403,
      { error: { type: "permission_error" } },
      "http-403",
    ],
    ["a rate limit", 429, {}, "http-429"],
    ["a provider outage", 503, {}, "http-503"],
  ])("starts unverified after %s", async (_case, status, body, reason) => {
    vi.stubEnv("OPENAI_API_KEY", syntheticKey);
    await expect(
      verifyChatModel(providers, fetchReturning(status, body)),
    ).resolves.toEqual({ verified: false, reason });
  });

  test("starts unverified when the provider is unreachable", async () => {
    vi.stubEnv("OPENAI_API_KEY", syntheticKey);
    const unreachable = vi.fn<typeof fetch>(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(verifyChatModel(providers, unreachable)).resolves.toEqual({
      verified: false,
      reason: "provider-unreachable",
    });
  });

  test("starts unverified with an Anthropic OAuth token", async () => {
    vi.stubEnv(brunchEnv.chatModel, "claude-haiku-4-5");
    vi.stubEnv("ANTHROPIC_OAUTH_TOKEN", `sk-ant-oat-${syntheticKey}`);
    const fetchMock = fetchReturning(200);
    await expect(verifyChatModel(providers, fetchMock)).resolves.toEqual({
      verified: false,
      reason: "unsupported-credential",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
