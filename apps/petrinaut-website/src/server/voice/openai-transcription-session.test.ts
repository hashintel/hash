import { createCustomAbortControllerSignal } from "@whatwg-node/server";
import { afterEach, describe, expect, test, vi } from "vitest";

import { createOpenAITranscriptionSessionHandler } from "./openai-transcription-session";

const environment = {
  PETRINAUT_OPENAI_VOICE_ENABLED: "true",
  PETRINAUT_VOICE_PROVIDER: "live",
  OPENAI_VOICE_API_KEY: "server-only-secret",
};

const transcriptionSecret = () =>
  Response.json({
    value: "ephemeral-transcription-secret",
    session: { type: "transcription" },
  });

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

  test("configures transcription through a server-only client secret before exchanging raw SDP", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const fetch = vi
      .fn<typeof globalThis.fetch>(
        async () =>
          new Response("v=0\r\no=answer", {
            headers: { "content-type": "application/sdp" },
          }),
      )
      .mockResolvedValueOnce(transcriptionSecret());
    const response = await createOpenAITranscriptionSessionHandler({
      environment,
      fetch,
    })(request());

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ sdp: "v=0\r\no=answer" });
    expect(fetch).toHaveBeenCalledTimes(2);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("https://api.openai.com/v1/realtime/client_secrets");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("authorization")).toBe(
      "Bearer server-only-secret",
    );
    expect(new Headers(init?.headers).get("content-type")).toBe(
      "application/json",
    );
    expect(JSON.parse(init?.body as string)).toEqual({
      session: {
        type: "transcription",
        audio: {
          input: {
            transcription: { model: "gpt-4o-transcribe" },
            turn_detection: { type: "server_vad" },
          },
        },
      },
    });
    const [callUrl, callInit] = fetch.mock.calls[1]!;
    expect(callUrl).toBe("https://api.openai.com/v1/realtime/calls");
    expect(callInit?.method).toBe("POST");
    expect(callInit?.body).toBe("v=0\r\no=offer");
    expect(new Headers(callInit?.headers).get("authorization")).toBe(
      "Bearer ephemeral-transcription-secret",
    );
    expect(new Headers(callInit?.headers).get("content-type")).toBe(
      "application/sdp",
    );
    expect(callInit?.signal).toBe(init?.signal);
    expect(JSON.stringify(log.mock.calls)).not.toContain(
      "ephemeral-transcription-secret",
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain("server-only-secret");
  });

  test.each([
    {},
    { value: "" },
    { value: "ephemeral-transcription-secret", session: { type: "realtime" } },
  ])(
    "does not create a call with an invalid or non-transcription credential: %j",
    async (secret) => {
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValueOnce(Response.json(secret));
      const response = await createOpenAITranscriptionSessionHandler({
        environment,
        fetch,
      })(request());
      expect(response.status).toBe(502);
      expect(fetch).toHaveBeenCalledOnce();
      expect(await response.text()).not.toContain(
        "ephemeral-transcription-secret",
      );
    },
  );

  test("does not proceed to SDP exchange when cancelled during credential creation", async () => {
    const abort = new AbortController();
    const fetch = vi.fn<typeof globalThis.fetch>(async () => {
      abort.abort();
      return transcriptionSecret();
    });
    const response = await createOpenAITranscriptionSessionHandler({
      environment,
      fetch,
    })(request({ signal: abort.signal }));
    expect(response.status).toBe(502);
    expect(fetch).toHaveBeenCalledOnce();
  });

  test("does not retry or expose credentials when the SDP exchange is rejected", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(transcriptionSecret())
      .mockResolvedValueOnce(
        new Response("ephemeral-transcription-secret", { status: 403 }),
      );
    const response = await createOpenAITranscriptionSessionHandler({
      environment,
      fetch,
    })(request());
    expect(response.status).toBe(502);
    expect(response.headers.get("x-voice-upstream-status")).toBe("403");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(await response.text()).not.toContain(
      "ephemeral-transcription-secret",
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain(
      "ephemeral-transcription-secret",
    );
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

  test.each([
    ["invalid_value", "session.audio.input.turn_detection.type"],
    ["model_not_found", "session.audio.input.transcription.model"],
    ["server-only-secret", "private-transcript"],
  ])(
    "logs only allowlisted credential rejection metadata: %s",
    async (code, param) => {
      const log = vi.spyOn(console, "info").mockImplementation(() => {});
      const fetch = vi.fn<typeof globalThis.fetch>(async () =>
        Response.json(
          {
            error: {
              code,
              param,
              message: "server-only-secret private-transcript",
            },
          },
          { status: 400 },
        ),
      );
      const response = await createOpenAITranscriptionSessionHandler({
        environment,
        fetch,
      })(request());

      expect(response.status).toBe(502);
      expect(response.headers.get("x-voice-upstream-status")).toBe("400");
      expect(fetch).toHaveBeenCalledOnce();
      const terminal: unknown = JSON.parse(log.mock.calls.at(-1)![1] as string);
      expect(terminal).toMatchObject({
        event: "finished",
        stage: "reading-transcription-secret",
        upstreamErrorCode:
          code === "server-only-secret" ? "unrecognized" : code,
        upstreamErrorParam:
          param === "private-transcript" ? "unrecognized" : param,
      });
      const exposed = JSON.stringify(log.mock.calls) + (await response.text());
      expect(exposed).not.toContain("server-only-secret");
      expect(exposed).not.toContain("private-transcript");
    },
  );

  test("local turn-detection diagnostics preserve the explanation and redact credentials before truncation", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const explanation =
      "This transcription model requires turn_detection to be null.";
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json(
        {
          error: {
            code: "invalid_value",
            param: "session.audio.input.turn_detection",
            message: `${explanation} server-only-secret sk-proj-testtoken ek-testtoken ${"x".repeat(1024)} server-only-secret`,
          },
        },
        { status: 400 },
      ),
    );
    const response = await createOpenAITranscriptionSessionHandler({
      environment: { ...environment, NODE_ENV: "development" },
      fetch,
    })(
      new Request("http://localhost:4915/api/voice/transcription-session", {
        method: "POST",
        headers: {
          origin: "http://localhost:4915",
          "content-type": "application/sdp",
        },
        body: "v=0\r\no=offer",
      }),
    );

    const terminal: unknown = JSON.parse(log.mock.calls.at(-1)![1] as string);
    expect(terminal).toMatchObject({
      upstreamErrorMessage:
        `${explanation} [redacted] [redacted] [redacted] ${"x".repeat(1024)}`.slice(
          0,
          1024,
        ),
    });
    const exposed = JSON.stringify(log.mock.calls);
    expect(exposed).not.toContain("server-only-secret");
    expect(exposed).not.toContain("sk-proj-testtoken");
    expect(exposed).not.toContain("ek-testtoken");
    expect(await response.text()).toBe(
      "Transcription credential creation failed.",
    );
    expect(response.status).toBe(502);
    expect(fetch).toHaveBeenCalledOnce();
  });

  test.each([
    [
      "production",
      "http://localhost:4915",
      "invalid_value",
      "session.audio.input.turn_detection",
    ],
    [
      "development",
      "https://petrinaut.test",
      "invalid_value",
      "session.audio.input.turn_detection",
    ],
    [
      "development",
      "http://localhost:4915",
      "invalid_api_key",
      "session.audio.input.turn_detection",
    ],
    [
      "development",
      "http://localhost:4915",
      "invalid_value",
      "session.audio.input.transcription.model",
    ],
  ])(
    "does not expose provider wording outside the local turn-detection rejection: %s %s %s %s",
    async (nodeEnvironment, origin, code, param) => {
      const log = vi.spyOn(console, "info").mockImplementation(() => {});
      const fetch = vi.fn<typeof globalThis.fetch>(async () =>
        Response.json(
          {
            error: { code, param, message: "private-provider-wording" },
          },
          { status: 400 },
        ),
      );
      const response = await createOpenAITranscriptionSessionHandler({
        environment: { ...environment, NODE_ENV: nodeEnvironment },
        fetch,
      })(
        new Request(`${origin}/api/voice/transcription-session`, {
          method: "POST",
          headers: { origin, "content-type": "application/sdp" },
          body: "v=0\r\no=offer",
        }),
      );

      expect(JSON.stringify(log.mock.calls)).not.toContain(
        "upstreamErrorMessage",
      );
      expect(JSON.stringify(log.mock.calls)).not.toContain(
        "private-provider-wording",
      );
      expect(await response.text()).not.toContain("private-provider-wording");
      expect(fetch).toHaveBeenCalledOnce();
    },
  );

  test("bounds rejected credential bodies and keeps the received HTTP status", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const cancel = vi.fn();
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode("x".repeat(8193)));
            },
            cancel,
          }),
          { status: 400 },
        ),
    );
    const response = await createOpenAITranscriptionSessionHandler({
      environment,
      fetch,
    })(request());

    expect(response.headers.get("x-voice-upstream-status")).toBe("400");
    expect(cancel).toHaveBeenCalledOnce();
    expect(JSON.parse(log.mock.calls.at(-1)![1] as string)).toMatchObject({
      upstreamErrorCode: "unrecognized",
      upstreamErrorParam: "unrecognized",
    });
    expect(fetch).toHaveBeenCalledOnce();
  });

  test("uses the existing deadline for a stalled credential error body", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const abort = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(abort.signal);
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response(new ReadableStream(), { status: 400 }),
    );
    const pending = createOpenAITranscriptionSessionHandler({
      environment,
      fetch,
    })(request());
    await vi.waitFor(() =>
      expect(log).toHaveBeenCalledWith(
        "[Petrinaut transcription]",
        expect.stringContaining('"stage":"reading-transcription-secret"'),
      ),
    );
    abort.abort();

    const response = await pending;
    expect(response.headers.get("x-voice-upstream-status")).toBe("400");
    expect(JSON.parse(log.mock.calls.at(-1)![1] as string)).toMatchObject({
      upstreamStatus: 400,
      timedOut: true,
      upstreamErrorCode: "unrecognized",
    });
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
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const abort = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(abort.signal);
    const fetch = vi
      .fn<typeof globalThis.fetch>(
        (_input, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError")),
            );
          }),
      )
      .mockResolvedValueOnce(transcriptionSecret());
    const pending = createOpenAITranscriptionSessionHandler({
      environment,
      fetch,
    })(request());
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    abort.abort();

    expect((await pending).status).toBe(502);
    expect(log).toHaveBeenLastCalledWith(
      "[Petrinaut transcription]",
      expect.stringContaining('"stage":"awaiting-provider-headers"'),
    );
    expect(log).toHaveBeenLastCalledWith(
      "[Petrinaut transcription]",
      expect.stringContaining('"timedOut":true'),
    );
  });

  test("distinguishes an unfinished browser upload from a stalled provider request", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const abort = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(abort.signal);
    const fetch = vi.fn<typeof globalThis.fetch>();
    const pending = createOpenAITranscriptionSessionHandler({
      environment,
      fetch,
    })(
      request({
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode("v=0\r\no=private-offer"),
            );
          },
        }),
        duplex: "half",
      }),
    );
    abort.abort();

    expect((await pending).status).toBe(502);
    expect(fetch).not.toHaveBeenCalled();
    expect(log).toHaveBeenLastCalledWith(
      "[Petrinaut transcription]",
      expect.stringContaining('"stage":"reading-offer"'),
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain("private-offer");
  });

  test("reports combined cancellation with the dev adapter's lazy native signal", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const controller = createCustomAbortControllerSignal();
    const offer = request();
    // The dev adapter's Request retains this signal before AbortSignal.any
    // materializes its native controller. Its original aborted flag can stay false.
    Object.defineProperty(offer, "signal", { value: controller.signal });
    const fetch = vi.fn<typeof globalThis.fetch>(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(init.signal?.reason),
            { once: true },
          );
        }),
    );
    const pending = createOpenAITranscriptionSessionHandler({
      environment,
      fetch,
    })(offer);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    controller.abort();

    expect((await pending).status).toBe(502);
    expect(log).toHaveBeenLastCalledWith(
      "[Petrinaut transcription]",
      expect.stringContaining('"aborted":true'),
    );
    expect(log).toHaveBeenLastCalledWith(
      "[Petrinaut transcription]",
      expect.stringContaining('"timedOut":false'),
    );
    expect(fetch).toHaveBeenCalledOnce();
  });

  test("reports received provider headers before a cancelled response body without logging content", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const abort = new AbortController();
    const fetch = vi
      .fn<typeof globalThis.fetch>(
        async (_input, init) =>
          new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(
                  new TextEncoder().encode("v=0\r\no=private-answer"),
                );
                init?.signal?.addEventListener(
                  "abort",
                  () => {
                    controller.error(new Error("private-provider-error"));
                  },
                  { once: true },
                );
              },
            }),
            { status: 201, headers: { "content-type": "application/sdp" } },
          ),
      )
      .mockResolvedValueOnce(transcriptionSecret());
    const pending = createOpenAITranscriptionSessionHandler({
      environment,
      fetch,
    })(request({ signal: abort.signal }));
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    // Headers must be observable while the body is still pending.
    const progress = log.mock.calls.at(-1);
    abort.abort();
    expect((await pending).status).toBe(502);
    expect(progress).toEqual([
      "[Petrinaut transcription]",
      expect.stringContaining('"stage":"reading-provider-answer"'),
    ]);
    expect(log).toHaveBeenLastCalledWith(
      "[Petrinaut transcription]",
      expect.stringContaining('"upstreamStatus":201'),
    );
    expect(log).toHaveBeenLastCalledWith(
      "[Petrinaut transcription]",
      expect.stringContaining('"requestAborted":true'),
    );
    const logs = JSON.stringify(log.mock.calls);
    expect(logs).not.toContain("private-answer");
    expect(logs).not.toContain("private-provider-error");
    expect(logs).not.toContain("server-only-secret");
  });
});
