import { FlueApiError } from "@flue/sdk";
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
import { selectCanonicalSpeechSegments } from "./canonical-speech";
import { OpenAIRealtimeSession } from "./openai-realtime-session";
import { RealtimeBrunchBridge } from "./realtime-brunch-bridge";
import { submitVoiceInputWithAdmission } from "./voice-interview-control";
import { VoiceTurnController } from "./voice-turn-controller";

import type { OpenAIRealtimeSessionEvent } from "./openai-realtime-session";
import type { RealtimeBrunchBridgeEvent } from "./realtime-brunch-bridge";
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
    const submissionId = "submission-voice-1";
    type SubmitInterviewAnswer = ConstructorParameters<
      typeof RealtimeBrunchBridge
    >[0]["submitInterviewAnswer"];
    const submitInterviewAnswer = vi.fn<SubmitInterviewAnswer>(
      async ({ id, onAdmission }) => {
        onAdmission(submissionId);
        return { kind: "message", messageId: id, submissionId };
      },
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
    const initialSegments = selectCanonicalSpeechSegments(initialMessages);
    controller.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: initialSegments,
      status: "ready",
    });
    authorizeLatestSpeechResponse(dataChannel, "response-initial-question");
    dataChannel.receive({
      response_id: "response-initial-question",
      type: "output_audio_buffer.started",
    });
    dataChannel.receive({
      content_index: 0,
      item_id: "pre-output-item",
      transcript: "This completed during assistant playback.",
      type: "conversation.item.input_audio_transcription.completed",
    });
    expect(controller.getSnapshot()).toMatchObject({
      canTakeTurn: true,
      lastCommittedText: "",
      microphoneEnabled: true,
      output: "speaking",
      partialText: "",
    });
    expect(track.enabled).toBe(false);
    expect(submitInterviewAnswer).not.toHaveBeenCalled();

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
    expect(controller.getSnapshot()).toMatchObject({
      input: "submitting",
      lastAnswerDelivery: "delivered",
      microphoneEnabled: true,
      output: "waiting-for-tool",
    });

    controller.updateChat({
      canAcceptInterviewAnswer: false,
      canonicalSegments: initialSegments,
      status: "streaming",
    });
    const initialSegmentIds = new Set(initialSegments.map(({ id }) => id));
    const correlatedSegments = selectCanonicalSpeechSegments(
      responseMessages,
    ).map((segment) =>
      initialSegmentIds.has(segment.id)
        ? segment
        : { ...segment, submissionId },
    );
    controller.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: correlatedSegments,
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

  test("admits a Voice turn only through the Flue route", async () => {
    const admission: AgentSendResult = {
      streamUrl: "https://petrinaut.test/agents/chat/instance-1",
      offset: "offset-1",
      submissionId: "submission-voice-1",
      uid: "uid-1",
    };
    const send = vi.fn<FlueClient["send"]>(async () => admission);
    let settleSubmission: (() => void) | undefined;
    const wait = vi.fn<FlueClient["wait"]>(
      async (_admission, options) =>
        new Promise<void>((resolve) => {
          settleSubmission = () => {
            void Promise.resolve(
              options?.onEvent?.({
                type: "submission-settled",
                conversationId: "conversation-1",
                submissionId: admission.submissionId,
                outcome: "completed",
                position: { batch: 1, index: 0 },
              }),
            ).then(() => resolve());
          };
        }),
    );
    const client = {
      send,
      wait,
    } as Pick<FlueClient, "send" | "wait"> as FlueClient;
    const tracker = new BrunchPanelConversationTracker();
    const transport = createBrunchPanelTransport(
      Promise.resolve(client),
      tracker,
    );
    let realtimeListener:
      | ((event: OpenAIRealtimeSessionEvent) => void)
      | undefined;
    const bridge = new RealtimeBrunchBridge({
      session: {
        speakCanonical: vi.fn(),
        subscribe: (listener) => {
          realtimeListener = listener;
          return () => {
            realtimeListener = undefined;
          };
        },
      },
      submitInterviewAnswer: async ({
        admissionTarget,
        id,
        onAdmission,
        signal,
        text,
      }) => {
        const unsubscribe = tracker.subscribeToAdmission(
          admissionTarget,
          ({ admission: admitted }) => onAdmission(admitted.submissionId),
        );
        const stream = await transport.sendMessages({
          trigger: "submit-message",
          chatId: "conversation-1",
          messageId: undefined,
          messages: [
            {
              id,
              role: "user",
              metadata: { source: "voice" },
              parts: [{ type: "text", text }],
            },
          ],
          abortSignal: signal,
        });
        try {
          await stream.pipeTo(new WritableStream());
          const submissionId = tracker.submissionForInput(id);
          if (submissionId === undefined) {
            throw new Error("missing Flue admission");
          }
          return { kind: "message", messageId: id, submissionId };
        } finally {
          unsubscribe();
        }
      },
    });
    const bridgeEvents: RealtimeBrunchBridgeEvent[] = [];
    bridge.subscribe((event) => bridgeEvents.push(event));
    bridge.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [],
      status: "ready",
    });
    bridge.start(1);

    const finalized: OpenAIRealtimeSessionEvent = {
      key: {
        connectionEpoch: 1,
        contentIndex: 0,
        itemId: "input-item-1",
      },
      text: spokenAnswer,
      type: "completed",
    };
    realtimeListener?.(finalized);
    realtimeListener?.(finalized);

    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
    await vi.waitFor(() =>
      expect(bridgeEvents).toContainEqual({
        deliveryId: "voice-realtime:1:input-item-1:0",
        submissionId: admission.submissionId,
        type: "submission-admitted",
      }),
    );
    expect(bridgeEvents).not.toContainEqual(
      expect.objectContaining({ type: "submission-accepted" }),
    );
    expect(send).toHaveBeenCalledOnce();
    const sendInput = send.mock.calls[0]?.[0];
    expect(sendInput).toMatchObject({
      idempotencyKey: "ai-sdk:voice-realtime:1:input-item-1:0",
      message: { kind: "user", body: spokenAnswer },
    });
    expect(sendInput?.signal).toBeInstanceOf(AbortSignal);
    expect(admission.streamUrl).toContain("/agents/chat/");

    settleSubmission?.();
    await vi.waitFor(() =>
      expect(bridgeEvents).toContainEqual(
        expect.objectContaining({ type: "submission-accepted" }),
      ),
    );
  });

  test("surfaces an ambiguous Flue admission through the panel observer without retrying", async () => {
    const send = vi.fn<FlueClient["send"]>(async () => {
      throw new FlueApiError(500, "");
    });
    const tracker = new BrunchPanelConversationTracker();
    const transport = createBrunchPanelTransport(
      Promise.resolve({ send } as Pick<FlueClient, "send"> as FlueClient),
      tracker,
    );
    let realtimeListener:
      | ((event: OpenAIRealtimeSessionEvent) => void)
      | undefined;
    const bridge = new RealtimeBrunchBridge({
      session: {
        speakCanonical: vi.fn(),
        subscribe: (listener) => {
          realtimeListener = listener;
          return () => {
            realtimeListener = undefined;
          };
        },
      },
      submitInterviewAnswer: (input) =>
        submitVoiceInputWithAdmission({
          input,
          resolveInputSubmission: (messageId) =>
            tracker.submissionForInput(messageId),
          submitVoiceInput: async ({ id, text }) => {
            if (id === undefined) {
              throw new Error("Voice message identity is required.");
            }
            void transport
              .sendMessages({
                trigger: "submit-message",
                chatId: "conversation-1",
                messageId: undefined,
                messages: [
                  {
                    id,
                    role: "user",
                    metadata: { source: "voice" },
                    parts: [{ type: "text", text }],
                  },
                ],
                abortSignal: input.signal,
              })
              .catch(() => undefined);
            return { kind: "message", messageId: id };
          },
          subscribeToAdmission: (target, listener) =>
            tracker.subscribeToAdmission(target, ({ admission }) =>
              listener(admission.submissionId),
            ),
          subscribeToAdmissionFailure: (target, listener) =>
            tracker.subscribeToAdmissionFailure(target, listener),
        }),
    });
    const events: RealtimeBrunchBridgeEvent[] = [];
    bridge.subscribe((event) => events.push(event));
    bridge.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [],
      status: "ready",
    });
    bridge.start(1);

    realtimeListener?.({
      key: {
        connectionEpoch: 1,
        contentIndex: 0,
        itemId: "input-item-ambiguous",
      },
      text: spokenAnswer,
      type: "completed",
    });

    await vi.waitFor(() =>
      expect(events).toContainEqual({
        code: "admission-ambiguous",
        failure: { kind: "ambiguous" },
        message:
          "Brunch may have accepted the message, but admission could not be confirmed. Reopen the conversation before trying again.",
        type: "error",
      }),
    );
    expect(send).toHaveBeenCalledOnce();
  });
});
