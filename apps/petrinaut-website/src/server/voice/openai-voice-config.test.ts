import { describe, expect, test } from "vitest";

import {
  createOpenAIVoiceConfigHandler,
  getVoiceProvider,
} from "./openai-voice-config";

describe("voice provider selection", () => {
  test.each([
    ["preview", "live"],
    ["production", "realtime"],
    [undefined, "realtime"],
  ])("without an override, VERCEL_ENV=%s resolves to %s", (env, expected) => {
    expect(getVoiceProvider({ VERCEL_ENV: env })).toBe(expected);
  });

  test.each([
    ["realtime", "preview"],
    ["live", "production"],
  ])("an explicit %s override wins in VERCEL_ENV=%s", (provider, env) => {
    expect(
      getVoiceProvider({ PETRINAUT_VOICE_PROVIDER: provider, VERCEL_ENV: env }),
    ).toBe(provider);
  });

  test("an invalid explicit provider disables Voice instead of falling back to the preview default", () => {
    expect(
      getVoiceProvider({
        PETRINAUT_VOICE_PROVIDER: "gemini",
        VERCEL_ENV: "preview",
      }),
    ).toBeNull();
  });
});

describe("OpenAI voice config handler", () => {
  const readConfig = async (
    environment: Parameters<typeof createOpenAIVoiceConfigHandler>[0],
  ) => {
    const response = await createOpenAIVoiceConfigHandler(environment)(
      new Request("https://petrinaut.test/api/voice/config"),
    );
    const body: unknown = await response.json();
    return { response, body };
  };

  test("returns configured production availability without exposing server settings", async () => {
    const { response, body } = await readConfig({
      OPENAI_VOICE_API_KEY: "server-secret",
      PETRINAUT_OPENAI_VOICE_ENABLED: "true",
      VERCEL_ENV: "production",
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toEqual({
      available: true,
      connectionTimeoutMs: 15_000,
      provider: "realtime",
    });
  });

  test("reports live for an enabled preview without an override", async () => {
    const { body } = await readConfig({
      OPENAI_VOICE_API_KEY: "server-secret",
      PETRINAUT_OPENAI_VOICE_ENABLED: "true",
      VERCEL_ENV: "preview",
    });

    expect(body).toMatchObject({ available: true, provider: "live" });
  });

  test.each([
    ["enablement", { OPENAI_VOICE_API_KEY: "server-secret" }],
    ["API-key", { PETRINAUT_OPENAI_VOICE_ENABLED: "true" }],
  ])(
    "the preview default does not bypass the %s gate",
    async (_gate, environment) => {
      const { body } = await readConfig({
        ...environment,
        VERCEL_ENV: "preview",
      });

      expect(body).toMatchObject({ available: false, provider: "live" });
    },
  );

  test("rejects non-GET requests", async () => {
    const handler = createOpenAIVoiceConfigHandler({});

    const response = await handler(
      new Request("https://petrinaut.test/api/voice/config", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
