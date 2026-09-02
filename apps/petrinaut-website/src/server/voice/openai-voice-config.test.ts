import { describe, expect, test } from "vitest";

import { createOpenAIVoiceConfigHandler } from "./openai-voice-config";

describe("OpenAI voice config handler", () => {
  test("returns only server-derived availability and the client timeout", async () => {
    const handler = createOpenAIVoiceConfigHandler({
      OPENAI_VOICE_API_KEY: "server-secret",
      PETRINAUT_OPENAI_VOICE_ENABLED: "true",
      VERCEL_ENV: "preview",
    });

    const response = await handler(
      new Request("https://petrinaut.test/api/voice/config"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      available: true,
      connectionTimeoutMs: 15_000,
    });
  });

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
