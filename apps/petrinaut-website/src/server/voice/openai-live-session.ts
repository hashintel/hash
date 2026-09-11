import { getVoiceProvider } from "./openai-voice-config.js";
import { getOpenAIVoiceAvailability } from "./openai-voice-policy.js";

const instructions = `You are an experimental conversational stand-in for a process interviewer, not Brunch or the application's agent. Help the speaker explain a familiar process. Listen to their meaning, allow hesitation and elaboration, and incorporate corrections. Ask one concise, relevant follow-up when uncertainty matters. Avoid repetitive acknowledgements and long monologues. Do not operate the application, call tools, or claim that changes were executed or saved. You have no access to the application's chat, model, or workpiece. Keep this a conversation, not a modelling system.`;

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
      const body = await request.arrayBuffer();
      if (body.byteLength > 65_536) return respond("SDP too large.", 413);
      const sdp = new TextDecoder().decode(body);
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
