import { describe, expect, test, vi } from "vitest";

import {
  applySpeechEngineInterviewConfig,
  createElevenLabsSpeechEngineCallbacks,
  speechEngineOverrides,
  speechEngineTurnConfig,
} from "../src/elevenlabs-speech-engine.ts";

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

  test("does not invoke Brunch or speak for an empty transcript", async () => {
    const bridge = { release: vi.fn(), respond: vi.fn() };
    const callbacks = createElevenLabsSpeechEngineCallbacks({ bridge });
    const { session } = createSession();

    callbacks.onTranscript?.(
      [{ role: "user", content: "\u0000   \n" }],
      new AbortController().signal,
      session as never,
    );

    expect(bridge.respond).not.toHaveBeenCalled();
    expect(session.sendResponse).not.toHaveBeenCalled();
  });

  test("does not process the same completed provider turn twice", async () => {
    const respond = vi.fn(async function* () {
      yield "Brunch response";
    });
    const bridge = { release: vi.fn(), respond };
    const callbacks = createElevenLabsSpeechEngineCallbacks({ bridge });
    const { response, session } = createSession();
    const transcript = [
      { role: "user", content: "A finalized answer." },
    ] as const;
    const signal = new AbortController().signal;

    callbacks.onTranscript?.([...transcript], signal, session as never);
    await response();
    callbacks.onTranscript?.([...transcript], signal, session as never);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(respond).toHaveBeenCalledTimes(1);
    expect(session.sendResponse).toHaveBeenCalledTimes(1);
  });

  test("processes distinct provider turns with identical answers", async () => {
    const respond = vi.fn(async function* () {
      yield "Brunch response";
    });
    const bridge = { release: vi.fn(), respond };
    const callbacks = createElevenLabsSpeechEngineCallbacks({ bridge });
    const { session } = createSession();
    const transcript = [{ role: "user", content: "Yes." }] as const;

    callbacks.onTranscript?.(
      [...transcript],
      new AbortController().signal,
      session as never,
    );
    await vi.waitFor(() => expect(respond).toHaveBeenCalledTimes(1));
    callbacks.onTranscript?.(
      [...transcript],
      new AbortController().signal,
      session as never,
    );
    await vi.waitFor(() => expect(respond).toHaveBeenCalledTimes(2));

    expect(session.sendResponse).toHaveBeenCalledTimes(2);
  });

  test("queues the latest turn until the interrupted response settles", async () => {
    let releaseFirst: () => void = () => undefined;
    const firstTurnGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let activeResponses = 0;
    let maximumActiveResponses = 0;
    const respond = vi.fn(async function* ({
      signal,
      transcript,
    }: {
      signal: AbortSignal;
      transcript: string;
    }) {
      activeResponses += 1;
      maximumActiveResponses = Math.max(
        maximumActiveResponses,
        activeResponses,
      );
      if (transcript === "First answer.") {
        await firstTurnGate;
      }
      activeResponses -= 1;
      if (signal.aborted) {
        throw new DOMException("Interrupted", "AbortError");
      }
      yield `Reply to ${transcript}`;
    });
    const bridge = { release: vi.fn(), respond };
    const callbacks = createElevenLabsSpeechEngineCallbacks({ bridge });
    const { session } = createSession();
    const firstController = new AbortController();

    callbacks.onTranscript?.(
      [{ role: "user", content: "First answer." }],
      firstController.signal,
      session as never,
    );
    firstController.abort();
    callbacks.onTranscript?.(
      [{ role: "user", content: "Corrected answer." }],
      new AbortController().signal,
      session as never,
    );
    expect(respond).toHaveBeenCalledTimes(1);

    releaseFirst();
    await vi.waitFor(() => expect(respond).toHaveBeenCalledTimes(2));
    await vi.waitFor(() =>
      expect(session.sendResponse).toHaveBeenCalledTimes(2),
    );

    expect(maximumActiveResponses).toBe(1);
    expect(respond.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({ transcript: "Corrected answer." }),
    );
  });

  test("configures an opening question and patient turn-taking", async () => {
    const update = vi.fn(async () => ({ engineId: "seng_test" }));

    await applySpeechEngineInterviewConfig({
      speechEngine: { update },
      speechEngineId: "seng_test",
    });

    expect(update).toHaveBeenCalledWith("seng_test", {
      overrides: speechEngineOverrides,
      turn: speechEngineTurnConfig,
    });
    expect(speechEngineOverrides).toEqual({ firstMessage: true });
    expect(speechEngineTurnConfig).toEqual({
      turnEagerness: "patient",
      turnModel: "turn_v3",
      turnTimeout: 10,
    });
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
