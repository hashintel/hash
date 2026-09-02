import { describe, expect, test, vi } from "vitest";

import { createOpenAIRealtimeCallHandler } from "../../../server/voice/openai-realtime-call";
import {
  VOICE_REQUEST_ID_HEADER,
  type VoiceDiagnosticEvent,
} from "../../../voice-diagnostics";
import { selectInterviewSpeech } from "./canonical-speech";
import { OpenAIRealtimeSession } from "./openai-realtime-session";
import { RealtimeBrunchBridge } from "./realtime-brunch-bridge";
import { VoiceTurnController } from "./voice-turn-controller";

import type { PetrinautAiMessage } from "@hashintel/petrinaut/ui";

const origin = "https://petrinaut.test";
const browserOffer = "v=0\r\na=private-browser-sdp\r\n";
const providerAnswer = "v=0\r\na=private-provider-sdp\r\n";
const spokenAnswer = "The supervisor approves it.";
const canonicalReply =
  "Thanks. I have recorded that the supervisor approves each release before the operations team schedules the batch, and that the quality lead must receive the signed checklist, inspect every exception, preserve the audit record, and notify the manager before any delayed item can move into production.";
const preparedReply = "Approval recorded.";
const canonicalQuestion =
  "Who is informed next: the manager, the quality lead, or both? Choose one.";
const toolMetadata = "internal-tool-metadata-must-not-be-spoken";
const toolError = "internal-tool-error-must-not-be-spoken";
const fallbackReply =
  "The complete canonical fallback says that rejected batches remain quarantined until an authorized reviewer documents the resolution.";
const fallbackQuestion =
  "Who documents the resolution: the manager or the quality lead?";
const requestIds = [
  "00000000-0000-4000-8000-000000000011",
  "00000000-0000-4000-8000-000000000012",
  "00000000-0000-4000-8000-000000000013",
  "00000000-0000-4000-8000-000000000014",
  "00000000-0000-4000-8000-000000000015",
  "00000000-0000-4000-8000-000000000016",
  "00000000-0000-4000-8000-000000000017",
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
    parts: [
      { state: "done", text: canonicalReply, type: "text" },
      {
        input: { metadata: toolMetadata },
        output: { result: toolMetadata },
        state: "output-available",
        toolCallId: "metadata-tool",
        toolName: "internal_metadata",
        type: "dynamic-tool",
      },
      {
        errorText: toolError,
        input: { metadata: toolMetadata },
        state: "output-error",
        toolCallId: "error-tool",
        toolName: "internal_error",
        type: "dynamic-tool",
      },
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

const fallbackMessages = [
  ...responseMessages,
  {
    id: "canonical-fallback-message",
    parts: [
      { state: "done", text: fallbackReply, type: "text" },
      {
        input: { question: fallbackQuestion },
        state: "input-available",
        toolCallId: "ask-fallback",
        toolName: "brunch_ask",
        type: "dynamic-tool",
      },
    ],
    role: "assistant",
  },
] satisfies PetrinautAiMessage[];

describe("controlled voice preview", () => {
  test("bridges one completed user transcript through Brunch and back to canonical half-duplex audio", async () => {
    const responseMessagesSnapshot = structuredClone(responseMessages);
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
    const initialSpeech = selectInterviewSpeech(initialMessages);
    controller.updateChat({
      automaticSource: initialSpeech.automaticSource,
      canAcceptInterviewAnswer: true,
      canonicalSegments: [...initialSpeech.canonicalSegments],
      status: "ready",
    });

    await controller.start();
    authorizeLatestSpeechResponse(dataChannel, "response-initial-question");
    dataChannel.receive({
      audio_start_ms: 100,
      item_id: "item-before-handoff",
      type: "input_audio_buffer.speech_started",
    });
    dataChannel.receive({
      response_id: "response-initial-question",
      type: "output_audio_buffer.started",
    });

    expect(controller.getSnapshot()).toMatchObject({
      canTakeTurn: true,
      currentQuestion: "What happens after approval?",
      output: "speaking",
    });
    const handoff = controller.takeTurn();
    const repeatedHandoff = controller.takeTurn();
    expect(repeatedHandoff).toBe(handoff);
    expect(sentEvents(dataChannel).slice(-3)).toEqual([
      { type: "input_audio_buffer.clear" },
      expect.objectContaining({
        response_id: "response-initial-question",
        type: "response.cancel",
      }),
      { type: "output_audio_buffer.clear" },
    ]);
    expect(track.enabled).toBe(false);
    expect(peer.close).not.toHaveBeenCalled();

    dataChannel.receive({
      content_index: 0,
      item_id: "item-before-handoff",
      transcript: "This began before the handoff.",
      type: "conversation.item.input_audio_transcription.completed",
    });
    dataChannel.receive({ type: "input_audio_buffer.cleared" });
    dataChannel.receive({
      response_id: "response-initial-question",
      type: "output_audio_buffer.cleared",
    });
    dataChannel.receive({
      response: {
        id: "response-initial-question",
        output: [],
        status: "cancelled",
      },
      type: "response.done",
    });
    await handoff;
    await repeatedHandoff;

    expect(submitInterviewAnswer).not.toHaveBeenCalled();
    expect(track.enabled).toBe(true);
    expect(controller.getSnapshot()).toMatchObject({
      canRepeatQuestion: true,
      canTakeTurn: false,
      connection: "connected",
      currentQuestion: "What happens after approval?",
      input: "listening",
      microphoneEnabled: true,
      output: "interrupted",
    });

    // Silence or noise: Realtime completes an empty transcript. Nothing is
    // submitted and the session keeps listening with a recoverable notice.
    dataChannel.receive({
      audio_start_ms: 200,
      item_id: "noise-item",
      type: "input_audio_buffer.speech_started",
    });
    dataChannel.receive({
      content_index: 0,
      item_id: "noise-item",
      transcript: "   ",
      type: "conversation.item.input_audio_transcription.completed",
    });
    await Promise.resolve();
    expect(submitInterviewAnswer).not.toHaveBeenCalled();
    expect(controller.getSnapshot()).toMatchObject({
      input: "listening",
      inputNotice: "not-heard",
      lastCommittedText: "",
    });

    // A legacy model-generated tool argument stream must never become speech.
    dataChannel.receive({
      call_id: "call-1",
      delta: '{"answer":"hi"}',
      item_id: "function-item-1",
      output_index: 0,
      response_id: "response-tool-1",
      type: "response.function_call_arguments.delta",
    });
    await Promise.resolve();
    expect(submitInterviewAnswer).not.toHaveBeenCalled();

    dataChannel.receive({
      audio_start_ms: 300,
      item_id: "user-item",
      type: "input_audio_buffer.speech_started",
    });
    dataChannel.receive({
      content_index: 0,
      delta: "The supervisor",
      item_id: "user-item",
      type: "conversation.item.input_audio_transcription.delta",
    });
    expect(controller.getSnapshot().partialText).toBe("The supervisor");
    dataChannel.receive({
      content_index: 0,
      item_id: "user-item",
      transcript: spokenAnswer,
      type: "conversation.item.input_audio_transcription.completed",
    });
    dataChannel.receive({
      content_index: 0,
      item_id: "user-item",
      transcript: spokenAnswer,
      type: "conversation.item.input_audio_transcription.completed",
    });

    await vi.waitFor(() =>
      expect(submitInterviewAnswer).toHaveBeenCalledWith({
        id: "voice-realtime:1:user-item:0",
        text: spokenAnswer,
      }),
    );
    expect(submitInterviewAnswer).toHaveBeenCalledOnce();
    expect(controller.getSnapshot()).toMatchObject({
      input: "submitting",
      inputNotice: "none",
      lastAnswerDelivery: "delivered",
      lastCommittedText: spokenAnswer,
      microphoneEnabled: true,
      output: "waiting-for-tool",
      partialText: "",
    });

    const pendingSpeech = selectInterviewSpeech(initialMessages);
    controller.updateChat({
      automaticSource: pendingSpeech.automaticSource,
      canAcceptInterviewAnswer: false,
      canonicalSegments: [...pendingSpeech.canonicalSegments],
      status: "streaming",
    });
    const responseSpeech = selectInterviewSpeech(responseMessages);
    expect(responseSpeech.automaticSource).toMatchObject({
      contextSegments: [{ text: canonicalReply }],
      questionSegment: { text: canonicalQuestion },
    });
    expect(responseSpeech.canonicalSegments.map(({ text }) => text)).toEqual([
      "What happens after approval?",
      canonicalReply,
      canonicalQuestion,
    ]);
    controller.updateChat({
      automaticSource: responseSpeech.automaticSource,
      canAcceptInterviewAnswer: true,
      canonicalSegments: [...responseSpeech.canonicalSegments],
      status: "ready",
    });

    const preparationCreate = sentEvents(dataChannel).at(-1)!;
    expect(preparationCreate).toMatchObject({
      type: "response.create",
      response: {
        metadata: { petrinaut_kind: "speech-preparation" },
        output_modalities: ["text"],
      },
    });
    const preparationResponse = preparationCreate.response as {
      input: Array<{ content: Array<{ text: string }> }>;
      metadata: Record<string, unknown>;
    };
    expect(JSON.parse(preparationResponse.input[0]!.content[0]!.text)).toEqual({
      context_text: [canonicalReply],
      maximum_words: 50 - canonicalQuestion.trim().split(/\s+/u).length,
    });
    expect(JSON.stringify(preparationResponse)).not.toContain(toolMetadata);
    expect(JSON.stringify(preparationResponse)).not.toContain(toolError);
    dataChannel.receive({
      response: {
        id: "response-prepared-reply",
        metadata: preparationResponse.metadata,
      },
      type: "response.created",
    });
    dataChannel.receive({
      delta: preparedReply,
      response_id: "response-prepared-reply",
      type: "response.output_text.delta",
    });
    dataChannel.receive({
      response: {
        id: "response-prepared-reply",
        output: [],
        status: "completed",
      },
      type: "response.done",
    });

    await vi.waitFor(() =>
      expect(sentEvents(dataChannel).at(-1)).toMatchObject({
        response: { metadata: { petrinaut_kind: "canonical-speech" } },
        type: "response.create",
      }),
    );

    const responseCreate = sentEvents(dataChannel).at(-1)!;
    expect(responseCreate).toMatchObject({
      type: "response.create",
      response: {
        conversation: "none",
        output_modalities: ["audio"],
        tool_choice: "none",
        tools: [],
      },
    });
    const speechResponse = responseCreate.response as {
      input: Array<{ content: Array<{ text: string }> }>;
    };
    expect(JSON.parse(speechResponse.input[0]!.content[0]!.text)).toEqual({
      response_text: [preparedReply, canonicalQuestion],
    });
    expect(JSON.stringify(responseCreate)).not.toContain(toolMetadata);
    expect(JSON.stringify(responseCreate)).not.toContain(toolError);
    expect(sentEvents(dataChannel)).not.toContainEqual(
      expect.objectContaining({ type: "conversation.item.create" }),
    );

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

    dataChannel.receive({
      response_id: "response-canonical-reply",
      type: "output_audio_buffer.stopped",
    });
    dataChannel.receive({
      response: {
        id: "response-canonical-reply",
        output: [],
        status: "completed",
      },
      type: "response.done",
    });

    controller.readFullResponse();
    await vi.waitFor(() =>
      expect(sentEvents(dataChannel).at(-1)).toMatchObject({
        response: {
          metadata: { petrinaut_kind: "canonical-speech" },
        },
        type: "response.create",
      }),
    );
    const replayCreate = sentEvents(dataChannel).at(-1)!;
    const replayResponse = replayCreate.response as {
      input: Array<{ content: Array<{ text: string }> }>;
    };
    expect(JSON.parse(replayResponse.input[0]!.content[0]!.text)).toEqual({
      response_text: [canonicalReply, canonicalQuestion],
    });
    expect(JSON.stringify(replayCreate)).not.toContain(preparedReply);

    authorizeLatestSpeechResponse(dataChannel, "response-canonical-replay");
    dataChannel.receive({
      response_id: "response-canonical-replay",
      type: "output_audio_buffer.started",
    });
    dataChannel.receive({
      response_id: "response-canonical-replay",
      type: "output_audio_buffer.stopped",
    });
    dataChannel.receive({
      response: {
        id: "response-canonical-replay",
        output: [],
        status: "completed",
      },
      type: "response.done",
    });

    const canonicalSpeechCountBeforeFallback = sentEvents(dataChannel).filter(
      (event) =>
        event.type === "response.create" &&
        (event.response as { metadata?: { petrinaut_kind?: string } }).metadata
          ?.petrinaut_kind === "canonical-speech",
    ).length;
    const fallbackSpeech = selectInterviewSpeech(fallbackMessages);
    controller.updateChat({
      automaticSource: fallbackSpeech.automaticSource,
      canAcceptInterviewAnswer: true,
      canonicalSegments: [...fallbackSpeech.canonicalSegments],
      status: "ready",
    });
    const fallbackPreparationCreate = sentEvents(dataChannel).at(-1)!;
    expect(fallbackPreparationCreate).toMatchObject({
      response: {
        metadata: { petrinaut_kind: "speech-preparation" },
      },
      type: "response.create",
    });
    const fallbackPreparationResponse = fallbackPreparationCreate.response as {
      input: Array<{ content: Array<{ text: string }> }>;
      metadata: Record<string, unknown>;
    };
    expect(
      JSON.parse(fallbackPreparationResponse.input[0]!.content[0]!.text),
    ).toMatchObject({ context_text: [fallbackReply] });
    dataChannel.receive({
      response: {
        id: "response-fallback-preparation",
        metadata: fallbackPreparationResponse.metadata,
      },
      type: "response.created",
    });
    dataChannel.receive({
      response: {
        id: "response-fallback-preparation",
        status: "failed",
      },
      type: "response.done",
    });

    await vi.waitFor(() =>
      expect(
        sentEvents(dataChannel).filter(
          (event) =>
            event.type === "response.create" &&
            (event.response as { metadata?: { petrinaut_kind?: string } })
              .metadata?.petrinaut_kind === "canonical-speech",
        ),
      ).toHaveLength(canonicalSpeechCountBeforeFallback + 1),
    );
    const fallbackAudioCreate = sentEvents(dataChannel).at(-1)!;
    const fallbackAudioResponse = fallbackAudioCreate.response as {
      input: Array<{ content: Array<{ text: string }> }>;
    };
    expect(
      JSON.parse(fallbackAudioResponse.input[0]!.content[0]!.text),
    ).toEqual({ response_text: [fallbackReply, fallbackQuestion] });
    expect(responseMessages).toEqual(responseMessagesSnapshot);

    // A fabricated `continue_interview` call from Realtime fails closed: the
    // session disconnects rather than letting the argument become an answer.
    dataChannel.receive({
      response: {
        id: "response-fabricated-tool",
        output: [
          {
            arguments: '{"answer":"one"}',
            call_id: "call-fabricated",
            id: "function-item-fabricated",
            name: "continue_interview",
            status: "completed",
            type: "function_call",
          },
        ],
        status: "completed",
      },
      type: "response.done",
    });
    await Promise.resolve();
    expect(submitInterviewAnswer).toHaveBeenCalledOnce();
    expect(controller.getSnapshot()).toMatchObject({
      connection: "error",
      errorCode: "invalid-response",
    });
    expect(sentEvents(dataChannel)).not.toContainEqual(
      expect.objectContaining({ type: "conversation.item.create" }),
    );

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
      preparedReply,
      canonicalQuestion,
      toolMetadata,
      toolError,
      fallbackReply,
      fallbackQuestion,
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
