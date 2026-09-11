import { afterEach, describe, expect, test, vi } from "vitest";

import { createOpenAITranscriptionSessionHandler } from "./openai-transcription-session";

const environment = {
  PETRINAUT_OPENAI_VOICE_ENABLED: "true",
  PETRINAUT_VOICE_PROVIDER: "live",
  OPENAI_VOICE_API_KEY: "server-only-secret",
};

const request = (overrides: RequestInit & { duplex?: "half" } = {}) =>
  new Request("https://petrinaut.test/api/voice/transcription-session", {
    method: "POST",
    headers: {
      origin: "https://petrinaut.test",
      "content-type": "application/sdp",
    },
    body: "v=0\r\no=offer",
    ...overrides,
  });

describe("OpenAI transcription WebRTC session", () => {
  afterEach(() => vi.restoreAllMocks());

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
      const response = await createOpenAITranscriptionSessionHandler({
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
      const response = await createOpenAITranscriptionSessionHandler({
        environment: { ...environment, ...override },
        fetch,
      })(request());

      expect(response.status).toBe(404);
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  test("creates one server-authorized transcription call with default semantic VAD eagerness", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response("v=0\r\no=answer", {
          headers: { "content-type": "application/sdp" },
        }),
    );
    const response = await createOpenAITranscriptionSessionHandler({
      environment,
      fetch,
    })(request());

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ sdp: "v=0\r\no=answer" });
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("https://api.openai.com/v1/realtime/calls");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("authorization")).toBe(
      "Bearer server-only-secret",
    );
    const form = init?.body as FormData;
    expect(form.get("sdp")).toBe("v=0\r\no=offer");
    expect(JSON.parse(form.get("session") as string)).toEqual({
      type: "transcription",
      audio: {
        input: {
          transcription: { model: "gpt-live-transcribe" },
          turn_detection: { type: "semantic_vad" },
        },
      },
    });
  });

  test("sanitizes invalid provider responses and never retries", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response("server-only-secret", { status: 429 }),
    );
    const response = await createOpenAITranscriptionSessionHandler({
      environment,
      fetch,
    })(request());

    expect(response.status).toBe(502);
    expect(response.headers.get("x-voice-upstream-status")).toBe("429");
    expect(await response.text()).not.toContain("server-only-secret");
    expect(fetch).toHaveBeenCalledOnce();
  });

  test("does not contact the provider after request cancellation", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const response = await createOpenAITranscriptionSessionHandler({
      environment,
      fetch,
    })(request({ signal: AbortSignal.abort() }));

    expect(response.status).toBe(502);
    expect(fetch).not.toHaveBeenCalled();
  });

  test("aborts a stalled provider call at the existing connection timeout", async () => {
    const abort = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(abort.signal);
    const fetch = vi.fn<typeof globalThis.fetch>(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    const pending = createOpenAITranscriptionSessionHandler({
      environment,
      fetch,
    })(request());
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    abort.abort();

    expect((await pending).status).toBe(502);
  });
});
