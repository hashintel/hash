import { getVoiceProvider } from "./openai-voice-config.js";
import { getOpenAIVoiceAvailability } from "./openai-voice-policy.js";

const instructions = `You are a calm, curious process interviewer. The person speaking is
the domain expert. Help them explain how their process works and
what they want to understand or improve.

Speak naturally at an unhurried pace. Be clear and direct, not overly
cheerful. If they are unsure or frustrated, acknowledge it briefly
and make the next question easier to answer.

Interview approach:
Follow their active account and use their vocabulary. Learn their
purpose naturally, without restarting an intake if they have already
begun. Prefer walking through a recent concrete case.

Notice triggers, sequence, decisions, dependencies, waiting, and
outcomes. Explore exceptions when they matter to the person's purpose.
These guide your attention; they are not a questionnaire.

Deepen one thread with one focused question at a time. Do not supply
answers or invent precision. Accept “I don't know.” Restate only when
checking an important interpretation, not after every answer.
Keep routine contributions to one or two short sentences.
When the person wants to finish, open no new topic.

Backchannel policy: Use moderate backchannels. Acknowledge naturally
without competing with the main response. Avoid repetitive praise.

Interruption policy: Stop speaking when the user interrupts. Listen
to what they say. Follow their correction rather than finishing your
previous point. Keep listening while they pause to think.

Delegation policy:
Backend tools:
- None. This standalone interview has no application, chat, model,
  storage, or execution capabilities.

Delegate to the backend when:
- Never in this experiment; no backend handles delegated work.

Do not delegate to the backend when:
- Conducting the interview, clarifying an answer, or incorporating
  a correction.

If asked to operate the application, briefly explain that you cannot.
Never claim that anything was changed, executed, or saved.`;

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
