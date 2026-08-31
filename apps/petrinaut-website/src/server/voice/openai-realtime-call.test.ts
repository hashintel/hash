import { afterEach, describe, expect, test, vi } from "vitest";

import {
  VOICE_ERROR_CODE_HEADER,
  VOICE_REQUEST_ID_HEADER,
} from "../../voice-diagnostics";
import { createOpenAIRealtimeCallHandler } from "./openai-realtime-call";

const enabledEnvironment = {
  OPENAI_VOICE_API_KEY: "server-secret",
  PETRINAUT_OPENAI_VOICE_ENABLED: "true",
  VERCEL_ENV: "preview",
};
const requestId = "00000000-0000-4000-8000-000000000001";
const generatedRequestId = "00000000-0000-4000-8000-000000000002";

const createRequest = (
  body = "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\n",
  overrides: ConstructorParameters<typeof Request>[1] = {},
) =>
  new Request("https://petrinaut.test/api/voice/realtime-call", {
    body,
    headers: {
      "content-type": "application/sdp",
      origin: "https://petrinaut.test",
      [VOICE_REQUEST_ID_HEADER]: requestId,
    },
    method: "POST",
    ...overrides,
  });

describe("OpenAI Realtime call handler", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("rejects unavailable, cross-origin, and malformed requests without calling OpenAI", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const disabledHandler = createOpenAIRealtimeCallHandler({
      environment: {},
      fetch,
    });

    const disabled = await disabledHandler(createRequest());
    expect(disabled.status).toBe(404);
    expect(disabled.headers.get("cache-control")).toBe("no-store");

    const handler = createOpenAIRealtimeCallHandler({
      environment: enabledEnvironment,
      fetch,
    });
    const cases = [
      createRequest(undefined, { method: "GET", body: undefined }),
      createRequest(undefined, {
        headers: {
          "content-type": "application/sdp",
          origin: "https://attacker.test",
        },
      }),
      createRequest(undefined, {
        headers: { origin: "https://petrinaut.test" },
      }),
      createRequest("   "),
      createRequest("not-an-sdp-offer"),
      createRequest("x", {
        headers: {
          "content-length": "65537",
          "content-type": "application/sdp",
          origin: "https://petrinaut.test",
        },
      }),
    ];

    const responses = await Promise.all(
      cases.map((request) => handler(request)),
    );

    expect(responses.map(({ status }) => status)).toEqual([
      405, 403, 415, 400, 400, 413,
    ]);
    expect(
      responses.every(
        (response) => response.headers.get("cache-control") === "no-store",
      ),
    ).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  test("forwards only the SDP and server-owned transcription policy", async () => {
    const reportDiagnostic = vi.fn();
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response("v=0\r\no=OpenAI answer", {
          headers: { "content-type": "text/plain; charset=utf-8" },
        }),
    );
    const handler = createOpenAIRealtimeCallHandler({
      environment: enabledEnvironment,
      fetch,
      now: () => 100,
      reportDiagnostic,
    });

    const response = await handler(createRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-type")).toContain("application/sdp");
    expect(response.headers.get(VOICE_REQUEST_ID_HEADER)).toBe(requestId);
    expect(response.headers.get("server-timing")).toBe(
      "petrinaut_voice_connection;dur=0",
    );
    expect(await response.text()).toBe("v=0\r\no=OpenAI answer");
    expect(fetch).toHaveBeenCalledOnce();

    const [url, request] = fetch.mock.calls[0]!;
    expect(url).toBe("https://api.openai.com/v1/realtime/calls");
    expect(request?.method).toBe("POST");
    expect(new Headers(request?.headers).get("authorization")).toBe(
      "Bearer server-secret",
    );
    expect(request?.signal).toBeInstanceOf(AbortSignal);

    const form = request?.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    const sdp = form.get("sdp");
    const session = form.get("session");
    expect(sdp).toBe("v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\n");
    expect(typeof session).toBe("string");
    expect(JSON.parse(session as string)).toMatchObject({
      type: "transcription",
      audio: {
        input: {
          transcription: { model: "gpt-live-transcribe", languages: ["en"] },
        },
      },
    });
    expect(session as string).not.toContain("response.create");
    expect(reportDiagnostic).toHaveBeenCalledWith({
      durationMs: 0,
      operation: "connection",
      outcome: "success",
      requestId,
      stage: "server",
      status: 200,
    });
    expect(JSON.stringify(reportDiagnostic.mock.calls)).not.toContain(
      "browser offer",
    );
  });

  test("replaces an untrusted request reference before diagnostics", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response("v=0\r\no=OpenAI answer", {
          headers: { "content-type": "text/plain" },
        }),
    );
    const reportDiagnostic = vi.fn();
    const handler = createOpenAIRealtimeCallHandler({
      createRequestId: () => generatedRequestId,
      environment: enabledEnvironment,
      fetch,
      reportDiagnostic,
    });

    const response = await handler(
      createRequest(undefined, {
        headers: {
          "content-type": "application/sdp",
          origin: "https://petrinaut.test",
          [VOICE_REQUEST_ID_HEADER]: "private transcript as correlation",
        },
      }),
    );

    expect(response.headers.get(VOICE_REQUEST_ID_HEADER)).toBe(
      generatedRequestId,
    );
    expect(reportDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: generatedRequestId }),
    );
    expect(JSON.stringify(reportDiagnostic.mock.calls)).not.toContain(
      "private transcript as correlation",
    );
  });

  test("sanitizes upstream failures", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response("upstream secret diagnostics", { status: 400 }),
    );
    const handler = createOpenAIRealtimeCallHandler({
      environment: enabledEnvironment,
      fetch,
    });

    const response = await handler(createRequest());

    expect(response.status).toBe(502);
    const responseBody = await response.text();
    expect(responseBody).toBe(
      "The voice connection returned an invalid response. Try again; if it continues, give the diagnostic reference to an operator.",
    );
    expect(responseBody).not.toContain("secret");
    expect(response.headers.get(VOICE_ERROR_CODE_HEADER)).toBe(
      "invalid-response",
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  test("rejects a non-SDP upstream answer", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response("v=0\r\no=not actually SDP", {
          headers: { "content-type": "application/json" },
        }),
    );
    const handler = createOpenAIRealtimeCallHandler({
      environment: enabledEnvironment,
      fetch,
    });

    const response = await handler(createRequest());

    expect(response.status).toBe(502);
    expect(await response.text()).toBe(
      "The voice connection returned an invalid response. Try again; if it continues, give the diagnostic reference to an operator.",
    );
  });

  test("sanitizes failures while reading the SDP offer", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const handler = createOpenAIRealtimeCallHandler({
      environment: enabledEnvironment,
      fetch,
    });
    const request = createRequest();
    vi.spyOn(request, "arrayBuffer").mockRejectedValue(
      new DOMException("client disconnected", "AbortError"),
    );

    const response = await handler(request);

    expect(response.status).toBe(502);
    expect(await response.text()).toBe(
      "The voice connection could not be established.",
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  test("does not contact OpenAI when the request aborts while its body is read", async () => {
    const requestAbortController = new AbortController();
    const fetch = vi.fn<typeof globalThis.fetch>();
    const handler = createOpenAIRealtimeCallHandler({
      environment: enabledEnvironment,
      fetch,
    });
    const request = createRequest(undefined, {
      signal: requestAbortController.signal,
    });
    const encodedOffer = new TextEncoder().encode(
      "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\n",
    );
    vi.spyOn(request, "arrayBuffer").mockImplementation(() => {
      requestAbortController.abort();
      return Promise.resolve(encodedOffer.buffer);
    });

    const response = await handler(request);

    expect(response.status).toBe(502);
    expect(fetch).not.toHaveBeenCalled();
  });

  test("aborts a slow upstream call after the server timeout", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn<typeof globalThis.fetch>(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    const handler = createOpenAIRealtimeCallHandler({
      environment: enabledEnvironment,
      fetch,
    });

    const responsePromise = handler(createRequest());
    await vi.advanceTimersByTimeAsync(15_000);

    const response = await responsePromise;
    expect(response.status).toBe(504);
    expect(await response.text()).toBe(
      "The voice connection timed out. Check your connection, then reconnect voice input.",
    );
    expect(response.headers.get(VOICE_ERROR_CODE_HEADER)).toBe("timeout");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  test("propagates a disconnected browser request to OpenAI", async () => {
    const requestAbortController = new AbortController();
    let upstreamSignal: AbortSignal | null = null;
    const fetch = vi.fn<typeof globalThis.fetch>(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          upstreamSignal = init?.signal ?? null;
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    const handler = createOpenAIRealtimeCallHandler({
      environment: enabledEnvironment,
      fetch,
    });

    const responsePromise = handler(
      createRequest(undefined, { signal: requestAbortController.signal }),
    );
    await vi.waitFor(() => expect(upstreamSignal).not.toBeNull());
    requestAbortController.abort();

    const response = await responsePromise;
    expect(fetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    expect(response.status).toBe(502);
    expect(response.headers.get(VOICE_ERROR_CODE_HEADER)).toBe(
      "request-aborted",
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  test("does not start an unabortable call for a pre-aborted request", async () => {
    const requestAbortController = new AbortController();
    requestAbortController.abort();
    const fetch = vi.fn<typeof globalThis.fetch>(async (_input, init) => {
      expect(init?.signal?.aborted).toBe(true);
      throw new DOMException("aborted", "AbortError");
    });
    const handler = createOpenAIRealtimeCallHandler({
      environment: enabledEnvironment,
      fetch,
    });

    const response = await handler(
      createRequest(undefined, { signal: requestAbortController.signal }),
    );

    expect(fetch).toHaveBeenCalledOnce();
    expect(response.status).toBe(502);
    expect(response.headers.get(VOICE_ERROR_CODE_HEADER)).toBe(
      "request-aborted",
    );
  });

  test("classifies network failures without exposing upstream diagnostics", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => {
      throw new Error("private network diagnostics");
    });
    const reportDiagnostic = vi.fn();
    const handler = createOpenAIRealtimeCallHandler({
      environment: enabledEnvironment,
      fetch,
      now: () => 100,
      reportDiagnostic,
    });

    const response = await handler(createRequest());

    expect(response.status).toBe(502);
    expect(response.headers.get(VOICE_ERROR_CODE_HEADER)).toBe("network");
    expect(await response.text()).toBe(
      "The voice connection could not be reached. Check your connection, then reconnect voice input.",
    );
    expect(JSON.stringify(reportDiagnostic.mock.calls)).not.toContain(
      "private network diagnostics",
    );
  });
});
