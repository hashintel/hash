import {
  createVoiceRequestId,
  voiceDurationMs,
} from "../../voice-diagnostics.js";
import { getVoiceProvider } from "./openai-voice-config.js";
import { getOpenAIVoiceAvailability } from "./openai-voice-policy.js";

const maxSdpBytes = 65_536;

const respond = (body: string, status: number, headers?: HeadersInit) => {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("cache-control", "no-store");
  return new Response(body, { status, headers: responseHeaders });
};

/** Creates the authoritative transcription-only WebRTC session server-side. */
export const createOpenAITranscriptionSessionHandler =
  ({
    environment,
    fetch,
  }: {
    environment: Parameters<typeof getVoiceProvider>[0] & {
      readonly NODE_ENV?: string;
    };
    fetch: typeof globalThis.fetch;
  }) =>
  async (request: Request): Promise<Response> => {
    if (request.method !== "POST")
      return respond("Method not allowed.", 405, { allow: "POST" });
    if (request.headers.get("origin") !== new URL(request.url).origin)
      return respond("Forbidden.", 403);
    if (
      request.headers
        .get("content-type")
        ?.split(";", 1)[0]
        ?.trim()
        .toLowerCase() !== "application/sdp"
    )
      return respond("Expected SDP.", 415);

    const availability = getOpenAIVoiceAvailability(environment);
    if (!availability.available || getVoiceProvider(environment) !== "live")
      return respond("Transcription is unavailable.", 404);

    const requestId = createVoiceRequestId();
    const startedAt = performance.now();
    let stage:
      | "reading-offer"
      | "awaiting-transcription-secret"
      | "reading-transcription-secret"
      | "awaiting-provider-headers"
      | "reading-provider-answer"
      | "answer-ready" = "reading-offer";
    let upstreamStatus: number | undefined;
    let upstreamErrorCode: string | undefined;
    let upstreamErrorParam: string | undefined;
    let upstreamErrorMessage: string | undefined;
    const timeoutSignal = AbortSignal.timeout(availability.connectionTimeoutMs);
    const signal = AbortSignal.any([request.signal, timeoutSignal]);
    const report = (event: "progress" | "finished") => {
      // Operational fields plus a bounded, redacted, local-only configuration
      // rejection. Never log full provider bodies, SDP or exception messages.
      // Terminal logs survive a browser abort that prevents an HTTP response.
      // oxlint-disable-next-line no-console -- diagnose the manual experiment's stalled transcription handshake.
      console.info(
        "[Petrinaut transcription]",
        JSON.stringify({
          requestId,
          event,
          stage,
          durationMs: voiceDurationMs(startedAt, performance.now()),
          upstreamStatus,
          upstreamErrorCode,
          upstreamErrorParam,
          upstreamErrorMessage,
          // The dev adapter's lazy signal can retain a stale aborted flag.
          // This is the actual signal supplied to fetch and the upload reader.
          aborted: signal.aborted,
          requestAborted: request.signal.aborted,
          timedOut: timeoutSignal.aborted,
        }),
      );
    };
    try {
      report("progress");
      signal.throwIfAborted();
      if (Number(request.headers.get("content-length")) > maxSdpBytes)
        return respond("SDP too large.", 413);

      const bytes = new Uint8Array(maxSdpBytes);
      let length = 0;
      try {
        await request.body?.pipeTo(
          new WritableStream<Uint8Array>({
            write(chunk) {
              length += chunk.byteLength;
              if (length > bytes.byteLength) throw new Error("SDP too large");
              bytes.set(chunk, length - chunk.byteLength);
            },
          }),
          { signal },
        );
      } catch (error) {
        if (length > bytes.byteLength) return respond("SDP too large.", 413);
        throw error;
      }

      const sdp = new TextDecoder().decode(bytes.subarray(0, length));
      if (!sdp.trimStart().startsWith("v=0"))
        return respond("Invalid SDP.", 400);
      signal.throwIfAborted();

      // The unified multipart calls schema only configures realtime sessions.
      // Configure transcription on a client secret, retained server-side, then
      // use that scoped credential for the documented raw-SDP exchange.
      stage = "awaiting-transcription-secret";
      report("progress");
      const secretResponse = await fetch(
        "https://api.openai.com/v1/realtime/client_secrets",
        {
          method: "POST",
          signal,
          headers: {
            authorization: `Bearer ${environment.OPENAI_VOICE_API_KEY!.trim()}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            session: {
              type: "transcription",
              audio: {
                input: {
                  transcription: { model: "gpt-4o-transcribe" },
                  turn_detection: { type: "server_vad" },
                },
              },
            },
          }),
        },
      );
      upstreamStatus = secretResponse.status;
      stage = "reading-transcription-secret";
      report("progress");
      if (!secretResponse.ok) {
        upstreamErrorCode = "unrecognized";
        upstreamErrorParam = "unrecognized";
        try {
          // Error messages may echo credentials or input. Read at most 8 KiB
          // under the existing deadline and retain only exact allowlisted fields.
          const errorBytes = new Uint8Array(8192);
          let errorLength = 0;
          await secretResponse.body?.pipeTo(
            new WritableStream<Uint8Array>({
              write(chunk) {
                if (errorLength + chunk.byteLength > errorBytes.byteLength)
                  throw new Error("Provider error body too large");
                errorBytes.set(chunk, errorLength);
                errorLength += chunk.byteLength;
              },
            }),
            { signal },
          );
          const body: unknown = JSON.parse(
            new TextDecoder().decode(errorBytes.subarray(0, errorLength)),
          );
          if (
            typeof body === "object" &&
            body !== null &&
            "error" in body &&
            typeof body.error === "object" &&
            body.error !== null
          ) {
            const error = body.error;
            if (
              "code" in error &&
              typeof error.code === "string" &&
              [
                "invalid_value",
                "invalid_parameter",
                "invalid_request_error",
                "unknown_parameter",
                "missing_required_parameter",
                "unsupported_parameter",
                "unsupported_value",
                "model_not_found",
                "unsupported_model",
                "invalid_api_key",
                "insufficient_quota",
                "rate_limit_exceeded",
              ].includes(error.code)
            )
              upstreamErrorCode = error.code;
            if (
              "param" in error &&
              typeof error.param === "string" &&
              [
                "session",
                "session.type",
                "session.audio",
                "session.audio.input",
                "session.audio.input.transcription",
                "session.audio.input.transcription.model",
                "session.audio.input.turn_detection",
                "session.audio.input.turn_detection.type",
                "audio.input.transcription",
                "audio.input.transcription.model",
                "audio.input.turn_detection",
                "audio.input.turn_detection.type",
                "transcription.model",
                "turn_detection",
                "turn_detection.type",
                "model",
              ].includes(error.param)
            )
              upstreamErrorParam = error.param;

            // This request sends only fixed session configuration, not SDP or
            // audio. Inspect this specific rejection locally without exposing
            // arbitrary provider wording in deployed logs or HTTP responses.
            if (
              environment.NODE_ENV === "development" &&
              ["localhost", "127.0.0.1", "[::1]"].includes(
                new URL(request.url).hostname,
              ) &&
              secretResponse.status === 400 &&
              upstreamErrorCode === "invalid_value" &&
              upstreamErrorParam === "session.audio.input.turn_detection" &&
              "message" in error &&
              typeof error.message === "string"
            ) {
              upstreamErrorMessage = error.message
                .replaceAll(
                  environment.OPENAI_VOICE_API_KEY!.trim(),
                  "[redacted]",
                )
                .replaceAll(sdp, "[redacted]")
                .replace(/\b(?:sk|ek)-[A-Za-z0-9_-]+/gu, "[redacted]")
                .slice(0, 1024);
            }
          }
        } catch {
          // A malformed, oversized or aborted diagnostic body must not hide the
          // rejection status already received, trigger a retry, or expose text.
        }
        return respond("Transcription credential creation failed.", 502, {
          "x-voice-upstream-status": String(secretResponse.status),
        });
      }
      const secret: unknown = await secretResponse.json();
      signal.throwIfAborted();
      if (
        typeof secret !== "object" ||
        secret === null ||
        !("value" in secret) ||
        typeof secret.value !== "string" ||
        !secret.value.trim() ||
        !("session" in secret) ||
        typeof secret.session !== "object" ||
        secret.session === null ||
        !("type" in secret.session) ||
        secret.session.type !== "transcription"
      )
        return respond("Invalid transcription credential response.", 502);

      stage = "awaiting-provider-headers";
      upstreamStatus = undefined;
      report("progress");
      const upstream = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        signal,
        headers: {
          authorization: `Bearer ${secret.value}`,
          "content-type": "application/sdp",
        },
        body: sdp,
      });
      upstreamStatus = upstream.status;
      stage = "reading-provider-answer";
      report("progress");
      if (!upstream.ok) {
        await upstream.body?.cancel();
        return respond("Transcription session creation failed.", 502, {
          "x-voice-upstream-status": String(upstream.status),
        });
      }
      const contentType = upstream.headers
        .get("content-type")
        ?.split(";", 1)[0]
        ?.trim()
        .toLowerCase();
      if (contentType !== "application/sdp" && contentType !== "text/plain") {
        await upstream.body?.cancel();
        return respond("Transcription session creation failed.", 502);
      }
      const answer = await upstream.text();
      if (!answer.trimStart().startsWith("v=0"))
        return respond("Transcription session creation failed.", 502);

      stage = "answer-ready";
      return Response.json(
        { sdp: answer },
        { status: 201, headers: { "cache-control": "no-store" } },
      );
    } catch {
      return respond(
        "Transcription connection failed. The remote session outcome may be unknown; no automatic retry was made.",
        502,
      );
    } finally {
      report("finished");
    }
  };
