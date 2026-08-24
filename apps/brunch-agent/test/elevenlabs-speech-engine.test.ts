import { describe, expect, test, vi } from "vitest";

import { createElevenLabsSpeechEngineCallbacks } from "../src/elevenlabs-speech-engine.ts";

const collect = async (response: string | AsyncIterable<unknown>) => {
  if (typeof response === "string") {
    return response;
  }
  let text = "";
  for await (const chunk of response) {
    text += String(chunk);
  }
  return text;
};

const createSession = () => {
  let responsePromise: Promise<string> | null = null;
  const session = {
    conversationId: "conv_speech_engine",
    sendResponse: vi.fn(async (response: string | AsyncIterable<unknown>) => {
      responsePromise = collect(response);
      await responsePromise;
    }),
  };
  return {
    response: async () => {
      await vi.waitFor(() => expect(responsePromise).not.toBeNull());
      return responsePromise!;
    },
    session,
  };
};

describe("ElevenLabs Speech Engine callbacks", () => {
  test("forwards only the latest normalized user turn and the interruption signal", async () => {
    const respond = vi.fn(async function* () {
      yield "Brunch response";
    });
    const bridge = { release: vi.fn(), respond };
    const callbacks = createElevenLabsSpeechEngineCallbacks({ bridge });
    const { response, session } = createSession();
    const signal = new AbortController().signal;

    callbacks.onTranscript?.(
      [
        { role: "user", content: "Old provider history" },
        { role: "agent", content: "Old provider response" },
        {
          role: "user",
          content: "  The\u0000 support\n lead owns triage.  ",
        },
      ],
      signal,
      session as never,
    );

    expect(await response()).toBe("Brunch response");
    expect(respond).toHaveBeenCalledWith({
      conversationId: "conv_speech_engine",
      signal,
      transcript: "The support lead owns triage.",
    });
    expect(JSON.stringify(respond.mock.calls)).not.toContain(
      "Old provider history",
    );
  });

  test("does not invoke Brunch for an empty transcript", async () => {
    const bridge = { release: vi.fn(), respond: vi.fn() };
    const callbacks = createElevenLabsSpeechEngineCallbacks({ bridge });
    const { response, session } = createSession();

    callbacks.onTranscript?.(
      [{ role: "user", content: "\u0000   \n" }],
      new AbortController().signal,
      session as never,
    );

    expect(await response()).toBe(
      "I didn't catch that. Please hold the button and try again.",
    );
    expect(bridge.respond).not.toHaveBeenCalled();
  });

  test("releases bridge correlation on clean and unexpected disconnects", () => {
    const bridge = { release: vi.fn(), respond: vi.fn() };
    const callbacks = createElevenLabsSpeechEngineCallbacks({ bridge });
    const session = { conversationId: "conv_speech_engine" };

    callbacks.onClose?.(session as never);
    callbacks.onDisconnect?.(session as never);

    expect(bridge.release).toHaveBeenNthCalledWith(1, "conv_speech_engine");
    expect(bridge.release).toHaveBeenNthCalledWith(2, "conv_speech_engine");
  });
});
