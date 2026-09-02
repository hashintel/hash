import { describe, expect, test, vi } from "vitest";

import { createOpenAIRealtimeCallHandler } from "../../../server/voice/openai-realtime-call";
import { createOpenAISpeechHandler } from "../../../server/voice/openai-speech";
import {
  VOICE_REQUEST_ID_HEADER,
  type VoiceDiagnosticEvent,
} from "../../../voice-diagnostics";
import { selectCanonicalSpeechSegments } from "./canonical-speech";
import { OpenAIRealtimeSession } from "./openai-realtime-session";
import { SpeechPlaybackController } from "./speech-playback-controller";
import { VoiceTurnController } from "./voice-turn-controller";

import type { PetrinautAiMessage } from "@hashintel/petrinaut/ui";

const origin = "https://petrinaut.test";
const browserOffer = "v=0\r\na=private-browser-sdp\r\n";
const providerAnswer = "v=0\r\na=private-provider-sdp\r\n";
const finalizedTranscript = "Private finalized transcript.";
const canonicalSpeech = "Private canonical assistant response.";
const requestIds = [
  "00000000-0000-4000-8000-000000000011",
  "00000000-0000-4000-8000-000000000012",
  "00000000-0000-4000-8000-000000000013",
] as const;

class FakeDataChannel extends EventTarget {
  public readyState: RTCDataChannelState = "connecting";

  public close(): void {
    this.readyState = "closed";
  }

  public open(): void {
    this.readyState = "open";
    this.dispatchEvent(new Event("open"));
  }

  public receive(payload: unknown): void {
    const event = new Event("message");
    Object.defineProperty(event, "data", { value: JSON.stringify(payload) });
    this.dispatchEvent(event);
  }
}

const createAudioHarness = () => {
  const listeners = new Map<string, Set<() => void>>();
  const audio = {
    addEventListener: vi.fn((type: string, listener: () => void) => {
      const eventListeners = listeners.get(type) ?? new Set();
      eventListeners.add(listener);
      listeners.set(type, eventListeners);
    }),
    pause: vi.fn(),
    play: vi.fn(async () => undefined),
    removeEventListener: vi.fn((type: string, listener: () => void) => {
      listeners.get(type)?.delete(listener);
    }),
  };

  return {
    audio,
    end: () => {
      for (const listener of listeners.get("ended") ?? []) {
        listener();
      }
    },
  };
};

describe("controlled voice preview", () => {
  test("crosses the mocked browser, voice, Brunch, and canonical-speech boundaries", async () => {
    const diagnostics: VoiceDiagnosticEvent[] = [];
    const reportDiagnostic = (event: VoiceDiagnosticEvent) =>
      diagnostics.push(event);
    const upstreamRealtimeFetch = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(providerAnswer, {
          headers: { "content-type": "text/plain" },
        }),
    );
    const upstreamSpeechFetch = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(new Uint8Array([1, 2, 3]), {
          headers: { "content-type": "audio/mpeg" },
        }),
    );
    const environment = {
      OPENAI_VOICE_API_KEY: "private-provider-credential",
      PETRINAUT_OPENAI_VOICE_ENABLED: "true",
      VERCEL_ENV: "preview",
    };
    let now = 0;
    const clock = () => ++now;
    const realtimeHandler = createOpenAIRealtimeCallHandler({
      environment,
      fetch: upstreamRealtimeFetch,
      now: clock,
      reportDiagnostic,
    });
    const speechHandler = createOpenAISpeechHandler({
      environment,
      fetch: upstreamSpeechFetch,
      now: clock,
      reportDiagnostic,
    });
    const browserRequests: Array<{
      readonly path: string;
      readonly requestId: string | null;
      readonly responseRequestId: string | null;
      readonly serverTiming: string | null;
    }> = [];
    const browserFetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const url = new URL(
        input instanceof Request
          ? input.url
          : input instanceof URL
            ? input.href
            : input,
        origin,
      );
      const headers = new Headers(init?.headers);
      headers.set("origin", origin);
      const request = new Request(url, { ...init, headers });
      const response =
        url.pathname === "/api/voice/realtime-call"
          ? await realtimeHandler(request)
          : await speechHandler(request);
      browserRequests.push({
        path: url.pathname,
        requestId: request.headers.get(VOICE_REQUEST_ID_HEADER),
        responseRequestId: response.headers.get(VOICE_REQUEST_ID_HEADER),
        serverTiming: response.headers.get("server-timing"),
      });
      return response;
    });

    const dataChannel = new FakeDataChannel();
    const track = { enabled: true, stop: vi.fn() };
    const mediaStream = {
      getAudioTracks: () => [track],
      getTracks: () => [track],
    } as unknown as MediaStream;
    const peer = {
      addTrack: vi.fn(),
      close: vi.fn(),
      connectionState: "new" as RTCPeerConnectionState,
      createDataChannel: vi.fn(() => dataChannel),
      createOffer: vi.fn(async () => ({
        sdp: browserOffer,
        type: "offer",
      })),
      localDescription: null as RTCSessionDescription | null,
      onconnectionstatechange: null as (() => void) | null,
      setLocalDescription: vi.fn(
        async (description: RTCSessionDescriptionInit) => {
          peer.localDescription = description as RTCSessionDescription;
        },
      ),
      setRemoteDescription: vi.fn(async () => dataChannel.open()),
    };
    let requestNumber = 0;
    const createRequestId = () => requestIds[requestNumber++]!;
    const audioContext = {
      close: vi.fn(async () => undefined),
      createAnalyser: vi.fn(() => ({
        fftSize: 0,
        getByteTimeDomainData: vi.fn(),
      })),
      createMediaStreamSource: vi.fn(() => ({ connect: vi.fn() })),
    };
    const session = new OpenAIRealtimeSession({
      cancelAnimationFrame: vi.fn(),
      connectionTimeoutMs: 15_000,
      createAudioContext: () => audioContext as unknown as AudioContext,
      createPeerConnection: () => peer as unknown as RTCPeerConnection,
      createRequestId,
      fetch: browserFetch,
      getUserMedia: async () => mediaStream,
      now: clock,
      reportDiagnostic,
      requestAnimationFrame: vi.fn(() => 1),
    });
    const audio = createAudioHarness();
    const revokeObjectURL = vi.fn();
    const playback = new SpeechPlaybackController({
      createAudio: () => audio.audio,
      createObjectURL: () => "blob:voice-integration",
      createRequestId,
      fetch: browserFetch,
      now: clock,
      reportDiagnostic,
      revokeObjectURL,
    });
    const submitText = vi.fn(async () => ({
      kind: "message" as const,
      messageId: "voice-message",
    }));
    const controller = new VoiceTurnController({
      conversationId: "preview-conversation",
      playback,
      session,
      submitText,
    });

    await controller.start();
    dataChannel.receive({
      item_id: "provider-item",
      type: "input_audio_buffer.committed",
    });
    dataChannel.receive({
      content_index: 0,
      item_id: "provider-item",
      transcript: finalizedTranscript,
      type: "conversation.item.input_audio_transcription.completed",
    });
    await vi.waitFor(() => expect(submitText).toHaveBeenCalledOnce());
    expect(submitText).toHaveBeenCalledWith({
      id: "voice:preview-conversation:1:provider-item:0",
      text: finalizedTranscript,
    });

    controller.updateChat({ canonicalSegments: [], status: "submitted" });
    const messages = [
      {
        id: "assistant-message",
        parts: [{ state: "done", text: canonicalSpeech, type: "text" }],
        role: "assistant",
      },
    ] satisfies PetrinautAiMessage[];
    const canonicalSegments = selectCanonicalSpeechSegments(messages);
    controller.updateChat({ canonicalSegments, status: "streaming" });
    controller.updateChat({ canonicalSegments, status: "ready" });

    await vi.waitFor(() => expect(audio.audio.play).toHaveBeenCalledOnce());
    expect(controller.getSnapshot().phase).toBe("playing");
    audio.end();
    await vi.waitFor(() =>
      expect(controller.getSnapshot().phase).toBe("listening"),
    );

    expect(
      browserRequests.map(({ serverTiming: _, ...request }) => request),
    ).toEqual([
      {
        path: "/api/voice/realtime-call",
        requestId: requestIds[0],
        responseRequestId: requestIds[0],
      },
      {
        path: "/api/voice/speech",
        requestId: requestIds[2],
        responseRequestId: requestIds[2],
      },
    ]);
    expect(browserRequests[0]?.serverTiming).toMatch(
      /^petrinaut_voice_connection;dur=\d+(?:\.\d+)?$/u,
    );
    expect(browserRequests[1]?.serverTiming).toMatch(
      /^petrinaut_voice_speech;dur=\d+(?:\.\d+)?$/u,
    );
    expect(upstreamRealtimeFetch).toHaveBeenCalledOnce();
    const realtimeForm = upstreamRealtimeFetch.mock.calls[0]?.[1]
      ?.body as FormData;
    expect(realtimeForm.get("sdp")).toBe(browserOffer);
    expect(upstreamSpeechFetch).toHaveBeenCalledOnce();
    expect(
      JSON.parse(upstreamSpeechFetch.mock.calls[0]?.[1]?.body as string),
    ).toMatchObject({ input: canonicalSpeech });
    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operation: "connection",
          requestId: requestIds[0],
          stage: "browser",
        }),
        expect.objectContaining({
          operation: "connection",
          requestId: requestIds[0],
          stage: "server",
        }),
        expect.objectContaining({
          operation: "transcription",
          requestId: requestIds[1],
          stage: "browser",
        }),
        expect.objectContaining({
          operation: "speech",
          requestId: requestIds[2],
          stage: "browser",
        }),
        expect.objectContaining({
          operation: "speech",
          requestId: requestIds[2],
          stage: "server",
        }),
        expect.objectContaining({
          operation: "speech",
          requestId: requestIds[2],
          stage: "playback",
        }),
      ]),
    );
    const serializedDiagnostics = JSON.stringify(diagnostics);
    for (const privateValue of [
      browserOffer,
      providerAnswer,
      finalizedTranscript,
      canonicalSpeech,
      environment.OPENAI_VOICE_API_KEY,
    ]) {
      expect(serializedDiagnostics).not.toContain(privateValue);
    }

    await controller.end();
    expect(track.stop).toHaveBeenCalledOnce();
    expect(peer.close).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:voice-integration");
  });
});
