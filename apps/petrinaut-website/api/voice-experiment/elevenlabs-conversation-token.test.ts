import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import api from "./elevenlabs-conversation-token";

declare const process: {
  env: Record<string, string | undefined>;
};

const endpoint =
  "https://petrinaut.local/api/voice-experiment/elevenlabs-conversation-token";

const createRequest = (init: RequestInit = {}) =>
  new Request(endpoint, {
    method: "POST",
    headers: {
      origin: "https://petrinaut.local",
      "x-voice-experiment": "elevenlabs-brunch",
    },
    ...init,
  });

describe("ElevenLabs conversation-token endpoint", () => {
  const originalApiKey = process.env.ELEVENLABS_API_KEY;
  const originalSpeechEngineId = process.env.ELEVENLABS_SPEECH_ENGINE_ID;
  const originalVercelEnvironment = process.env.VERCEL_ENV;

  beforeEach(() => {
    process.env.ELEVENLABS_API_KEY =
      "primary-elevenlabs-secret-that-must-stay-server-side"; // nosemgrep: hardcoded_secrets.node_api_key
    process.env.ELEVENLABS_SPEECH_ENGINE_ID = "seng_server_owned";
    delete process.env.VERCEL_ENV;
  });

  afterEach(() => {
    process.env.ELEVENLABS_API_KEY = originalApiKey;
    process.env.ELEVENLABS_SPEECH_ENGINE_ID = originalSpeechEngineId;
    process.env.VERCEL_ENV = originalVercelEnvironment;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test("rejects unsupported methods without calling ElevenLabs", async () => {
    const upstreamFetch = vi.fn();
    vi.stubGlobal("fetch", upstreamFetch);

    const response = await api.fetch(createRequest({ method: "GET" }));

    expect(response.status).toBe(405);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  test("requires a same-origin ElevenLabs experiment request", async () => {
    const upstreamFetch = vi.fn();
    vi.stubGlobal("fetch", upstreamFetch);

    const crossOriginResponse = await api.fetch(
      createRequest({
        headers: {
          origin: "https://attacker.example",
          "x-voice-experiment": "elevenlabs-brunch",
        },
      }),
    );
    const unmarkedResponse = await api.fetch(
      createRequest({
        headers: { origin: "https://petrinaut.local" },
      }),
    );

    expect(crossOriginResponse.status).toBe(403);
    expect(unmarkedResponse.status).toBe(403);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  test("rejects browser-supplied speech-engine configuration", async () => {
    const upstreamFetch = vi.fn();
    vi.stubGlobal("fetch", upstreamFetch);

    const response = await api.fetch(
      createRequest({
        body: JSON.stringify({ speechEngineId: "seng_browser_controlled" }),
        headers: {
          "content-type": "application/json",
          origin: "https://petrinaut.local",
          "x-voice-experiment": "elevenlabs-brunch",
        },
      }),
    );

    expect(response.status).toBe(400);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  test.each(["ELEVENLABS_API_KEY", "ELEVENLABS_SPEECH_ENGINE_ID"])(
    "fails safely when %s is missing",
    async (variable) => {
      delete process.env[variable];
      const upstreamFetch = vi.fn();
      vi.stubGlobal("fetch", upstreamFetch);

      const response = await api.fetch(createRequest());

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        error: "ElevenLabs voice is not configured",
      });
      expect(upstreamFetch).not.toHaveBeenCalled();
    },
  );

  test("mints only a token for the server-configured speech engine", async () => {
    const upstreamFetch = vi.fn().mockResolvedValue(
      Response.json({
        token: "short-lived-conversation-token",
        conversation_id: "conv_123",
        speech_engine: { id: "must-not-leak" },
      }),
    );
    vi.stubGlobal("fetch", upstreamFetch);

    const response = await api.fetch(createRequest());

    expect(response.status).toBe(200);
    const responseBody: unknown = await response.json();
    expect(responseBody).toEqual({
      conversationId: "conv_123",
      conversationToken: "short-lived-conversation-token",
    });
    expect(JSON.stringify(responseBody)).not.toContain(
      process.env.ELEVENLABS_API_KEY as string,
    );
    expect(JSON.stringify(responseBody)).not.toContain("seng_server_owned");

    expect(upstreamFetch).toHaveBeenCalledTimes(1);
    const [url, request] = upstreamFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=seng_server_owned",
    );
    expect(request.method).toBe("GET");
    expect(new Headers(request.headers).get("xi-api-key")).toBe(
      process.env.ELEVENLABS_API_KEY,
    );
  });

  test("does not expose upstream errors or the primary key", async () => {
    const upstreamFetch = vi.fn().mockResolvedValue(
      Response.json(
        {
          detail:
            "Failure containing primary-elevenlabs-secret-that-must-stay-server-side",
        },
        { status: 401 },
      ),
    );
    vi.stubGlobal("fetch", upstreamFetch);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await api.fetch(createRequest());
    const body = await response.text();

    expect(response.status).toBe(502);
    expect(body).toBe(
      JSON.stringify({ error: "Could not start ElevenLabs voice session" }),
    );
    expect(body).not.toContain("Failure containing");
    expect(body).not.toContain(process.env.ELEVENLABS_API_KEY as string);
  });
});
