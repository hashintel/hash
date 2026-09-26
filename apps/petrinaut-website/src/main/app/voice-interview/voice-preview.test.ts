import { describe, expect, test, vi } from "vitest";

import { createOpenAIRealtimeCallHandler } from "../../../server/voice/openai-realtime-call";
import {
  VOICE_REQUEST_ID_HEADER,
  type VoiceDiagnosticEvent,
} from "../../../voice-diagnostics";
import {
  BrunchPanelConversationTracker,
  createBrunchPanelTransport,
} from "../local-storage-demo/brunch-panel-transport";
import { selectCanonicalSpeech } from "./canonical-speech";
import { OpenAIRealtimeSession } from "./openai-realtime-session";
import { RealtimeBrunchBridge } from "./realtime-brunch-bridge";
import { submitVoiceInputWithAdmission } from "./voice-interview-control";
import { VoiceTurnController } from "./voice-turn-controller";

import type { CanonicalSpeechSegment } from "./canonical-speech";
import type { AgentSendResult, FlueClient } from "@flue/sdk";
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
        state: "done",
        text: "What happens after approval?",
        type: "text",
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
        state: "done",
        text: canonicalQuestion,
        type: "text",
      },
    ],
    role: "assistant",
  },
] satisfies PetrinautAiMessage[];

describe("controlled voice preview", () => {
  test("bridges one completed transcript through Brunch and back to canonical half-duplex audio", async () => {
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
      muted: false,
      pause: vi.fn(),
      play: vi.fn(async () => undefined),
      srcObject: null as MediaStream | null,
      volume: 1,
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
    const admission: AgentSendResult = {
      offset: "offset-voice-1",
      streamUrl: "https://petrinaut.test/agents/chat/instance-1",
      submissionId: "submission-voice-1",
      uid: "uid-voice-1",
    };
    const send = vi.fn<FlueClient["send"]>(async () => admission);
    const wait = vi.fn<FlueClient["wait"]>(async () => undefined);
    const tracker = new BrunchPanelConversationTracker();
    const transport = createBrunchPanelTransport(
      Promise.resolve({ send, wait } as Pick<
        FlueClient,
        "send" | "wait"
      > as FlueClient),
      tracker,
    );
    type SubmitInterviewAnswer = ConstructorParameters<
      typeof RealtimeBrunchBridge
    >[0]["submitInterviewAnswer"];
    const submitInterviewAnswer = vi.fn<SubmitInterviewAnswer>((input) =>
      submitVoiceInputWithAdmission({
        input,
        resolveInputSubmission: (messageId) =>
          tracker.submissionForInput(messageId),
        submitVoiceInput: async ({ id, text }) => {
          if (id === undefined) {
            throw new Error("Voice message identity is required.");
          }
          const stream = await transport.sendMessages({
            abortSignal: input.signal,
            chatId: "conversation-1",
            messageId: undefined,
            messages: [
              {
                id,
                metadata: { source: "voice" },
                parts: [{ text, type: "text" }],
                role: "user",
              },
            ],
            trigger: "submit-message",
          });
          void stream.pipeTo(new WritableStream());
          return { kind: "message", messageId: id };
        },
        subscribeToAdmission: (target, listener) =>
          tracker.subscribeToAdmission(target, ({ admission: admitted }) =>
            listener(admitted.submissionId),
          ),
        subscribeToAdmissionFailure: (target, listener) =>
          tracker.subscribeToAdmissionFailure(target, listener),
      }),
    );
    const bridge = new RealtimeBrunchBridge({
      session,
      submitInterviewAnswer,
    });
    const controller = new VoiceTurnController({
      bridge,
      session,
      submitText: vi.fn(async () => ({ kind: "message" as const })),
    });
    await controller.start();
    dataChannel.receive({
      audio_start_ms: 200,
      item_id: "pre-output-item",
      type: "input_audio_buffer.speech_started",
    });
    dataChannel.receive({
      content_index: 0,
      delta: "Speech started before output",
      item_id: "pre-output-item",
      type: "conversation.item.input_audio_transcription.delta",
    });
    expect(controller.getSnapshot().partialText).toBe(
      "Speech started before output",
    );
    const initialSelection = selectCanonicalSpeech(initialMessages);
    const initialSegments = initialSelection.segments;
    controller.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: initialSegments,
      questionSegment: initialSelection.questionSegment,
      status: "ready",
    });
    dataChannel.receive({
      content_index: 0,
      item_id: "pre-output-item",
      type: "conversation.item.input_audio_transcription.failed",
    });
    expect(controller.getSnapshot()).toMatchObject({
      lastCommittedText: "",
      microphoneEnabled: true,
      partialText: "",
    });
    expect(track.enabled).toBe(false);
    expect(submitInterviewAnswer).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();

    dataChannel.receive({
      content_index: 0,
      item_id: "pre-output-item",
      transcript: "The stale item cannot recover authority.",
      type: "conversation.item.input_audio_transcription.completed",
    });
    expect(send).not.toHaveBeenCalled();

    authorizeLatestSpeechResponse(dataChannel, "response-initial-question");
    dataChannel.receive({
      response_id: "response-initial-question",
      type: "output_audio_buffer.started",
    });
    expect(controller.getSnapshot()).toMatchObject({
      canTakeTurn: true,
      output: "speaking",
    });

    const handoff = controller.takeTurn();
    dataChannel.receive({
      audio_start_ms: 300,
      item_id: "playback-overlap",
      type: "input_audio_buffer.speech_started",
    });
    dataChannel.receive({
      content_index: 0,
      item_id: "playback-overlap",
      transcript: "Playback must not become input.",
      type: "conversation.item.input_audio_transcription.completed",
    });
    dataChannel.receive({ type: "input_audio_buffer.cleared" });
    dataChannel.receive({
      response: {
        id: "response-initial-question",
        output: [],
        status: "cancelled",
      },
      type: "response.done",
    });
    dataChannel.receive({
      response_id: "response-initial-question",
      type: "output_audio_buffer.cleared",
    });
    await handoff;
    expect(controller.getSnapshot()).toMatchObject({
      input: "listening",
      microphoneEnabled: true,
      output: "interrupted",
    });

    dataChannel.receive({
      audio_start_ms: 500,
      item_id: "user-item",
      type: "input_audio_buffer.speech_started",
    });
    dataChannel.receive({
      content_index: 0,
      delta: "The supervisor",
      item_id: "user-item",
      type: "conversation.item.input_audio_transcription.delta",
    });
    dataChannel.receive({
      content_index: 0,
      item_id: "user-item",
      transcript: spokenAnswer,
      type: "conversation.item.input_audio_transcription.completed",
    });

    await vi.waitFor(() =>
      expect(submitInterviewAnswer).toHaveBeenCalledWith(
        expect.objectContaining({
          admissionTarget: {
            kind: "user",
            messageId: "voice-realtime:1:user-item:0",
          },
          id: "voice-realtime:1:user-item:0",
          text: spokenAnswer,
        }),
      ),
    );
    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "ai-sdk:user:voice-realtime:1:user-item:0",
        message: { body: spokenAnswer, kind: "user" },
      }),
    );
    await vi.waitFor(() =>
      expect(controller.getSnapshot()).toMatchObject({
        input: "submitting",
        lastAnswerDelivery: "delivered",
        microphoneEnabled: true,
        output: "waiting-for-tool",
      }),
    );

    controller.updateChat({
      canAcceptInterviewAnswer: false,
      canonicalSegments: initialSegments,
      status: "streaming",
    });
    const initialSegmentIds = new Set(initialSegments.map(({ id }) => id));
    const responseSelection = selectCanonicalSpeech(responseMessages);
    const correlateResponse = (segment: CanonicalSpeechSegment) =>
      initialSegmentIds.has(segment.id)
        ? segment
        : { ...segment, submissionIds: [admission.submissionId] };
    const correlatedSegments =
      responseSelection.segments.map(correlateResponse);
    controller.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: correlatedSegments,
      questionSegment: responseSelection.questionSegment
        ? correlateResponse(responseSelection.questionSegment)
        : undefined,
      status: "ready",
    });

    const responseCreate = sentEvents(dataChannel).findLast(
      ({ type }) => type === "response.create",
    );
    expect(responseCreate).toMatchObject({
      type: "response.create",
      response: {
        input: [
          {
            content: [
              {
                text: JSON.stringify({
                  response_text: [canonicalReply, canonicalQuestion],
                }),
                type: "input_text",
              },
            ],
            role: "system",
            type: "message",
          },
        ],
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
    expect(track.enabled).toBe(false);

    dataChannel.receive({
      response_id: "response-canonical-reply",
      type: "output_audio_buffer.stopped",
    });
    dataChannel.receive({
      response: {
        id: "response-canonical-reply",
        output: [
          {
            content: [{ transcript: canonicalReply, type: "output_audio" }],
            role: "assistant",
            type: "message",
          },
        ],
        status: "completed",
      },
      type: "response.done",
    });
    expect(controller.getSnapshot()).toMatchObject({
      canReadFullResponse: true,
      canRepeatQuestion: true,
      output: "idle",
    });

    controller.repeatQuestion();

    const replayCreate = sentEvents(dataChannel).findLast(
      ({ type }) => type === "response.create",
    );
    expect(replayCreate).toMatchObject({
      response: {
        input: [
          {
            content: [
              {
                text: JSON.stringify({ response_text: [canonicalQuestion] }),
                type: "input_text",
              },
            ],
            role: "system",
            type: "message",
          },
        ],
      },
      type: "response.create",
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
            eagerness: "medium",
            create_response: false,
            interrupt_response: false,
          },
        },
      },
      tool_choice: "none",
      tools: [],
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
