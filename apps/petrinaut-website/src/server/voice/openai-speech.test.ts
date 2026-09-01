import { afterEach, describe, expect, test, vi } from "vitest";

import {
  VOICE_ERROR_CODE_HEADER,
  VOICE_REQUEST_ID_HEADER,
} from "../../voice-diagnostics";
import {
  createOpenAISpeechHandler,
  OPENAI_SPEECH_TIMEOUT_MS,
} from "./openai-speech";

const enabledEnvironment = {
  OPENAI_VOICE_API_KEY: "server-secret",
  PETRINAUT_OPENAI_VOICE_ENABLED: "true",
  VERCEL_ENV: "preview",
};
const requestId = "00000000-0000-4000-8000-000000000003";

const validSpeechRequest = {
  segmentId: "canonical-speech:assistant-1:text%3A0:fnv1a32:69f1e741",
  text: "  Preserve this exact canonical text.  ",
};

const createRequest = (
  body: BodyInit | null = JSON.stringify(validSpeechRequest),
  overrides: ConstructorParameters<typeof Request>[1] = {},
) =>
  new Request("https://petrinaut.test/api/voice/speech", {
    body,
    headers: {
      "content-type": "application/json",
      origin: "https://petrinaut.test",
      [VOICE_REQUEST_ID_HEADER]: requestId,
    },
    method: "POST",
    ...overrides,
  });

describe("OpenAI Speech handler", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("rejects unavailable, cross-origin, malformed, and oversized requests before OpenAI", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const disabledHandler = createOpenAISpeechHandler({
      environment: {},
      fetch,
    });
    const disabled = await disabledHandler(createRequest());
    expect(disabled.status).toBe(404);
    expect(disabled.headers.get("cache-control")).toBe("no-store");

    const handler = createOpenAISpeechHandler({
      environment: enabledEnvironment,
      fetch,
    });
    const cases = [
      createRequest(null, { method: "GET" }),
      createRequest(undefined, {
        headers: {
          "content-type": "application/json",
          origin: "https://attacker.test",
        },
      }),
      createRequest(undefined, {
        headers: { origin: "https://petrinaut.test" },
      }),
      createRequest("not-json"),
      createRequest(JSON.stringify(null)),
      createRequest(JSON.stringify({ ...validSpeechRequest, extra: true })),
      createRequest(JSON.stringify({ ...validSpeechRequest, text: "   " })),
      createRequest(
        JSON.stringify({ ...validSpeechRequest, text: "🙂".repeat(4_097) }),
      ),
      createRequest(
        JSON.stringify({ ...validSpeechRequest, segmentId: "untrusted" }),
      ),
      createRequest(
        JSON.stringify({
          ...validSpeechRequest,
          segmentId: "canonical-speech:assistant-1:text%3A0:fnv1a32:12345678",
        }),
      ),
      createRequest("{}", {
        headers: {
          "content-length": "32769",
          "content-type": "application/json",
          origin: "https://petrinaut.test",
        },
      }),
    ];

    const responses = await Promise.all(
      cases.map((request) => handler(request)),
    );

    expect(responses.map(({ status }) => status)).toEqual([
      405, 403, 415, 400, 400, 400, 400, 400, 400, 400, 413,
    ]);
    expect(
      responses.every(
        (response) => response.headers.get("cache-control") === "no-store",
      ),
    ).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  test("does not contact OpenAI for a pre-aborted request", async () => {
    const requestAbortController = new AbortController();
    requestAbortController.abort();
    const fetch = vi.fn<typeof globalThis.fetch>();
    const handler = createOpenAISpeechHandler({
      environment: enabledEnvironment,
      fetch,
    });

    const response = await handler(
      createRequest(undefined, { signal: requestAbortController.signal }),
    );

    expect(response.status).toBe(502);
    expect(fetch).not.toHaveBeenCalled();
  });

  test("does not contact OpenAI when the request aborts while its body is read", async () => {
    const requestAbortController = new AbortController();
    const encodedRequest = new TextEncoder().encode(
      JSON.stringify(validSpeechRequest),
    );
    let finishBody: (() => void) | undefined;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        finishBody = () => {
          controller.enqueue(encodedRequest);
          controller.close();
        };
      },
    });
    const fetch = vi.fn<typeof globalThis.fetch>();
    const handler = createOpenAISpeechHandler({
      environment: enabledEnvironment,
      fetch,
    });

    const responsePromise = handler(
      createRequest(body, {
        duplex: "half",
        signal: requestAbortController.signal,
      } as RequestInit),
    );
    requestAbortController.abort();
    finishBody?.();
    const response = await responsePromise;

    expect(response.status).toBe(502);
    expect(fetch).not.toHaveBeenCalled();
  });

  test("streams audio for the exact canonical text with fixed server policy", async () => {
    const reportDiagnostic = vi.fn();
    const firstChunk = new Uint8Array([1, 2, 3]);
    const secondChunk = new Uint8Array([4, 5]);
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(firstChunk);
              controller.enqueue(secondChunk);
              controller.close();
            },
          }),
          { headers: { "content-type": "audio/mpeg" } },
        ),
    );
    const handler = createOpenAISpeechHandler({
      environment: enabledEnvironment,
      fetch,
      now: () => 100,
      reportDiagnostic,
    });

    const response = await handler(createRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-type")).toBe("audio/mpeg");
    expect(response.headers.get(VOICE_REQUEST_ID_HEADER)).toBe(requestId);
    expect(response.headers.get("server-timing")).toBe(
      "petrinaut_voice_speech;dur=0",
    );
    expect(fetch).toHaveBeenCalledOnce();
    const [url, request] = fetch.mock.calls[0]!;
    expect(url).toBe("https://api.openai.com/v1/audio/speech");
    expect(request?.method).toBe("POST");
    expect(new Headers(request?.headers).get("authorization")).toBe(
      "Bearer server-secret",
    );
    expect(new Headers(request?.headers).get("content-type")).toBe(
      "application/json",
    );
    expect(request?.signal).toBeInstanceOf(AbortSignal);
    const upstreamBody = JSON.parse(request?.body as string) as Record<
      string,
      unknown
    >;
    expect(upstreamBody).toEqual({
      input: validSpeechRequest.text,
      model: "gpt-4o-mini-tts",
      response_format: "mp3",
      stream_format: "audio",
      voice: "marin",
    });
    expect(upstreamBody).not.toHaveProperty("instructions");
    expect(JSON.stringify(upstreamBody)).not.toContain("say exactly");
    expect(JSON.stringify(upstreamBody)).not.toContain("response.create");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3, 4, 5]),
    );
    expect(reportDiagnostic).toHaveBeenCalledWith({
      durationMs: 0,
      operation: "speech",
      outcome: "success",
      requestId,
      stage: "server",
      status: 200,
    });
    expect(JSON.stringify(reportDiagnostic.mock.calls)).not.toContain(
      validSpeechRequest.text,
    );
  });

  test("sanitizes upstream and non-audio failures", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        new Response("upstream secret diagnostics", { status: 400 }),
      )
      .mockResolvedValueOnce(
        Response.json({ secret: "not audio" }, { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), {
          headers: { "content-type": "audio/wav" },
        }),
      );
    const handler = createOpenAISpeechHandler({
      environment: enabledEnvironment,
      fetch,
    });

    const upstreamFailure = await handler(createRequest());
    const nonAudio = await handler(createRequest());
    const wrongAudioFormat = await handler(createRequest());

    for (const response of [upstreamFailure, nonAudio, wrongAudioFormat]) {
      expect(response.status).toBe(502);
      expect(await response.text()).toBe(
        "The speech service returned an invalid response. Read the visible response instead. Try again; if it continues, give the diagnostic reference to an operator.",
      );
      expect(response.headers.get(VOICE_ERROR_CODE_HEADER)).toBe(
        "invalid-response",
      );
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
  });

  test("aborts a slow upstream request after the speech timeout", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn<typeof globalThis.fetch>(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    const handler = createOpenAISpeechHandler({
      environment: enabledEnvironment,
      fetch,
    });

    const responsePromise = handler(createRequest());
    await vi.advanceTimersByTimeAsync(OPENAI_SPEECH_TIMEOUT_MS);

    const response = await responsePromise;
    expect(response.status).toBe(504);
    expect(await response.text()).toBe(
      "The speech service timed out. Read the visible response instead.",
    );
    expect(response.headers.get(VOICE_ERROR_CODE_HEADER)).toBe("timeout");
  });

  test("does not apply the response timeout to an active audio stream", async () => {
    vi.useFakeTimers();
    const upstreamCancel = vi.fn();
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array([1, 2, 3]));
            },
            cancel: upstreamCancel,
          }),
          { headers: { "content-type": "audio/mpeg" } },
        ),
    );
    const handler = createOpenAISpeechHandler({
      environment: enabledEnvironment,
      fetch,
    });

    const response = await handler(createRequest());
    const reader = response.body!.getReader();
    await reader.read();
    await vi.advanceTimersByTimeAsync(OPENAI_SPEECH_TIMEOUT_MS);

    expect(fetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(false);

    await reader.cancel("playback stopped");
    expect(upstreamCancel).toHaveBeenCalledWith("playback stopped");
  });

  test("propagates browser disconnect while waiting for OpenAI", async () => {
    const requestAbortController = new AbortController();
    const fetch = vi.fn<typeof globalThis.fetch>(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    const handler = createOpenAISpeechHandler({
      environment: enabledEnvironment,
      fetch,
    });

    const responsePromise = handler(
      createRequest(undefined, { signal: requestAbortController.signal }),
    );
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    requestAbortController.abort();

    const response = await responsePromise;
    expect(fetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    expect(response.status).toBe(502);
    expect(response.headers.get(VOICE_ERROR_CODE_HEADER)).toBe(
      "request-aborted",
    );
  });

  test("does not start an unabortable synthesis for a pre-aborted request", async () => {
    const requestAbortController = new AbortController();
    requestAbortController.abort();
    const fetch = vi.fn<typeof globalThis.fetch>(async (_input, init) => {
      expect(init?.signal?.aborted).toBe(true);
      throw new DOMException("aborted", "AbortError");
    });
    const handler = createOpenAISpeechHandler({
      environment: enabledEnvironment,
      fetch,
    });

    const response = await handler(
      createRequest(undefined, { signal: requestAbortController.signal }),
    );

    expect(fetch).not.toHaveBeenCalled();
    expect(response.status).toBe(502);
    expect(response.headers.get(VOICE_ERROR_CODE_HEADER)).toBe(
      "request-aborted",
    );
  });

  test("classifies a browser abort while streaming as interrupted", async () => {
    const requestAbortController = new AbortController();
    let upstreamController:
      | ReadableStreamDefaultController<Uint8Array>
      | undefined;
    const reportDiagnostic = vi.fn();
    const fetch = vi.fn<typeof globalThis.fetch>(async (_input, init) => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          upstreamController = controller;
          init?.signal?.addEventListener("abort", () => {
            controller.error(init.signal!.reason);
          });
        },
      });
      return new Response(body, {
        headers: { "content-type": "audio/mpeg" },
      });
    });
    const handler = createOpenAISpeechHandler({
      environment: enabledEnvironment,
      fetch,
      reportDiagnostic,
    });
    const response = await handler(
      createRequest(undefined, { signal: requestAbortController.signal }),
    );
    const reader = response.body!.getReader();
    const read = reader.read();

    requestAbortController.abort();

    await expect(read).rejects.toMatchObject({ name: "AbortError" });
    expect(upstreamController).toBeDefined();
    expect(reportDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: "request-aborted",
        operation: "speech",
        outcome: "aborted",
        requestId,
        stage: "server",
        status: 200,
      }),
    );
  });

  test("cancels the OpenAI stream when browser playback stops reading", async () => {
    const upstreamCancel = vi.fn();
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array([1, 2, 3]));
            },
            cancel: upstreamCancel,
          }),
          { headers: { "content-type": "audio/mpeg" } },
        ),
    );
    const handler = createOpenAISpeechHandler({
      environment: enabledEnvironment,
      fetch,
    });

    const response = await handler(createRequest());
    const reader = response.body!.getReader();
    await reader.read();
    await reader.cancel("playback stopped");

    expect(fetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    expect(upstreamCancel).toHaveBeenCalledWith("playback stopped");
  });

  test("classifies network failures without exposing upstream diagnostics", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => {
      throw new Error("private speech network diagnostics");
    });
    const reportDiagnostic = vi.fn();
    const handler = createOpenAISpeechHandler({
      environment: enabledEnvironment,
      fetch,
      now: () => 100,
      reportDiagnostic,
    });

    const response = await handler(createRequest());

    expect(response.status).toBe(502);
    expect(response.headers.get(VOICE_ERROR_CODE_HEADER)).toBe("network");
    expect(await response.text()).toBe(
      "The speech service could not be reached. Read the visible response instead.",
    );
    expect(JSON.stringify(reportDiagnostic.mock.calls)).not.toContain(
      "private speech network diagnostics",
    );
  });
});
