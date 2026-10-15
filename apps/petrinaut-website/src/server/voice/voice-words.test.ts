import { expect, test, vi } from "vitest";

import { encodeVoiceWords } from "../../shared/voice-words";
import { createOpenAILiveSessionHandler } from "./openai-live-session";
import { createOpenAIRealtimeCallHandler } from "./openai-realtime-call";
import { createOpenAITranscriptionSessionHandler } from "./openai-transcription-session";

const environment = {
  PETRINAUT_OPENAI_VOICE_ENABLED: "true",
  OPENAI_VOICE_API_KEY: "fake-test-secret",
};
const request = (header: string) =>
  new Request("https://petrinaut.test/api/voice/session", {
    method: "POST",
    headers: {
      origin: "https://petrinaut.test",
      "content-type": "application/sdp",
      "x-petrinaut-voice-words": header,
    },
    body: "v=0\r\no=offer",
  });

test.each([
  createOpenAILiveSessionHandler,
  createOpenAIRealtimeCallHandler,
  createOpenAITranscriptionSessionHandler,
])("rejects bad vocabulary before any upstream call", async (handler) => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  expect(
    (await handler({ environment, fetch })(request("not!base64"))).status,
  ).toBe(400);
  expect(fetch).not.toHaveBeenCalled();
});

test.each(["live", "realtime", "transcription"] as const)(
  "routes only appropriate vocabulary to %s",
  async (kind) => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async (): Promise<Response> =>
        kind === "live"
          ? Response.json({
              session: { id: "session" },
              transport: { type: "webrtc", sdp: "v=0\r\no=answer" },
            })
          : kind === "transcription" && fetch.mock.calls.length === 1
            ? Response.json({
                value: "scoped-test-secret",
                session: { type: "transcription" },
              })
            : new Response("v=0\r\no=answer", {
                headers: { "content-type": "application/sdp" },
              }),
    );
    const handler =
      kind === "live"
        ? createOpenAILiveSessionHandler
        : kind === "realtime"
          ? createOpenAIRealtimeCallHandler
          : createOpenAITranscriptionSessionHandler;
    const header = encodeVoiceWords([
      { spelling: "RelayDesk", pronunciation: "ray-lay-desk" },
      { spelling: "Bay Three" },
    ]);
    expect(
      (await handler({ environment, fetch })(request(header!))).status,
    ).toBe(kind === "realtime" ? 200 : 201);
    const body = fetch.mock.calls[0]?.[1]?.body;
    const serialized = body instanceof FormData ? body.get("session") : body;
    if (typeof serialized !== "string")
      throw new Error("Expected serialized session");
    const payload = JSON.parse(serialized) as {
      session?: {
        instructions?: string;
        audio?: { input?: { transcription?: { prompt?: string } } };
      };
      instructions?: string;
      audio?: { input?: { transcription?: { prompt?: string } } };
    };
    const session = payload.session ?? payload;
    if (kind !== "live") {
      expect(session.audio?.input?.transcription?.prompt).toContain(
        "Also expect these names: RelayDesk, Bay Three.",
      );
      expect(session.audio?.input?.transcription?.prompt).not.toContain(
        "ray-lay-desk",
      );
    }
    if (kind !== "transcription") {
      expect(session.instructions).toContain("ray-lay-desk");
      expect(session.instructions).not.toContain("Bay Three");
    }
    expect(
      new Headers(fetch.mock.calls[0]?.[1]?.headers).has(
        "x-petrinaut-voice-words",
      ),
    ).toBe(false);
  },
);
