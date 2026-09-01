import {
  voiceErrorMessage,
  type VoiceDiagnosticReporter,
  type VoiceErrorCode,
} from "../../voice-diagnostics";
import {
  createOpenAITranscriptionSession,
  getOpenAIVoiceAvailability,
  OPENAI_REALTIME_CONNECTION_TIMEOUT_MS,
} from "./openai-voice-policy";
import { createVoiceRequestDiagnostics } from "./voice-request-diagnostics";

const OPENAI_REALTIME_CALLS_ENDPOINT =
  "https://api.openai.com/v1/realtime/calls";
const MAX_SDP_BYTES = 65_536;
const timeoutError = new DOMException("Upstream timed out", "TimeoutError");

interface VoiceEnvironment {
  readonly OPENAI_VOICE_API_KEY?: string;
  readonly PETRINAUT_OPENAI_VOICE_ENABLED?: string;
  readonly VERCEL_ENV?: string;
}

interface OpenAIRealtimeCallDependencies {
  readonly createRequestId?: () => string;
  readonly environment: VoiceEnvironment;
  readonly fetch: typeof globalThis.fetch;
  readonly now?: () => number;
  readonly reportDiagnostic?: VoiceDiagnosticReporter;
}

const response = (
  body: string,
  status: number,
  headers?: HeadersInit,
): Response => {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("cache-control", "no-store");
  return new Response(body, { status, headers: responseHeaders });
};

const readSdpOffer = async (request: Request): Promise<string | Response> => {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_SDP_BYTES) {
    return response("The SDP offer is too large.", 413);
  }

  const body = await request.arrayBuffer();
  if (body.byteLength > MAX_SDP_BYTES) {
    return response("The SDP offer is too large.", 413);
  }

  const sdp = new TextDecoder().decode(body);
  const normalizedSdp = sdp.trim();
  if (!normalizedSdp || !normalizedSdp.startsWith("v=0")) {
    return response("The SDP offer is invalid.", 400);
  }
  return sdp;
};

export const createOpenAIRealtimeCallHandler =
  ({
    createRequestId,
    environment,
    fetch,
    now,
    reportDiagnostic,
  }: OpenAIRealtimeCallDependencies) =>
  async (request: Request): Promise<Response> => {
    const diagnostics = createVoiceRequestDiagnostics(request, "connection", {
      createRequestId,
      now,
      reportDiagnostic,
    });
    const voiceFailure = (
      errorCode: VoiceErrorCode,
      status: number,
    ): Response =>
      diagnostics.respond(
        response(voiceErrorMessage("connection", errorCode), status),
        errorCode,
      );

    if (request.method !== "POST") {
      return diagnostics.respond(
        response("Method not allowed.", 405, { allow: "POST" }),
      );
    }

    const requestOrigin = new URL(request.url).origin;
    if (request.headers.get("origin") !== requestOrigin) {
      return diagnostics.respond(response("Forbidden.", 403));
    }

    const contentType = request.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase();
    if (contentType !== "application/sdp") {
      return diagnostics.respond(
        response("The request must contain an SDP offer.", 415),
      );
    }

    if (!getOpenAIVoiceAvailability(environment).available) {
      return voiceFailure("unavailable", 404);
    }

    const abortController = new AbortController();
    const abortForTimeout = () => abortController.abort(timeoutError);
    const abortForRequest = () => abortController.abort();
    const timeout = globalThis.setTimeout(
      abortForTimeout,
      OPENAI_REALTIME_CONNECTION_TIMEOUT_MS,
    );
    request.signal.addEventListener("abort", abortForRequest, { once: true });
    if (request.signal.aborted) {
      abortForRequest();
    }

    try {
      abortController.signal.throwIfAborted();

      let sdp: string | Response;
      try {
        sdp = await readSdpOffer(request);
      } catch {
        const errorCode =
          abortController.signal.reason === timeoutError
            ? "timeout"
            : request.signal.aborted
              ? "request-aborted"
              : "invalid-response";
        return voiceFailure(
          errorCode,
          errorCode === "timeout"
            ? 504
            : errorCode === "request-aborted"
              ? 502
              : 400,
        );
      }
      abortController.signal.throwIfAborted();
      if (sdp instanceof Response) {
        return diagnostics.respond(sdp);
      }

      const session = createOpenAITranscriptionSession();
      const form = new FormData();
      form.set("sdp", sdp);
      form.set("session", JSON.stringify(session));

      const upstreamResponse = await fetch(OPENAI_REALTIME_CALLS_ENDPOINT, {
        body: form,
        headers: {
          authorization: `Bearer ${environment.OPENAI_VOICE_API_KEY!.trim()}`,
        },
        method: "POST",
        signal: abortController.signal,
      });
      if (!upstreamResponse.ok) {
        await upstreamResponse.body?.cancel();
        return voiceFailure("invalid-response", 502);
      }
      const upstreamContentType = upstreamResponse.headers
        .get("content-type")
        ?.split(";", 1)[0]
        ?.trim()
        .toLowerCase();
      if (
        upstreamContentType !== "application/sdp" &&
        upstreamContentType !== "text/plain"
      ) {
        await upstreamResponse.body?.cancel();
        return voiceFailure("invalid-response", 502);
      }

      const answer = await upstreamResponse.text();
      if (!answer.trim() || !answer.trimStart().startsWith("v=0")) {
        return voiceFailure("invalid-response", 502);
      }

      return diagnostics.respond(
        response(answer, 200, { "content-type": "application/sdp" }),
      );
    } catch {
      const errorCode =
        abortController.signal.reason === timeoutError
          ? "timeout"
          : request.signal.aborted
            ? "request-aborted"
            : "network";
      return voiceFailure(errorCode, errorCode === "timeout" ? 504 : 502);
    } finally {
      globalThis.clearTimeout(timeout);
      request.signal.removeEventListener("abort", abortForRequest);
    }
  };
