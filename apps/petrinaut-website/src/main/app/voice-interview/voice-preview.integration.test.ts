import { describe, expect, test, vi } from "vitest";

import { createOpenAIRealtimeCallHandler } from "../../../server/voice/openai-realtime-call";
import {
  VOICE_REQUEST_ID_HEADER,
  type VoiceDiagnosticEvent,
} from "../../../voice-diagnostics";
import { selectCanonicalSpeechSegments } from "./canonical-speech";
import { OpenAIRealtimeSession } from "./openai-realtime-session";
import { RealtimeBrunchBridge } from "./realtime-brunch-bridge";
import { VoiceTurnController } from "./voice-turn-controller";

import type { PetrinautAiMessage } from "@hashintel/petrinaut/ui";

const origin = "https://petrinaut.test";
const browserOffer = "v=0\r\na=private-browser-sdp\r\n";
const providerAnswer = "v=0\r\na=private-provider-sdp\r\n";
const spokenAnswer = "The supervisor approves it.";
const canonicalReply = "Thanks. I have recorded that.";
const canonicalQuestion = "Who is informed next?";
const requestIds = [
  "00000000-0000-4000-8000-000000000011",
  "00000000-0000-4000-8000-000000000012",
  "00000000-0000-4000-8000-000000000013",
] as const;

class FakeDataChannel extends EventTarget {
  public readyState: RTCDataChannelState = "connecting";
  public readonly send = vi.fn();

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

const sentEvents = (channel: FakeDataChannel): Record<string, unknown>[] =>
  channel.send.mock.calls.map(([payload]) => JSON.parse(payload as string));

const authorizeLatestSpeechResponse = (
  channel: FakeDataChannel,
  responseId: string,
): void => {
  const responseCreate = sentEvents(channel).findLast(
    ({ type }) => type === "response.create",
  )!;
  const response = responseCreate.response as Record<string, unknown>;
  channel.receive({
    response: { id: responseId, metadata: response.metadata },
    type: "response.created",
  });
};

const initialMessages = [
  {
    id: "initial-question-message",
    parts: [
      {
        input: { question: "What happens after approval?" },
        state: "input-available",
        toolCallId: "ask-current",
        toolName: "brunch_ask",
        type: "dynamic-tool",
      },
    ],
    role: "assistant",
  },
] satisfies PetrinautAiMessage[];

const responseMessages = [
  ...initialMessages,
  {
    id: "canonical-response-message",
    parts: [{ state: "done", text: canonicalReply, type: "text" }],
    role: "assistant",
  },
  {
    id: "next-question-message",
    parts: [
      {
        input: { question: canonicalQuestion },
        state: "input-available",
        toolCallId: "ask-next",
        toolName: "brunch_ask",
        type: "dynamic-tool",
      },
    ],
    role: "assistant",
  },
] satisfies PetrinautAiMessage[];

describe("controlled voice preview", () => {
  test("bridges one Realtime tool call through Brunch and back to canonical duplex audio", async () => {
    const diagnostics: VoiceDiagnosticEvent[] = [];
    const reportDiagnostic = (event: VoiceDiagnosticEvent) =>
      diagnostics.push(event);
    const upstreamRealtimeFetch = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(providerAnswer, {
          headers: { "content-type": "text/plain" },
        }),
    );
    const environment = {
      OPENAI_VOICE_API_KEY: "[REDACTED:api-key]",
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
    const browserRequests: Array<{
      readonly path: string;
      readonly requestId: string | null;
      readonly responseRequestId: string | null;
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
      const response = await realtimeHandler(request);
      browserRequests.push({
        path: url.pathname,
        requestId: request.headers.get(VOICE_REQUEST_ID_HEADER),
        responseRequestId: response.headers.get(VOICE_REQUEST_ID_HEADER),
      });
      return response;
    });

    const dataChannel = new FakeDataChannel();
    const track = { enabled: true, kind: "audio", stop: vi.fn() };
    const mediaStream = {
      getAudioTracks: () => [track],
      getTracks: () => [track],
    } as unknown as MediaStream;
    const remoteAudio = {
      autoplay: false,
      pause: vi.fn(),
      play: vi.fn(async () => undefined),
      srcObject: null as MediaStream | null,
    };
    const peer = {
      addTrack: vi.fn(),
      close: vi.fn(),
      connectionState: "new" as RTCPeerConnectionState,
      createDataChannel: vi.fn(() => dataChannel),
      createOffer: vi.fn(async () => ({
        sdp: browserOffer,
        type: "offer" as RTCSdpType,
      })),
      localDescription: null as RTCSessionDescription | null,
      onconnectionstatechange: null as (() => void) | null,
      ontrack: null as ((event: RTCTrackEvent) => void) | null,
      setLocalDescription: vi.fn(
        async (description: RTCSessionDescriptionInit) => {
          peer.localDescription = description as RTCSessionDescription;
        },
      ),
      setRemoteDescription: vi.fn(async () => dataChannel.open()),
    };
    let requestNumber = 0;
    const createRequestId = () => requestIds[requestNumber++]!;
    const session = new OpenAIRealtimeSession({
      cancelAnimationFrame: vi.fn(),
      connectionTimeoutMs: 15_000,
      createAudioContext: () =>
        ({
          close: vi.fn(async () => undefined),
          createAnalyser: vi.fn(() => ({
            fftSize: 0,
            getByteTimeDomainData: vi.fn(),
          })),
          createMediaStreamSource: vi.fn(() => ({ connect: vi.fn() })),
          state: "running",
        }) as unknown as AudioContext,
      createPeerConnection: () => peer as unknown as RTCPeerConnection,
      createRemoteAudio: () => remoteAudio,
      createRequestId,
      fetch: browserFetch,
      getUserMedia: async () => mediaStream,
      now: clock,
      reportDiagnostic,
      requestAnimationFrame: vi.fn(() => 1),
    });
    const submitInterviewAnswer = vi.fn(async () => ({
      kind: "interactive-tool" as const,
      toolCallId: "ask-current",
    }));
    const bridge = new RealtimeBrunchBridge({
      session,
      submitInterviewAnswer,
    });
    const controller = new VoiceTurnController({
      bridge,
      session,
      submitText: submitInterviewAnswer,
    });
    controller.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: selectCanonicalSpeechSegments(initialMessages),
      status: "ready",
    });

    await controller.start();
    authorizeLatestSpeechResponse(dataChannel, "response-initial-question");
    dataChannel.receive({
      response_id: "response-initial-question",
      type: "output_audio_buffer.started",
    });
    dataChannel.receive({
      audio_start_ms: 300,
      item_id: "user-item",
      type: "input_audio_buffer.speech_started",
    });
    dataChannel.receive({
      response: {
        id: "response-initial-question",
        status: "cancelled",
      },
      type: "response.done",
    });
    expect(controller.getSnapshot()).toMatchObject({
      input: "listening",
      microphoneEnabled: true,
      output: "interrupted",
    });

    dataChannel.receive({
      call_id: "call-1",
      delta: `{"answer":"${spokenAnswer}"}`,
      item_id: "function-item-1",
      output_index: 0,
      response_id: "response-tool-1",
      type: "response.function_call_arguments.delta",
    });
    dataChannel.receive({
      response: {
        id: "response-tool-1",
        output: [
          {
            arguments: `{"answer":"${spokenAnswer}"}`,
            call_id: "call-1",
            id: "function-item-1",
            name: "continue_interview",
            status: "completed",
            type: "function_call",
          },
        ],
        status: "completed",
      },
      type: "response.done",
    });

    await vi.waitFor(() =>
      expect(submitInterviewAnswer).toHaveBeenCalledWith({
        id: "voice-realtime:1:call-1",
        text: spokenAnswer,
      }),
    );
    expect(controller.getSnapshot()).toMatchObject({
      input: "submitting",
      lastAnswerDelivery: "delivered",
      microphoneEnabled: true,
      output: "waiting-for-tool",
    });

    controller.updateChat({
      canAcceptInterviewAnswer: false,
      canonicalSegments: selectCanonicalSpeechSegments(initialMessages),
      status: "streaming",
    });
    controller.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: selectCanonicalSpeechSegments(responseMessages),
      status: "ready",
    });

    const [functionOutput, responseCreate] = sentEvents(dataChannel).slice(-2);
    expect(functionOutput).toEqual({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: "call-1",
        output: JSON.stringify({
          response_text: [canonicalReply, canonicalQuestion],
        }),
      },
    });
    expect(responseCreate).toMatchObject({
      type: "response.create",
      response: {
        output_modalities: ["audio"],
        tool_choice: "none",
        tools: [],
      },
    });

    authorizeLatestSpeechResponse(dataChannel, "response-canonical-reply");
    dataChannel.receive({
      response_id: "response-canonical-reply",
      type: "output_audio_buffer.started",
    });
    expect(controller.getSnapshot()).toMatchObject({
      currentQuestion: canonicalQuestion,
      input: "listening",
      microphoneEnabled: true,
      output: "speaking",
    });

    const remoteTrack = { kind: "audio", stop: vi.fn() };
    const remoteStream = {
      getTracks: () => [remoteTrack],
    } as unknown as MediaStream;
    peer.ontrack?.({
      streams: [remoteStream],
      track: remoteTrack,
    } as unknown as RTCTrackEvent);
    expect(remoteAudio).toMatchObject({
      autoplay: true,
      srcObject: remoteStream,
    });
    expect(remoteAudio.play).toHaveBeenCalledOnce();

    expect(browserRequests).toEqual([
      {
        path: "/api/voice/realtime-call",
        requestId: requestIds[0],
        responseRequestId: requestIds[0],
      },
    ]);
    const realtimeForm = upstreamRealtimeFetch.mock.calls[0]?.[1]
      ?.body as FormData;
    expect(realtimeForm.get("sdp")).toBe(browserOffer);
    expect(JSON.parse(realtimeForm.get("session") as string)).toMatchObject({
      model: "gpt-realtime-2",
      audio: {
        input: {
          turn_detection: {
            type: "semantic_vad",
            eagerness: "low",
            create_response: true,
            interrupt_response: true,
          },
        },
      },
    });
    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ operation: "connection", stage: "browser" }),
        expect.objectContaining({ operation: "connection", stage: "server" }),
      ]),
    );
    const serializedDiagnostics = JSON.stringify(diagnostics);
    for (const privateValue of [
      browserOffer,
      providerAnswer,
      spokenAnswer,
      canonicalReply,
      canonicalQuestion,
      environment.OPENAI_VOICE_API_KEY,
    ]) {
      expect(serializedDiagnostics).not.toContain(privateValue);
    }

    await controller.end();
    expect(track.stop).toHaveBeenCalledOnce();
    expect(remoteTrack.stop).toHaveBeenCalledOnce();
    expect(remoteAudio.pause).toHaveBeenCalledOnce();
    expect(peer.close).toHaveBeenCalledOnce();
  });
});
