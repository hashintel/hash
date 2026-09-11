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
    environment: Parameters<typeof getVoiceProvider>[0];
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

    const signal = AbortSignal.any([
      request.signal,
      AbortSignal.timeout(availability.connectionTimeoutMs),
    ]);
    try {
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

      const form = new FormData();
      form.set("sdp", sdp);
      form.set(
        "session",
        JSON.stringify({
          type: "transcription",
          audio: {
            input: {
              transcription: { model: "gpt-live-transcribe" },
              turn_detection: { type: "semantic_vad" },
            },
          },
        }),
      );
      const upstream = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        signal,
        headers: {
          authorization: `Bearer ${environment.OPENAI_VOICE_API_KEY!.trim()}`,
        },
        body: form,
      });
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

      return Response.json(
        { sdp: answer },
        { status: 201, headers: { "cache-control": "no-store" } },
      );
    } catch {
      return respond(
        "Transcription connection failed. The remote session outcome may be unknown; no automatic retry was made.",
        502,
      );
    }
  };
