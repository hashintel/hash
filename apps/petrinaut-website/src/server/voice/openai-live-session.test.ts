import { describe, expect, test, vi } from "vitest";

import { createOpenAILiveSessionHandler } from "./openai-live-session";
import { createOpenAIVoiceConfigHandler } from "./openai-voice-config";

const environment = {
  PETRINAUT_OPENAI_VOICE_ENABLED: "true",
  PETRINAUT_VOICE_PROVIDER: "live",
  OPENAI_VOICE_API_KEY: "server-only-secret",
};
const request = (overrides: RequestInit = {}) =>
  new Request("https://petrinaut.test/api/voice/live-session", {
    method: "POST",
    headers: {
      origin: "https://petrinaut.test",
      "content-type": "application/sdp",
    },
    body: "v=0\r\no=offer",
    ...overrides,
  });

describe("Live configuration and session creation", () => {
  test.each([
    [undefined, "realtime", true],
    ["realtime", "realtime", true],
    ["live", "live", true],
    ["live-brunch", null, false],
  ])(
    "selects %s without silently falling back",
    async (value, provider, available) => {
      const handler = createOpenAIVoiceConfigHandler({
        ...environment,
        PETRINAUT_VOICE_PROVIDER: value,
      });
      const response = await handler(
        new Request("https://petrinaut.test/api/voice/config"),
      );
      expect(await response.json()).toEqual({
        available,
        provider,
        connectionTimeoutMs: 15_000,
      });
    },
  );

  test.each([
    [{ method: "GET", body: undefined }, 405],
    [
      {
        headers: {
          origin: "https://attacker.test",
          "content-type": "application/sdp",
        },
      },
      403,
    ],
    [{ headers: { "content-type": "application/sdp" } }, 403],
    [
      {
        headers: {
          origin: "https://petrinaut.test",
          "content-type": "application/json",
        },
      },
      415,
    ],
    [{ body: "not SDP" }, 400],
    [{ body: "v=0" + "x".repeat(65_536) }, 413],
  ] satisfies [RequestInit, number][])(
    "rejects unsafe requests before fetching: %j",
    async (overrides, status) => {
      const fetch = vi.fn<typeof globalThis.fetch>();
      const response = await createOpenAILiveSessionHandler({
        environment,
        fetch,
      })(request(overrides));
      expect(response.status).toBe(status);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  test.each([
    { PETRINAUT_VOICE_PROVIDER: undefined },
    { PETRINAUT_VOICE_PROVIDER: "realtime" },
    { PETRINAUT_OPENAI_VOICE_ENABLED: "false" },
    { OPENAI_VOICE_API_KEY: " " },
  ])(
    "requires Live selection and existing enablement/credentials: %j",
    async (override) => {
      const fetch = vi.fn<typeof globalThis.fetch>();
      expect(
        (
          await createOpenAILiveSessionHandler({
            environment: { ...environment, ...override },
            fetch,
          })(request())
        ).status,
      ).toBe(404);
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  test("creates one client-delegated WebRTC session with trusted instructions and no tools", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json(
        {
          session: { id: "opaque/session:id" },
          transport: { type: "webrtc", sdp: "v=0\r\no=answer" },
          secret: "must-not-leak",
        },
        { status: 201 },
      ),
    );
    const response = await createOpenAILiveSessionHandler({
      environment,
      fetch,
    })(request());
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      sessionId: "opaque/session:id",
      sdp: "v=0\r\no=answer",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("https://api.openai.com/v1/live/sessions");
    expect(typeof init?.body).toBe("string");
    const body: unknown = JSON.parse(init?.body as string);
    expect(body).toEqual({
      session: {
        model: "gpt-live-1",
        delegation: { type: "client" },
        store: false,
        instructions: expect.stringMatching(
          /Interview approach:[\s\S]*Backchannel policy:[\s\S]*Interruption policy:[\s\S]*Delegation policy:\nBackend tools:\n- None\.[\s\S]*Delegate to the backend when:\n- Never in this experiment[\s\S]*Do not delegate to the backend when:[\s\S]*Never claim that anything was changed, executed, or saved\./,
        ) as unknown,
        audio: { output: { voice: "marin" } },
      },
      transport: { type: "webrtc", sdp: "v=0\r\no=offer" },
    });
    expect(new Headers(init?.headers).get("authorization")).toBe(
      "Bearer server-only-secret",
    );
  });

  test("sanitizes provider failure and never retries", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response("server-only-secret", { status: 429 }),
    );
    const response = await createOpenAILiveSessionHandler({
      environment,
      fetch,
    })(request());
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("server-only-secret");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test("does not contact the provider for an already aborted request", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const response = await createOpenAILiveSessionHandler({
      environment,
      fetch,
    })(request({ signal: AbortSignal.abort() }));
    expect(response.status).toBe(502);
    expect(fetch).not.toHaveBeenCalled();
  });
});
