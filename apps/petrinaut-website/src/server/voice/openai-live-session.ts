import { getVoiceProvider } from "./openai-voice-config.js";
import { getOpenAIVoiceAvailability } from "./openai-voice-policy.js";

const instructions = `Brunch is the sole authority for domain interpretation, interview
questions and answers, application work, and completion. Your role is best-effort
conversational delivery of supplied settled Brunch context.

Faithfully convey that context without inventing facts, changing quantities or
negation, removing uncertainty, or presenting unreported work as complete. Do not
independently answer or ask substantive domain questions. Do not use or call tools.

Keep delivery concise and natural. Use only brief, sparse acknowledgements, avoid
repetitive praise, and ground any progress statement only in real application events
supplied to you. Stop speaking when interrupted and follow later supplied corrections.

These are behavioral instructions for a best-effort native Live experiment; never
claim that prompting mechanically enforces these boundaries.`;

/** Uses the existing website credential boundary; this switch is not authentication. */
export const createOpenAILiveSessionHandler =
  ({
    environment,
    fetch,
  }: {
    environment: Parameters<typeof getVoiceProvider>[0];
    fetch: typeof globalThis.fetch;
  }) =>
  async (request: Request): Promise<Response> => {
    const respond = (
      body: string,
      status: number,
      headers?: Record<string, string>,
    ) =>
      new Response(body, {
        status,
        headers: { "cache-control": "no-store", ...headers },
      });
    if (request.method !== "POST")
      return respond("Method not allowed.", 405, { allow: "POST" });
    if (request.headers.get("origin") !== new URL(request.url).origin)
      return respond("Forbidden.", 403);
    if (
      request.headers
        .get("content-type")
        ?.split(";")[0]
        ?.trim()
        .toLowerCase() !== "application/sdp"
    )
      return respond("Expected SDP.", 415);
    const availability = getOpenAIVoiceAvailability(environment);
    if (!availability.available || getVoiceProvider(environment) !== "live")
      return respond("Live is unavailable.", 404);

    const signal = AbortSignal.any([
      request.signal,
      AbortSignal.timeout(availability.connectionTimeoutMs),
    ]);
    try {
      signal.throwIfAborted();
      if (Number(request.headers.get("content-length")) > 65_536)
        return respond("SDP too large.", 413);
      const body = new Uint8Array(65_536);
      let length = 0;
      try {
        // Bound memory while reading, including chunked offers, and cancel stalled uploads.
        await request.body?.pipeTo(
          new WritableStream<Uint8Array>({
            write(chunk) {
              length += chunk.byteLength;
              if (length > body.byteLength) throw new Error("SDP too large");
              body.set(chunk, length - chunk.byteLength);
            },
          }),
          { signal },
        );
      } catch (error) {
        if (length > body.byteLength) return respond("SDP too large.", 413);
        throw error;
      }
      const sdp = new TextDecoder().decode(body.subarray(0, length));
      if (!sdp.trimStart().startsWith("v=0"))
        return respond("Invalid SDP.", 400);
      signal.throwIfAborted();
      const upstream = await fetch("https://api.openai.com/v1/live/sessions", {
        method: "POST",
        signal,
        headers: {
          authorization: `Bearer ${environment.OPENAI_VOICE_API_KEY!.trim()}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          session: {
            model: "gpt-live-1",
            instructions,
            delegation: { type: "client" },
            store: false,
            audio: { output: { voice: "marin" } },
          },
          transport: { type: "webrtc", sdp },
        }),
      });
      if (!upstream.ok) {
        await upstream.body?.cancel();
        return respond(
          "Live session creation failed. No automatic retry was made.",
          502,
          { "x-voice-upstream-status": String(upstream.status) },
        );
      }
      const answer: unknown = await upstream.json();
      if (
        typeof answer !== "object" ||
        answer === null ||
        !("session" in answer) ||
        !("transport" in answer)
      )
        throw new Error("Invalid answer");
      const { session, transport } = answer;
      if (
        typeof session !== "object" ||
        session === null ||
        !("id" in session) ||
        typeof session.id !== "string" ||
        typeof transport !== "object" ||
        transport === null ||
        !("type" in transport) ||
        transport.type !== "webrtc" ||
        !("sdp" in transport) ||
        typeof transport.sdp !== "string" ||
        !transport.sdp.trimStart().startsWith("v=0")
      )
        throw new Error("Invalid answer");
      return Response.json(
        { sessionId: session.id, sdp: transport.sdp },
        { status: 201, headers: { "cache-control": "no-store" } },
      );
    } catch {
      return respond(
        "Live connection failed. The remote session outcome may be unknown; no automatic retry was made.",
        502,
      );
    }
  };
