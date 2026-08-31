import { hashCanonicalSpeechText } from "../../canonical-speech-fingerprint";
import {
  voiceErrorMessage,
  type VoiceDiagnosticReporter,
  type VoiceErrorCode,
} from "../../voice-diagnostics";
import { getOpenAIVoiceAvailability } from "./openai-voice-policy";
import { createVoiceRequestDiagnostics } from "./voice-request-diagnostics";

const OPENAI_SPEECH_ENDPOINT = "https://api.openai.com/v1/audio/speech";
const MAX_REQUEST_BYTES = 32_768;
const MAX_SPEECH_CHARACTERS = 4_096;
const timeoutError = new DOMException("Upstream timed out", "TimeoutError");
const requestAbortError = new DOMException("Request aborted", "AbortError");

export const OPENAI_SPEECH_TIMEOUT_MS = 25_000;

interface VoiceEnvironment {
  readonly NODE_ENV?: string;
  readonly OPENAI_VOICE_API_KEY?: string;
  readonly PETRINAUT_OPENAI_VOICE_ENABLED?: string;
  readonly VERCEL_ENV?: string;
}

interface OpenAISpeechDependencies {
  readonly createRequestId?: () => string;
  readonly environment: VoiceEnvironment;
  readonly fetch: typeof globalThis.fetch;
  readonly now?: () => number;
  readonly reportDiagnostic?: VoiceDiagnosticReporter;
}

interface SpeechRequest {
  readonly segmentId: string;
  readonly text: string;
}

const response = (
  body: BodyInit | null,
  status: number,
  headers?: HeadersInit,
): Response => {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("cache-control", "no-store");
  return new Response(body, { headers: responseHeaders, status });
};

const readRequestBody = async (
  request: Request,
): Promise<string | Response> => {
  const declaredLengthHeader = request.headers.get("content-length");
  if (declaredLengthHeader !== null) {
    const declaredLength = Number(declaredLengthHeader);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
      return response("The speech request is too large.", 413);
    }
  }

  if (!request.body) {
    return "";
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let requestComplete = false;

  while (!requestComplete) {
    const { done, value } = await reader.read();
    if (done) {
      requestComplete = true;
      continue;
    }
    totalBytes += value.byteLength;
    if (totalBytes > MAX_REQUEST_BYTES) {
      await reader.cancel();
      return response("The speech request is too large.", 413);
    }
    chunks.push(value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
};

const isSpeechRequest = (value: unknown): value is SpeechRequest => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).length !== 2 ||
    typeof record.segmentId !== "string" ||
    typeof record.text !== "string"
  ) {
    return false;
  }

  return (
    record.segmentId.length <= 1_200 &&
    /^canonical-speech:[^:]+:[^:]+:fnv1a32:[0-9a-f]{8}$/u.test(
      record.segmentId,
    ) &&
    record.segmentId.endsWith(`:${hashCanonicalSpeechText(record.text)}`) &&
    Boolean(record.text.trim()) &&
    Array.from(record.text).length <= MAX_SPEECH_CHARACTERS
  );
};

const proxyAudioStream = (
  upstreamBody: ReadableStream<Uint8Array>,
  abortController: AbortController,
  finishRequest: (errorCode?: VoiceErrorCode) => void,
): ReadableStream<Uint8Array> => {
  const reader = upstreamBody.getReader();
  let finished = false;
  const finish = (errorCode?: VoiceErrorCode) => {
    if (!finished) {
      finished = true;
      finishRequest(errorCode);
    }
  };

  return new ReadableStream({
    async cancel(reason) {
      abortController.abort(reason);
      try {
        await reader.cancel(reason);
      } finally {
        finish("request-aborted");
      }
    },
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          finish();
          return;
        }
        controller.enqueue(value);
      } catch (error) {
        controller.error(error);
        finish(
          abortController.signal.reason === timeoutError
            ? "timeout"
            : abortController.signal.reason === requestAbortError
              ? "request-aborted"
              : "network",
        );
      }
    },
  });
};

export const createOpenAISpeechHandler =
  ({
    createRequestId,
    environment,
    fetch,
    now,
    reportDiagnostic,
  }: OpenAISpeechDependencies) =>
  async (request: Request): Promise<Response> => {
    const diagnostics = createVoiceRequestDiagnostics(request, "speech", {
      createRequestId,
      now,
      reportDiagnostic,
    });
    const voiceFailure = (
      errorCode: VoiceErrorCode,
      status: number,
    ): Response =>
      diagnostics.respond(
        response(voiceErrorMessage("speech", errorCode), status),
        errorCode,
      );

    if (request.method !== "POST") {
      return diagnostics.respond(
        response("Method not allowed.", 405, { allow: "POST" }),
      );
    }

    if (request.headers.get("origin") !== new URL(request.url).origin) {
      return diagnostics.respond(response("Forbidden.", 403));
    }

    const contentType = request.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase();
    if (contentType !== "application/json") {
      return diagnostics.respond(
        response("The request must contain JSON.", 415),
      );
    }

    if (!getOpenAIVoiceAvailability(environment).available) {
      return voiceFailure("unavailable", 404);
    }

    const abortController = new AbortController();
    const abortForRequest = () => abortController.abort(requestAbortError);
    request.signal.addEventListener("abort", abortForRequest, { once: true });
    if (request.signal.aborted) {
      abortForRequest();
    }
    const removeRequestAbortListener = () => {
      request.signal.removeEventListener("abort", abortForRequest);
    };

    let parsedBody: unknown;
    try {
      abortController.signal.throwIfAborted();
      const body = await readRequestBody(request);
      abortController.signal.throwIfAborted();
      if (body instanceof Response) {
        removeRequestAbortListener();
        return diagnostics.respond(body);
      }
      parsedBody = JSON.parse(body);
    } catch {
      removeRequestAbortListener();
      if (abortController.signal.aborted) {
        return voiceFailure("request-aborted", 502);
      }
      return diagnostics.respond(response("The speech request is invalid.", 400));
    }

    if (!isSpeechRequest(parsedBody)) {
      removeRequestAbortListener();
      return diagnostics.respond(
        response("The speech request is invalid.", 400),
      );
    }

    const abortForTimeout = () => abortController.abort(timeoutError);
    const timeout = globalThis.setTimeout(
      abortForTimeout,
      OPENAI_SPEECH_TIMEOUT_MS,
    );
    const clearSpeechTimeout = () => {
      globalThis.clearTimeout(timeout);
    };
    const cleanup = () => {
      clearSpeechTimeout();
      removeRequestAbortListener();
    };
    const finishStreamingRequest = (errorCode?: VoiceErrorCode) => {
      cleanup();
      diagnostics.finish(200, errorCode);
    };

    try {
      abortController.signal.throwIfAborted();
      const upstreamResponse = await fetch(OPENAI_SPEECH_ENDPOINT, {
        body: JSON.stringify({
          input: parsedBody.text,
          model: "gpt-4o-mini-tts",
          response_format: "mp3",
          stream_format: "audio",
          voice: "marin",
        }),
        headers: {
          authorization: `Bearer ${environment.OPENAI_VOICE_API_KEY!.trim()}`,
          "content-type": "application/json",
        },
        method: "POST",
        signal: abortController.signal,
      });
      const upstreamContentType = upstreamResponse.headers
        .get("content-type")
        ?.split(";", 1)[0]
        ?.trim()
        .toLowerCase();
      if (
        !upstreamResponse.ok ||
        upstreamContentType !== "audio/mpeg" ||
        !upstreamResponse.body
      ) {
        await upstreamResponse.body?.cancel();
        cleanup();
        return voiceFailure("invalid-response", 502);
      }

      clearSpeechTimeout();
      return diagnostics.decorate(
        response(
          proxyAudioStream(
            upstreamResponse.body,
            abortController,
            finishStreamingRequest,
          ),
          200,
          { "content-type": "audio/mpeg" },
        ),
      );
    } catch {
      cleanup();
      const errorCode =
        abortController.signal.reason === timeoutError
          ? "timeout"
          : request.signal.aborted
            ? "request-aborted"
            : "network";
      return voiceFailure(errorCode, errorCode === "timeout" ? 504 : 502);
    }
  };
