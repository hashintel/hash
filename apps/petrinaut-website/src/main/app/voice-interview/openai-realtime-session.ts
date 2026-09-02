import {
  createVoiceRequestId,
  VoiceError,
  VOICE_REQUEST_ID_HEADER,
  voiceDiagnosticOutcome,
  voiceDurationMs,
  voiceErrorFromResponse,
  voiceErrorMessage,
  type VoiceDiagnosticReporter,
  type VoiceErrorCode,
  type VoiceOperation,
} from "../../../voice-diagnostics";

import type { CanonicalSpeechSegment } from "./canonical-speech";

export interface OpenAIRealtimeTranscriptKey {
  readonly connectionEpoch: number;
  readonly contentIndex: number;
  readonly itemId: string;
}

interface RealtimeToolEventIdentity {
  readonly callId: string;
  readonly connectionEpoch: number;
  readonly itemId: string;
  readonly responseId: string;
}

export type OpenAIRealtimeSessionEvent =
  | {
      readonly key: OpenAIRealtimeTranscriptKey;
      readonly text: string;
      readonly type: "partial" | "completed";
    }
  | {
      readonly key: OpenAIRealtimeTranscriptKey;
      readonly type: "transcription-failed";
    }
  | { readonly level: number; readonly type: "microphone-level" }
  | {
      readonly connectionEpoch: number;
      readonly itemId: string;
      readonly type: "input-speech-started";
    }
  | {
      readonly connectionEpoch: number;
      readonly itemId: string;
      readonly type: "input-speech-stopped";
    }
  | {
      readonly connectionEpoch: number;
      readonly responseId: string;
      readonly type: "output-started";
    }
  | {
      readonly connectionEpoch: number;
      readonly responseId: string;
      readonly type: "output-stopped";
    }
  | {
      readonly connectionEpoch: number;
      readonly responseId: string;
      readonly type: "output-interrupted";
    }
  | {
      readonly connectionEpoch: number;
      readonly responseId: string;
      readonly status: "cancelled" | "completed" | "failed" | "incomplete";
      readonly type: "response-terminal";
    }
  | (RealtimeToolEventIdentity & {
      readonly delta: string;
      readonly type: "tool-arguments-delta";
    })
  | (RealtimeToolEventIdentity & {
      readonly arguments: string;
      readonly name: string;
      readonly type: "tool-arguments-done";
    })
  | {
      readonly code: VoiceErrorCode;
      readonly message: string;
      readonly requestId: string;
      readonly type: "error";
    };

interface RemoteAudio {
  autoplay: boolean;
  srcObject: HTMLMediaElement["srcObject"];
  pause(): void;
  play(): Promise<void>;
}

interface OpenAIRealtimeSessionDependencies {
  readonly cancelAnimationFrame: (handle: number) => void;
  readonly connectionTimeoutMs: number;
  readonly createAudioContext: () => AudioContext;
  readonly createRemoteAudio: () => RemoteAudio;
  readonly createRequestId?: () => string;
  readonly createPeerConnection: () => RTCPeerConnection;
  readonly fetch: typeof globalThis.fetch;
  readonly getUserMedia: (
    constraints: MediaStreamConstraints,
  ) => Promise<MediaStream>;
  readonly now?: () => number;
  readonly reportDiagnostic?: VoiceDiagnosticReporter;
  readonly requestAnimationFrame: (callback: FrameRequestCallback) => number;
}

interface RequestTiming {
  readonly requestId: string;
  readonly startedAt: number;
}

export interface InterviewSpeechPreparationRequest {
  readonly cacheKey: string;
  readonly contextText: readonly string[];
  readonly contextWordBudget: number;
  readonly sourceSegmentIds: readonly string[];
}

export type InterviewSpeechPreparationResult =
  | {
      readonly context: string;
      readonly kind: "prepared";
      readonly sourceSegmentIds: readonly string[];
    }
  | {
      readonly kind: "fallback";
      readonly reason:
        | "empty-context"
        | "invalid-output"
        | "provider-error"
        | "timeout"
        | "interrupted";
      readonly sourceSegmentIds: readonly string[];
    };

type InterviewSpeechPreparationFallbackReason = Extract<
  InterviewSpeechPreparationResult,
  { kind: "fallback" }
>["reason"];

interface CanonicalSpeechRequest {
  readonly kind: "canonical-speech";
  readonly response: Record<string, unknown>;
  readonly speechRequestId: string;
}

interface InterviewPreparationResponseRequest {
  readonly kind: "speech-preparation";
  readonly preparationRequestId: string;
  readonly response: Record<string, unknown>;
}

type SerializedResponseRequest =
  | CanonicalSpeechRequest
  | InterviewPreparationResponseRequest;

interface PendingInterviewPreparation {
  readonly inputWordCount: number;
  readonly outputChunks: string[];
  readonly request: InterviewSpeechPreparationRequest;
  readonly requestId: string;
  readonly resolve: (result: InterviewSpeechPreparationResult) => void;
  readonly startedAt: number;
  readonly timeout: ReturnType<typeof globalThis.setTimeout>;
}

type PendingClientEvent =
  | {
      readonly kind: "response-cancel";
      readonly responseId: string;
    }
  | {
      readonly kind: "response-create";
      readonly request: SerializedResponseRequest;
      readonly responseTerminalSequence: number;
    };

type SessionListener = (event: OpenAIRealtimeSessionEvent) => void;

const CANONICAL_RESPONSE_INSTRUCTIONS =
  "Speak only the response_text strings supplied by Petrinaut, in array order and verbatim. Deliver them as a warm, calm, curious, confident, concise, and professionally neutral expert interviewer, at a measured conversational pace with natural emphasis. Never sound robotic, fawning, rushed, overenthusiastic, or patronizing. Do not add, remove, paraphrase, acknowledge, or explain anything.";
const INTERVIEW_PREPARATION_INSTRUCTIONS = [
  "Rewrite the supplied context as a concise spoken interviewer response.",
  "Output plain text only.",
  "Use one or two short sentences.",
  "Do not ask a question.",
  "Do not add facts, promises, praise, choices, or next steps.",
  "Preserve explicit negations, warnings, commitments, and required actions.",
  "Stay within the supplied maximum word count.",
].join(" ");
const MAX_CANONICAL_SEGMENTS = 64;
const MAX_PREPARED_CONTEXT_CHARACTERS = 400;
const PREPARATION_TIMEOUT_MS = 2_000;
const INVALID_PREPARED_CONTEXT_SYNTAX =
  /(^|\n)\s*(?:#{1,6}\s|[-*+]\s|\d+[.)]\s)|```(?:json)?|\b(?:brunch_ask|continue_interview)\s*\(|<tool\b/iu;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const nonEmptyString = (value: unknown): string | null =>
  typeof value === "string" && value ? value : null;

const nonNegativeInteger = (value: unknown): number | null =>
  Number.isInteger(value) && (value as number) >= 0 ? (value as number) : null;

const countWords = (text: string): number => {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/u).length : 0;
};

const parseRealtimeEvent = (value: unknown): Record<string, unknown> | null => {
  if (typeof value !== "string") {
    return null;
  }
  try {
    return asRecord(JSON.parse(value));
  } catch {
    return null;
  }
};

const stopStream = (stream: MediaStream): void => {
  for (const track of stream.getTracks()) {
    track.stop();
  }
};

const waitForAbort = <Value>(
  promise: Promise<Value>,
  signal: AbortSignal,
): Promise<Value> => {
  if (signal.aborted) {
    return Promise.reject(signal.reason);
  }
  return new Promise((resolve, reject) => {
    const handleAbort = () => reject(signal.reason);
    signal.addEventListener("abort", handleAbort, { once: true });
    void promise.then(
      (value) => {
        signal.removeEventListener("abort", handleAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", handleAbort);
        reject(error);
      },
    );
  });
};

export class OpenAIRealtimeSession {
  readonly #dependencies: OpenAIRealtimeSessionDependencies;
  readonly #activeResponseIds = new Set<string>();
  readonly #listeners = new Set<SessionListener>();
  readonly #authorizedResponseIds = new Set<string>();
  readonly #cancelledCanonicalResponseIds = new Set<string>();
  readonly #cancelledPreparationRequestIds = new Set<string>();
  readonly #cancelledSpeechRequestIds = new Set<string>();
  readonly #canonicalResponseIds = new Set<string>();
  readonly #completedResponseCancelEventIds = new Set<string>();
  readonly #pendingClientEvents = new Map<string, PendingClientEvent>();
  readonly #pendingPreparations = new Map<
    string,
    PendingInterviewPreparation
  >();
  readonly #pendingSpeechRequests = new Map<string, RequestTiming>();
  readonly #preparationResponseIds = new Map<string, string>();
  readonly #remoteStreams = new Set<MediaStream>();
  readonly #responseQueue: SerializedResponseRequest[] = [];
  readonly #speechTimings = new Map<string, RequestTiming>();
  readonly #transcriptionTimings = new Map<string, RequestTiming>();
  #abortController: AbortController | null = null;
  #activeEpoch: number | null = null;
  #analyser: AnalyserNode | null = null;
  #audioContext: AudioContext | null = null;
  #connected = false;
  #connectedAt: number | null = null;
  #clientEventSequence = 0;
  #connectionRequestId: string | null = null;
  #dataChannel: RTCDataChannel | null = null;
  #epoch = 0;
  #mediaStream: MediaStream | null = null;
  #messageListener: ((event: MessageEvent<unknown>) => void) | null = null;
  #meterFrame: number | null = null;
  #meterHasSample = false;
  #meterLevel = 0;
  #meterSamples: Uint8Array<ArrayBuffer> | null = null;
  #microphoneTrack: MediaStreamTrack | null = null;
  #peerConnection: RTCPeerConnection | null = null;
  #remoteAudio: RemoteAudio | null = null;
  #responseCreateEventId: string | null = null;
  #responseTerminalSequence = 0;
  #speakingResponseId: string | null = null;
  #speechRequestSequence = 0;
  #unexpectedCloseListener: (() => void) | null = null;
  #waitingForResponseTerminal = false;

  public constructor(dependencies: OpenAIRealtimeSessionDependencies) {
    this.#dependencies = dependencies;
  }

  public subscribe(listener: SessionListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  public async connect(): Promise<number> {
    this.#releaseResources();
    const requestId =
      this.#dependencies.createRequestId?.() ?? createVoiceRequestId();
    const startedAt = this.#now();
    const connectionEpoch = ++this.#epoch;
    this.#activeEpoch = connectionEpoch;
    this.#connectionRequestId = requestId;
    const abortController = new AbortController();
    this.#abortController = abortController;
    const timeoutError = new DOMException(
      "Connection timed out",
      "TimeoutError",
    );
    const timeout = globalThis.setTimeout(
      () => abortController.abort(timeoutError),
      this.#dependencies.connectionTimeoutMs,
    );

    try {
      this.#initializeOptionalMeter();
      const mediaStream = await this.#getMediaStream(
        abortController.signal,
        requestId,
        connectionEpoch,
      );
      this.#mediaStream = mediaStream;
      const [microphoneTrack] = mediaStream.getAudioTracks();
      if (!microphoneTrack) {
        throw new VoiceError("connection", "microphone-device", requestId);
      }
      microphoneTrack.enabled = false;
      this.#microphoneTrack = microphoneTrack;
      if (this.#audioContext) {
        try {
          this.#initializeMeter(this.#audioContext, mediaStream);
        } catch {
          this.#releaseMeterResources();
        }
      }

      const peerConnection = this.#dependencies.createPeerConnection();
      this.#peerConnection = peerConnection;
      this.#remoteAudio = this.#dependencies.createRemoteAudio();
      this.#remoteAudio.autoplay = true;
      peerConnection.ontrack = (event) => {
        if (
          this.#activeEpoch !== connectionEpoch ||
          event.track.kind !== "audio"
        ) {
          return;
        }
        const [stream] = event.streams;
        if (!stream || !this.#remoteAudio) {
          return;
        }
        this.#remoteStreams.add(stream);
        this.#remoteAudio.srcObject = stream;
        try {
          void this.#remoteAudio.play().catch(() => undefined);
        } catch {
          // Autoplay remains enabled; the media element will retry on audio.
        }
      };
      peerConnection.addTrack(microphoneTrack, mediaStream);
      peerConnection.onconnectionstatechange = () => {
        if (
          this.#activeEpoch === connectionEpoch &&
          peerConnection.connectionState === "failed"
        ) {
          this.#handleConnectionFailure("network", "connection");
        }
      };

      const dataChannel = peerConnection.createDataChannel("oai-events");
      this.#dataChannel = dataChannel;
      this.#installDataChannelListeners(dataChannel, connectionEpoch);

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      const offerSdp = peerConnection.localDescription?.sdp ?? offer.sdp;
      if (!offerSdp) {
        throw new VoiceError("connection", "invalid-response", requestId);
      }
      const response = await this.#requestRealtimeCall(
        offerSdp,
        abortController.signal,
        requestId,
      );
      let answerSdp: string;
      try {
        answerSdp = await response.text();
      } catch (error) {
        if (abortController.signal.aborted) throw error;
        throw new VoiceError("connection", "network", requestId);
      }
      if (!answerSdp.trim() || !answerSdp.trimStart().startsWith("v=0")) {
        throw new VoiceError("connection", "invalid-response", requestId);
      }
      await peerConnection.setRemoteDescription({
        sdp: answerSdp,
        type: "answer",
      });
      await this.#waitForDataChannelOpen(
        dataChannel,
        abortController.signal,
        requestId,
      );
      if (abortController.signal.aborted) {
        throw abortController.signal.reason;
      }
      if (this.#activeEpoch !== connectionEpoch) {
        throw new VoiceError("connection", "request-aborted", requestId);
      }

      this.#connected = true;
      this.#connectedAt = this.#now();
      this.#reportDiagnostic("connection", requestId, startedAt);
      return connectionEpoch;
    } catch (error) {
      const abortReason: unknown = abortController.signal.reason;
      const voiceError =
        abortReason === timeoutError
          ? new VoiceError("connection", "timeout", requestId)
          : abortReason instanceof VoiceError
            ? abortReason
            : error instanceof VoiceError
              ? error
              : abortController.signal.aborted ||
                  (error instanceof DOMException && error.name === "AbortError")
                ? new VoiceError("connection", "request-aborted", requestId)
                : new VoiceError("connection", "invalid-response", requestId);
      if (this.#activeEpoch === connectionEpoch) {
        this.#releaseResources();
      }
      this.#reportDiagnostic(
        "connection",
        requestId,
        startedAt,
        voiceError.code,
      );
      throw voiceError;
    } finally {
      globalThis.clearTimeout(timeout);
      if (this.#abortController === abortController) {
        this.#abortController = null;
      }
    }
  }

  public setMicrophoneEnabled(enabled: boolean): void {
    if (!this.#microphoneTrack) {
      return;
    }
    const isEnabled = enabled && this.#connected;
    this.#microphoneTrack.enabled = isEnabled;
    if (isEnabled) {
      this.#startMeter();
    } else {
      this.#stopMeter();
    }
  }

  public speakCanonical(segments: CanonicalSpeechSegment[]): void {
    this.#requestSpeech(this.#canonicalResponseText(segments), true);
  }

  public speakPrepared(responseText: readonly string[]): void {
    this.#requestSpeech(this.#validResponseText(responseText), true);
  }

  public completeFunctionCall(
    callId: string,
    responseTextInput: readonly string[],
    {
      speakResponse = true,
    }: {
      readonly speakResponse?: boolean;
    } = {},
  ): void {
    if (!callId) {
      throw new VoiceError("speech", "invalid-response", "");
    }
    const responseText = this.#validResponseText(responseTextInput);
    this.#send({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: callId,
        output: JSON.stringify({ response_text: responseText }),
      },
    });
    if (speakResponse) {
      this.#requestSpeech(responseText, false);
    }
  }

  public prepareInterviewSpeech(
    request: InterviewSpeechPreparationRequest,
  ): Promise<InterviewSpeechPreparationResult> {
    const sourceSegmentIds = [...request.sourceSegmentIds];
    const contextText = request.contextText.filter((text) => text.trim());
    if (contextText.length === 0) {
      return Promise.resolve({
        kind: "fallback",
        reason: "empty-context",
        sourceSegmentIds,
      });
    }
    if (request.contextWordBudget === 0) {
      return Promise.resolve({
        context: "",
        kind: "prepared",
        sourceSegmentIds,
      });
    }
    if (
      !request.cacheKey ||
      !Number.isInteger(request.contextWordBudget) ||
      request.contextWordBudget < 0 ||
      this.#pendingPreparations.has(request.cacheKey)
    ) {
      return Promise.resolve({
        kind: "fallback",
        reason: "invalid-output",
        sourceSegmentIds,
      });
    }

    return new Promise((resolve) => {
      const timeout = globalThis.setTimeout(
        () => this.#timeoutPreparation(request.cacheKey),
        PREPARATION_TIMEOUT_MS,
      );
      this.#pendingPreparations.set(request.cacheKey, {
        inputWordCount: countWords(contextText.join(" ")),
        outputChunks: [],
        request,
        requestId:
          this.#dependencies.createRequestId?.() ?? createVoiceRequestId(),
        resolve,
        startedAt: this.#now(),
        timeout,
      });

      const serializedRequest: InterviewPreparationResponseRequest = {
        kind: "speech-preparation",
        preparationRequestId: request.cacheKey,
        response: {
          conversation: "none",
          input: [
            {
              type: "message",
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: JSON.stringify({
                    context_text: contextText,
                    maximum_words: request.contextWordBudget,
                  }),
                },
              ],
            },
          ],
          instructions: INTERVIEW_PREPARATION_INSTRUCTIONS,
          max_output_tokens: 120,
          output_modalities: ["text"],
          parallel_tool_calls: false,
          tool_choice: "none",
          tools: [],
          metadata: {
            petrinaut_kind: "speech-preparation",
            petrinaut_request_id: request.cacheKey,
          },
        },
      };
      this.#responseQueue.push(serializedRequest);
      try {
        this.#sendNextSerializedResponse();
      } catch {
        const queuedRequestIndex =
          this.#responseQueue.indexOf(serializedRequest);
        if (queuedRequestIndex >= 0) {
          this.#responseQueue.splice(queuedRequestIndex, 1);
        }
        this.#settlePreparation(request.cacheKey, "provider-error");
      }
    });
  }

  public cancelOutput(): void {
    if (!this.#connected || this.#dataChannel?.readyState !== "open") {
      return;
    }

    for (const request of this.#responseQueue.splice(0)) {
      if (request.kind === "canonical-speech") {
        this.#cancelPendingSpeechRequest(request.speechRequestId);
      } else {
        this.#settlePreparation(request.preparationRequestId, "interrupted");
      }
    }

    if (this.#responseCreateEventId !== null) {
      const pendingEvent = this.#pendingClientEvents.get(
        this.#responseCreateEventId,
      );
      if (pendingEvent?.kind === "response-create") {
        if (pendingEvent.request.kind === "canonical-speech") {
          this.#cancelledSpeechRequestIds.add(
            pendingEvent.request.speechRequestId,
          );
        } else {
          this.#cancelledPreparationRequestIds.add(
            pendingEvent.request.preparationRequestId,
          );
          this.#settlePreparation(
            pendingEvent.request.preparationRequestId,
            "interrupted",
          );
        }
      }
    }

    for (const [
      responseId,
      preparationRequestId,
    ] of this.#preparationResponseIds) {
      if (this.#activeResponseIds.has(responseId)) {
        this.#settlePreparation(preparationRequestId, "interrupted");
        this.#cancelResponse(responseId);
      }
    }

    for (const responseId of this.#canonicalResponseIds) {
      if (
        this.#activeResponseIds.has(responseId) &&
        !this.#cancelledCanonicalResponseIds.has(responseId)
      ) {
        this.#cancelledCanonicalResponseIds.add(responseId);
        this.#cancelOutputResponse(responseId);
      }
    }
  }

  #cancelOutputResponse(responseId: string): void {
    this.#cancelResponse(responseId);
    this.#send({ type: "output_audio_buffer.clear" });
  }

  public async disconnect(): Promise<void> {
    this.#releaseResources();
  }

  #canonicalResponseText(segments: CanonicalSpeechSegment[]): string[] {
    return this.#validResponseText(segments.map(({ text }) => text));
  }

  #validResponseText(responseTextInput: readonly string[]): string[] {
    const responseText = responseTextInput
      .slice(0, MAX_CANONICAL_SEGMENTS)
      .map((text) => text.trim())
      .filter(Boolean);
    if (
      responseText.length === 0 ||
      responseText.length !== responseTextInput.length
    ) {
      throw new VoiceError("speech", "invalid-response", "");
    }
    return responseText;
  }

  #requestSpeech(responseText: string[], outOfBand: boolean): void {
    const speechRequestId = `canonical-${this.#activeEpoch}-${++this.#speechRequestSequence}`;
    this.#pendingSpeechRequests.set(speechRequestId, {
      requestId:
        this.#dependencies.createRequestId?.() ?? createVoiceRequestId(),
      startedAt: this.#now(),
    });
    const response = {
      ...(outOfBand
        ? {
            conversation: "none",
            input: [
              {
                type: "message",
                role: "system",
                content: [
                  {
                    type: "input_text",
                    text: JSON.stringify({ response_text: responseText }),
                  },
                ],
              },
            ],
          }
        : {}),
      instructions: CANONICAL_RESPONSE_INSTRUCTIONS,
      output_modalities: ["audio"],
      parallel_tool_calls: false,
      tool_choice: "none",
      tools: [],
      metadata: {
        petrinaut_kind: "canonical-speech",
        petrinaut_request_id: speechRequestId,
      },
    };
    const request: CanonicalSpeechRequest = {
      kind: "canonical-speech",
      response,
      speechRequestId,
    };
    this.#responseQueue.push(request);
    try {
      this.#sendNextSerializedResponse();
    } catch (error) {
      const queuedRequestIndex = this.#responseQueue.indexOf(request);
      if (queuedRequestIndex >= 0) {
        this.#responseQueue.splice(queuedRequestIndex, 1);
      }
      this.#pendingSpeechRequests.delete(speechRequestId);
      throw error;
    }
  }

  #cancelResponse(responseId: string): void {
    const eventId = this.#createClientEventId();
    this.#pendingClientEvents.set(eventId, {
      kind: "response-cancel",
      responseId,
    });
    try {
      this.#send({
        event_id: eventId,
        response_id: responseId,
        type: "response.cancel",
      });
    } catch (error) {
      this.#pendingClientEvents.delete(eventId);
      throw error;
    }
  }

  #createClientEventId(): string {
    return `petrinaut-${this.#activeEpoch}-${++this.#clientEventSequence}`;
  }

  #sendNextSerializedResponse(): void {
    if (
      this.#activeResponseIds.size > 0 ||
      this.#responseCreateEventId !== null ||
      this.#waitingForResponseTerminal
    ) {
      return;
    }
    const request = this.#responseQueue.shift();
    if (!request) {
      return;
    }

    const eventId = this.#createClientEventId();
    this.#responseCreateEventId = eventId;
    this.#pendingClientEvents.set(eventId, {
      kind: "response-create",
      request,
      responseTerminalSequence: this.#responseTerminalSequence,
    });
    try {
      this.#send({
        event_id: eventId,
        response: request.response,
        type: "response.create",
      });
    } catch (error) {
      this.#responseCreateEventId = null;
      this.#pendingClientEvents.delete(eventId);
      throw error;
    }
  }

  #send(event: Record<string, unknown>): void {
    if (!this.#connected || this.#dataChannel?.readyState !== "open") {
      throw new VoiceError("connection", "network", "");
    }
    this.#dataChannel.send(JSON.stringify(event));
  }

  #handleMessage(event: MessageEvent<unknown>, connectionEpoch: number): void {
    const parsed = parseRealtimeEvent(event.data);
    if (!parsed || typeof parsed.type !== "string") {
      return;
    }
    if (parsed.type === "error") {
      this.#handleProviderError(parsed);
      return;
    }
    if (parsed.type === "response.created") {
      this.#handleResponseCreated(parsed);
      return;
    }
    if (parsed.type === "response.done") {
      this.#handleResponseDone(parsed, connectionEpoch);
      return;
    }
    if (parsed.type === "response.output_text.delta") {
      this.#handlePreparationDelta(parsed);
      return;
    }
    if (parsed.type === "input_audio_buffer.committed") {
      const itemId = nonEmptyString(parsed.item_id);
      if (itemId) this.#startTranscription(itemId);
      return;
    }
    if (parsed.type === "input_audio_buffer.speech_started") {
      const itemId = nonEmptyString(parsed.item_id);
      if (!itemId || nonNegativeInteger(parsed.audio_start_ms) === null) return;
      this.#emit({
        connectionEpoch,
        itemId,
        type: "input-speech-started",
      });
      if (this.#speakingResponseId) {
        this.#emit({
          connectionEpoch,
          responseId: this.#speakingResponseId,
          type: "output-interrupted",
        });
      }
      return;
    }
    if (parsed.type === "input_audio_buffer.speech_stopped") {
      const itemId = nonEmptyString(parsed.item_id);
      if (!itemId || nonNegativeInteger(parsed.audio_end_ms) === null) return;
      this.#emit({
        connectionEpoch,
        itemId,
        type: "input-speech-stopped",
      });
      return;
    }
    if (
      parsed.type === "output_audio_buffer.started" ||
      parsed.type === "output_audio_buffer.stopped"
    ) {
      this.#handleOutputBufferEvent(parsed, connectionEpoch);
      return;
    }
    if (parsed.type === "response.function_call_arguments.delta") {
      this.#handleToolEvent(parsed, connectionEpoch);
      return;
    }
    if (
      parsed.type === "conversation.item.input_audio_transcription.delta" ||
      parsed.type === "conversation.item.input_audio_transcription.completed" ||
      parsed.type === "conversation.item.input_audio_transcription.failed"
    ) {
      this.#handleTranscriptEvent(parsed, connectionEpoch);
    }
  }

  #handleResponseCreated(event: Record<string, unknown>): void {
    const response = asRecord(event.response);
    const responseId = nonEmptyString(response?.id);
    if (!responseId) {
      return;
    }
    this.#activeResponseIds.add(responseId);
    const metadata = asRecord(response?.metadata);
    const correlatedRequestId = nonEmptyString(metadata?.petrinaut_request_id);
    if (!correlatedRequestId) {
      return;
    }

    if (metadata?.petrinaut_kind === "speech-preparation") {
      const correlated = this.#completeResponseCreateEvent(
        "speech-preparation",
        correlatedRequestId,
      );
      if (!correlated) {
        this.#cancelResponse(responseId);
        return;
      }
      this.#preparationResponseIds.set(responseId, correlatedRequestId);
      if (
        this.#cancelledPreparationRequestIds.delete(correlatedRequestId) ||
        !this.#pendingPreparations.has(correlatedRequestId)
      ) {
        this.#cancelResponse(responseId);
      }
      return;
    }
    if (metadata?.petrinaut_kind !== "canonical-speech") {
      return;
    }

    if (
      !this.#completeResponseCreateEvent(
        "canonical-speech",
        correlatedRequestId,
      )
    ) {
      this.#cancelResponse(responseId);
      return;
    }
    this.#canonicalResponseIds.add(responseId);
    if (this.#cancelledSpeechRequestIds.delete(correlatedRequestId)) {
      this.#cancelPendingSpeechRequest(correlatedRequestId);
      this.#cancelledCanonicalResponseIds.add(responseId);
      this.#cancelOutputResponse(responseId);
      return;
    }
    const timing = this.#pendingSpeechRequests.get(correlatedRequestId);
    if (!timing) {
      return;
    }
    this.#pendingSpeechRequests.delete(correlatedRequestId);
    this.#authorizedResponseIds.add(responseId);
    this.#speechTimings.set(responseId, timing);
  }

  #completeResponseCreateEvent(
    kind: SerializedResponseRequest["kind"],
    requestId: string,
  ): boolean {
    const eventIds = this.#responseCreateEventId
      ? [this.#responseCreateEventId]
      : [];
    if (
      kind === "speech-preparation" &&
      this.#cancelledPreparationRequestIds.has(requestId)
    ) {
      eventIds.push(
        ...[...this.#pendingClientEvents.entries()]
          .filter(
            ([eventId, pendingEvent]) =>
              eventId !== this.#responseCreateEventId &&
              pendingEvent.kind === "response-create" &&
              pendingEvent.request.kind === "speech-preparation" &&
              pendingEvent.request.preparationRequestId === requestId,
          )
          .map(([eventId]) => eventId),
      );
    }
    for (const eventId of eventIds) {
      const pendingEvent = this.#pendingClientEvents.get(eventId);
      if (
        pendingEvent?.kind !== "response-create" ||
        pendingEvent.request.kind !== kind ||
        (pendingEvent.request.kind === "canonical-speech"
          ? pendingEvent.request.speechRequestId
          : pendingEvent.request.preparationRequestId) !== requestId
      ) {
        continue;
      }
      this.#pendingClientEvents.delete(eventId);
      if (this.#responseCreateEventId === eventId) {
        this.#responseCreateEventId = null;
      }
      return true;
    }
    return false;
  }

  #handleProviderError(event: Record<string, unknown>): void {
    const providerError = asRecord(event.error);
    const errorType = nonEmptyString(providerError?.type);
    const errorCode = nonEmptyString(providerError?.code);
    const sourceEventId = nonEmptyString(providerError?.event_id);
    const pendingEvent = sourceEventId
      ? this.#pendingClientEvents.get(sourceEventId)
      : undefined;
    const completedResponseCancel =
      sourceEventId !== null &&
      this.#completedResponseCancelEventIds.has(sourceEventId);

    if (
      errorType === "invalid_request_error" &&
      errorCode === "response_cancel_not_active" &&
      sourceEventId &&
      (pendingEvent?.kind === "response-cancel" || completedResponseCancel)
    ) {
      this.#pendingClientEvents.delete(sourceEventId);
      this.#completedResponseCancelEventIds.delete(sourceEventId);
      return;
    }

    if (
      errorType === "invalid_request_error" &&
      errorCode === "conversation_already_has_active_response" &&
      pendingEvent?.kind === "response-create" &&
      sourceEventId
    ) {
      this.#pendingClientEvents.delete(sourceEventId);
      if (this.#responseCreateEventId === sourceEventId) {
        this.#responseCreateEventId = null;
      }
      if (
        pendingEvent.request.kind === "canonical-speech" &&
        this.#cancelledSpeechRequestIds.delete(
          pendingEvent.request.speechRequestId,
        )
      ) {
        this.#cancelPendingSpeechRequest(pendingEvent.request.speechRequestId);
        return;
      }
      if (
        pendingEvent.request.kind === "speech-preparation" &&
        this.#cancelledPreparationRequestIds.delete(
          pendingEvent.request.preparationRequestId,
        )
      ) {
        this.#settlePreparation(
          pendingEvent.request.preparationRequestId,
          "interrupted",
        );
        return;
      }
      this.#responseQueue.unshift(pendingEvent.request);
      this.#waitingForResponseTerminal =
        this.#responseTerminalSequence ===
        pendingEvent.responseTerminalSequence;
      this.#resumeSerializedResponseQueue();
      return;
    }

    if (
      pendingEvent?.kind === "response-create" &&
      pendingEvent.request.kind === "speech-preparation" &&
      sourceEventId
    ) {
      this.#pendingClientEvents.delete(sourceEventId);
      if (this.#responseCreateEventId === sourceEventId) {
        this.#responseCreateEventId = null;
      }
      this.#settlePreparation(
        pendingEvent.request.preparationRequestId,
        "provider-error",
      );
      this.#resumeSerializedResponseQueue();
      return;
    }

    this.#handleConnectionFailure("invalid-response", "connection");
  }

  #handleResponseDone(
    event: Record<string, unknown>,
    connectionEpoch: number,
  ): void {
    const response = asRecord(event.response);
    const responseId = nonEmptyString(response?.id);
    const status = response?.status;
    if (!response || !responseId || typeof status !== "string") {
      return;
    }
    if (
      status !== "completed" &&
      status !== "cancelled" &&
      status !== "failed" &&
      status !== "incomplete"
    ) {
      this.#handleConnectionFailure("invalid-response", "connection");
      return;
    }
    this.#responseTerminalSequence += 1;
    this.#activeResponseIds.delete(responseId);
    this.#clearResponseCancelEvents(responseId);
    this.#waitingForResponseTerminal = false;

    const preparationRequestId = this.#preparationResponseIds.get(responseId);
    if (preparationRequestId) {
      this.#preparationResponseIds.delete(responseId);
      if (status === "completed") {
        this.#finishPreparation(preparationRequestId);
      } else {
        this.#settlePreparation(
          preparationRequestId,
          status === "cancelled" ? "interrupted" : "provider-error",
        );
      }
      this.#resumeSerializedResponseQueue();
      return;
    }

    if (this.#cancelledCanonicalResponseIds.delete(responseId)) {
      this.#emit({
        connectionEpoch,
        responseId,
        status,
        type: "response-terminal",
      });
      this.#finishSpeech(responseId, "request-aborted");
      this.#resumeSerializedResponseQueue();
      return;
    }

    if (status === "completed") {
      const output = response.output;
      if (!Array.isArray(output)) {
        this.#handleConnectionFailure("invalid-response", "connection");
        return;
      }
      const functionCalls = output
        .map(asRecord)
        .filter(
          (item): item is Record<string, unknown> =>
            item?.type === "function_call",
        );
      if (
        functionCalls.length > 1 ||
        (functionCalls.length > 0 && this.#canonicalResponseIds.has(responseId))
      ) {
        this.#handleConnectionFailure("invalid-response", "connection");
        return;
      }
      for (const item of functionCalls) {
        const argumentsJson = nonEmptyString(item.arguments);
        const callId = nonEmptyString(item.call_id);
        const itemId = nonEmptyString(item.id);
        const name = nonEmptyString(item.name);
        if (
          !argumentsJson ||
          !callId ||
          !itemId ||
          !name ||
          (item.status !== undefined && item.status !== "completed")
        ) {
          this.#handleConnectionFailure("invalid-response", "connection");
          return;
        }
        this.#emit({
          arguments: argumentsJson,
          callId,
          connectionEpoch,
          itemId,
          name,
          responseId,
          type: "tool-arguments-done",
        });
      }
      this.#emit({
        connectionEpoch,
        responseId,
        status,
        type: "response-terminal",
      });
      this.#resumeSerializedResponseQueue();
      return;
    }
    if (status === "cancelled") {
      if (this.#speakingResponseId === responseId) {
        this.#emit({
          connectionEpoch,
          responseId,
          type: "output-interrupted",
        });
      }
      this.#emit({
        connectionEpoch,
        responseId,
        status,
        type: "response-terminal",
      });
      this.#finishSpeech(responseId, "request-aborted");
      this.#resumeSerializedResponseQueue();
      return;
    }
    this.#emit({
      connectionEpoch,
      responseId,
      status,
      type: "response-terminal",
    });
    if (this.#authorizedResponseIds.has(responseId)) {
      this.#finishSpeech(responseId, "invalid-response");
    }
    this.#handleConnectionFailure("invalid-response", "connection");
  }

  #clearResponseCancelEvents(responseId: string): void {
    for (const [eventId, pendingEvent] of this.#pendingClientEvents) {
      if (
        pendingEvent.kind === "response-cancel" &&
        pendingEvent.responseId === responseId
      ) {
        this.#pendingClientEvents.delete(eventId);
        this.#completedResponseCancelEventIds.add(eventId);
      }
    }
  }

  #resumeSerializedResponseQueue(): void {
    try {
      this.#sendNextSerializedResponse();
    } catch {
      this.#handleConnectionFailure("network", "speech");
    }
  }

  #handlePreparationDelta(event: Record<string, unknown>): void {
    const responseId = nonEmptyString(event.response_id);
    const delta = event.delta;
    if (!responseId || typeof delta !== "string") {
      return;
    }
    const preparationRequestId = this.#preparationResponseIds.get(responseId);
    if (!preparationRequestId) {
      return;
    }
    this.#pendingPreparations
      .get(preparationRequestId)
      ?.outputChunks.push(delta);
  }

  #finishPreparation(preparationRequestId: string): void {
    const pending = this.#pendingPreparations.get(preparationRequestId);
    if (!pending) {
      return;
    }
    const context = pending.outputChunks.join("").trim();
    if (
      !context ||
      countWords(context) > pending.request.contextWordBudget ||
      Array.from(context).length > MAX_PREPARED_CONTEXT_CHARACTERS ||
      INVALID_PREPARED_CONTEXT_SYNTAX.test(context)
    ) {
      this.#settlePreparation(preparationRequestId, "invalid-output", context);
      return;
    }
    this.#settlePreparation(preparationRequestId, undefined, context);
  }

  #settlePreparation(
    preparationRequestId: string,
    reason?: InterviewSpeechPreparationFallbackReason,
    context = "",
  ): void {
    const pending = this.#pendingPreparations.get(preparationRequestId);
    if (!pending) {
      return;
    }
    this.#pendingPreparations.delete(preparationRequestId);
    globalThis.clearTimeout(pending.timeout);
    const errorCode: VoiceErrorCode | undefined =
      reason === undefined
        ? undefined
        : reason === "timeout"
          ? "timeout"
          : reason === "interrupted"
            ? "request-aborted"
            : "invalid-response";
    this.#dependencies.reportDiagnostic?.({
      durationMs: voiceDurationMs(pending.startedAt, this.#now()),
      ...(errorCode === undefined ? {} : { errorCode }),
      inputWordCount: pending.inputWordCount,
      operation: "preparation",
      outcome: voiceDiagnosticOutcome(errorCode),
      outputWordCount: countWords(context),
      requestId: pending.requestId,
      sourceSegmentCount: pending.request.sourceSegmentIds.length,
      stage: "browser",
    });
    pending.resolve(
      reason === undefined
        ? {
            context,
            kind: "prepared",
            sourceSegmentIds: [...pending.request.sourceSegmentIds],
          }
        : {
            kind: "fallback",
            reason,
            sourceSegmentIds: [...pending.request.sourceSegmentIds],
          },
    );
  }

  #timeoutPreparation(preparationRequestId: string): void {
    const queuedRequestIndex = this.#responseQueue.findIndex(
      (request) =>
        request.kind === "speech-preparation" &&
        request.preparationRequestId === preparationRequestId,
    );
    if (queuedRequestIndex >= 0) {
      this.#responseQueue.splice(queuedRequestIndex, 1);
    }

    const pendingCreateEvent = this.#responseCreateEventId
      ? this.#pendingClientEvents.get(this.#responseCreateEventId)
      : undefined;
    if (
      pendingCreateEvent?.kind === "response-create" &&
      pendingCreateEvent.request.kind === "speech-preparation" &&
      pendingCreateEvent.request.preparationRequestId === preparationRequestId
    ) {
      this.#cancelledPreparationRequestIds.add(preparationRequestId);
      this.#responseCreateEventId = null;
    }
    const activeResponse = [...this.#preparationResponseIds].find(
      ([, requestId]) => requestId === preparationRequestId,
    );
    if (activeResponse) {
      this.#cancelResponse(activeResponse[0]);
    }
    this.#settlePreparation(preparationRequestId, "timeout");
    this.#resumeSerializedResponseQueue();
  }

  #handleOutputBufferEvent(
    event: Record<string, unknown>,
    connectionEpoch: number,
  ): void {
    const responseId = nonEmptyString(event.response_id);
    if (!responseId) return;
    if (event.type === "output_audio_buffer.started") {
      if (this.#cancelledCanonicalResponseIds.has(responseId)) {
        this.#send({ type: "output_audio_buffer.clear" });
        return;
      }
      if (!this.#authorizedResponseIds.has(responseId)) {
        this.#cancelOutputResponse(responseId);
        this.#handleConnectionFailure("invalid-response", "connection");
        return;
      }
      this.#speakingResponseId = responseId;
      this.#emit({ connectionEpoch, responseId, type: "output-started" });
      return;
    }
    const wasSpeaking = this.#speakingResponseId === responseId;
    this.#finishSpeech(
      responseId,
      this.#cancelledCanonicalResponseIds.has(responseId)
        ? "request-aborted"
        : undefined,
    );
    if (wasSpeaking) {
      this.#emit({ connectionEpoch, responseId, type: "output-stopped" });
    }
  }

  #handleToolEvent(
    event: Record<string, unknown>,
    connectionEpoch: number,
  ): void {
    const callId = nonEmptyString(event.call_id);
    const itemId = nonEmptyString(event.item_id);
    const responseId = nonEmptyString(event.response_id);
    const outputIndex = nonNegativeInteger(event.output_index);
    if (!callId || !itemId || !responseId || outputIndex === null) return;
    if (typeof event.delta !== "string") return;
    this.#emit({
      callId,
      connectionEpoch,
      delta: event.delta,
      itemId,
      responseId,
      type: "tool-arguments-delta",
    });
  }

  #handleTranscriptEvent(
    event: Record<string, unknown>,
    connectionEpoch: number,
  ): void {
    const itemId = nonEmptyString(event.item_id);
    const contentIndex = nonNegativeInteger(event.content_index);
    if (!itemId || contentIndex === null) return;
    const key = { connectionEpoch, contentIndex, itemId };
    this.#startTranscription(itemId);
    if (event.type === "conversation.item.input_audio_transcription.failed") {
      this.#finishTranscription(itemId, "invalid-response");
      this.#emit({ key, type: "transcription-failed" });
      return;
    }
    const text =
      event.type === "conversation.item.input_audio_transcription.delta"
        ? event.delta
        : event.transcript;
    if (typeof text !== "string") return;
    if (
      event.type === "conversation.item.input_audio_transcription.completed"
    ) {
      this.#finishTranscription(itemId);
    }
    this.#emit({
      key,
      text,
      type:
        event.type === "conversation.item.input_audio_transcription.delta"
          ? "partial"
          : "completed",
    });
  }

  #cancelPendingSpeechRequest(speechRequestId: string): void {
    const timing = this.#pendingSpeechRequests.get(speechRequestId);
    if (!timing) {
      return;
    }
    this.#pendingSpeechRequests.delete(speechRequestId);
    this.#reportDiagnostic(
      "speech",
      timing.requestId,
      timing.startedAt,
      "request-aborted",
    );
  }

  #finishSpeech(responseId: string, errorCode?: VoiceErrorCode): void {
    const timing = this.#speechTimings.get(responseId);
    if (timing) {
      this.#speechTimings.delete(responseId);
      this.#reportDiagnostic(
        "speech",
        timing.requestId,
        timing.startedAt,
        errorCode,
      );
    }
    this.#authorizedResponseIds.delete(responseId);
    if (this.#speakingResponseId === responseId) {
      this.#speakingResponseId = null;
    }
  }

  #emit(event: OpenAIRealtimeSessionEvent): void {
    for (const listener of this.#listeners) listener(event);
  }

  #handleConnectionFailure(
    code: VoiceErrorCode,
    operation: VoiceOperation,
  ): void {
    const requestId =
      this.#connectionRequestId ??
      this.#dependencies.createRequestId?.() ??
      createVoiceRequestId();
    if (!this.#connected) {
      this.#abortController?.abort(new VoiceError(operation, code, requestId));
      return;
    }
    this.#reportDiagnostic(
      operation,
      requestId,
      this.#connectedAt ?? this.#now(),
      code,
    );
    this.#releaseResources();
    this.#emit({
      code,
      message: voiceErrorMessage(operation, code),
      requestId,
      type: "error",
    });
  }

  #initializeOptionalMeter(): void {
    try {
      const audioContext = this.#dependencies.createAudioContext();
      this.#audioContext = audioContext;
      if (audioContext.state === "suspended") {
        try {
          void audioContext.resume().catch(() => undefined);
        } catch {
          // Input metering is optional and must not block connection.
        }
      }
    } catch {
      // Input metering is optional and must not block connection.
    }
  }

  async #getMediaStream(
    signal: AbortSignal,
    requestId: string,
    connectionEpoch: number,
  ): Promise<MediaStream> {
    try {
      const promise = this.#dependencies.getUserMedia({
        audio: {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      void promise.then(
        (lateStream) => {
          if (this.#activeEpoch !== connectionEpoch) stopStream(lateStream);
        },
        () => undefined,
      );
      return await waitForAbort(promise, signal);
    } catch (error) {
      if (
        error instanceof DOMException &&
        (error.name === "NotAllowedError" || error.name === "SecurityError")
      ) {
        throw new VoiceError("connection", "microphone-permission", requestId);
      }
      if (signal.aborted) throw error;
      throw new VoiceError("connection", "microphone-device", requestId);
    }
  }

  async #requestRealtimeCall(
    offerSdp: string,
    signal: AbortSignal,
    requestId: string,
  ): Promise<Response> {
    let response: Response;
    try {
      response = await this.#dependencies.fetch("/api/voice/realtime-call", {
        body: offerSdp,
        headers: {
          "content-type": "application/sdp",
          [VOICE_REQUEST_ID_HEADER]: requestId,
        },
        method: "POST",
        signal,
      });
    } catch (error) {
      if (signal.aborted) throw error;
      throw new VoiceError("connection", "network", requestId);
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw voiceErrorFromResponse(response, "connection", requestId);
    }
    const contentType = response.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase();
    if (contentType !== "application/sdp") {
      await response.body?.cancel();
      throw new VoiceError("connection", "invalid-response", requestId);
    }
    return response;
  }

  #installDataChannelListeners(
    dataChannel: RTCDataChannel,
    connectionEpoch: number,
  ): void {
    const messageListener = (event: MessageEvent<unknown>) => {
      if (this.#activeEpoch === connectionEpoch) {
        this.#handleMessage(event, connectionEpoch);
      }
    };
    const unexpectedCloseListener = () => {
      if (this.#activeEpoch === connectionEpoch && this.#connected) {
        this.#handleConnectionFailure("network", "connection");
      }
    };
    this.#messageListener = messageListener;
    this.#unexpectedCloseListener = unexpectedCloseListener;
    dataChannel.addEventListener("message", messageListener);
    dataChannel.addEventListener("close", unexpectedCloseListener);
    dataChannel.addEventListener("error", unexpectedCloseListener);
  }

  #initializeMeter(audioContext: AudioContext, stream: MediaStream): void {
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    audioContext.createMediaStreamSource(stream).connect(analyser);
    this.#analyser = analyser;
    this.#meterSamples = new Uint8Array(analyser.fftSize);
  }

  #startMeter(): void {
    if (this.#meterFrame !== null || !this.#analyser || !this.#meterSamples) {
      return;
    }
    const sample = () => {
      if (
        !this.#microphoneTrack?.enabled ||
        !this.#analyser ||
        !this.#meterSamples
      ) {
        this.#stopMeter();
        return;
      }
      this.#analyser.getByteTimeDomainData(this.#meterSamples);
      let squaredTotal = 0;
      for (const value of this.#meterSamples) {
        const normalized = (value - 128) / 128;
        squaredTotal += normalized * normalized;
      }
      const level =
        Math.round(
          Math.min(1, Math.sqrt(squaredTotal / this.#meterSamples.length)) *
            100,
        ) / 100;
      if (level !== this.#meterLevel) {
        this.#meterLevel = level;
        this.#emit({ level, type: "microphone-level" });
      }
      this.#meterHasSample = true;
      this.#meterFrame = this.#dependencies.requestAnimationFrame(sample);
    };
    this.#meterFrame = this.#dependencies.requestAnimationFrame(sample);
  }

  #stopMeter(): void {
    if (this.#meterFrame === null) return;
    this.#dependencies.cancelAnimationFrame(this.#meterFrame);
    this.#meterFrame = null;
    this.#meterLevel = 0;
    if (this.#meterHasSample) {
      this.#emit({ level: 0, type: "microphone-level" });
      this.#meterHasSample = false;
    }
  }

  #releaseMeterResources(): void {
    this.#stopMeter();
    this.#analyser = null;
    this.#meterSamples = null;
    const audioContext = this.#audioContext;
    this.#audioContext = null;
    if (audioContext) {
      try {
        void audioContext.close().catch(() => undefined);
      } catch {
        // Input metering cleanup is best-effort.
      }
    }
  }

  #startTranscription(itemId: string): void {
    if (!this.#transcriptionTimings.has(itemId)) {
      this.#transcriptionTimings.set(itemId, {
        requestId:
          this.#dependencies.createRequestId?.() ?? createVoiceRequestId(),
        startedAt: this.#now(),
      });
    }
  }

  #finishTranscription(itemId: string, errorCode?: VoiceErrorCode): void {
    const timing = this.#transcriptionTimings.get(itemId);
    if (!timing) return;
    this.#transcriptionTimings.delete(itemId);
    this.#reportDiagnostic(
      "transcription",
      timing.requestId,
      timing.startedAt,
      errorCode,
    );
  }

  #now(): number {
    return this.#dependencies.now?.() ?? performance.now();
  }

  #reportDiagnostic(
    operation: VoiceOperation,
    requestId: string,
    startedAt: number,
    errorCode?: VoiceErrorCode,
  ): void {
    this.#dependencies.reportDiagnostic?.({
      durationMs: voiceDurationMs(startedAt, this.#now()),
      ...(errorCode === undefined ? {} : { errorCode }),
      operation,
      outcome: voiceDiagnosticOutcome(errorCode),
      requestId,
      stage: "browser",
    });
  }

  #releaseResources(): void {
    for (const preparationRequestId of this.#pendingPreparations.keys()) {
      this.#settlePreparation(preparationRequestId, "interrupted");
    }
    for (const timing of this.#transcriptionTimings.values()) {
      this.#reportDiagnostic(
        "transcription",
        timing.requestId,
        timing.startedAt,
        "request-aborted",
      );
    }
    for (const timing of [
      ...this.#pendingSpeechRequests.values(),
      ...this.#speechTimings.values(),
    ]) {
      this.#reportDiagnostic(
        "speech",
        timing.requestId,
        timing.startedAt,
        "request-aborted",
      );
    }
    this.#transcriptionTimings.clear();
    this.#activeResponseIds.clear();
    this.#cancelledCanonicalResponseIds.clear();
    this.#cancelledPreparationRequestIds.clear();
    this.#cancelledSpeechRequestIds.clear();
    this.#completedResponseCancelEventIds.clear();
    this.#pendingClientEvents.clear();
    this.#pendingPreparations.clear();
    this.#pendingSpeechRequests.clear();
    this.#preparationResponseIds.clear();
    this.#responseQueue.length = 0;
    this.#speechTimings.clear();
    this.#authorizedResponseIds.clear();
    this.#canonicalResponseIds.clear();
    this.#responseCreateEventId = null;
    this.#responseTerminalSequence = 0;
    this.#speakingResponseId = null;
    this.#waitingForResponseTerminal = false;
    this.#activeEpoch = null;
    this.#connected = false;
    this.#connectedAt = null;
    this.#connectionRequestId = null;
    this.#abortController?.abort();
    this.#abortController = null;
    this.#releaseMeterResources();

    if (this.#dataChannel && this.#messageListener) {
      this.#dataChannel.removeEventListener("message", this.#messageListener);
    }
    if (this.#dataChannel && this.#unexpectedCloseListener) {
      this.#dataChannel.removeEventListener(
        "close",
        this.#unexpectedCloseListener,
      );
      this.#dataChannel.removeEventListener(
        "error",
        this.#unexpectedCloseListener,
      );
    }
    this.#messageListener = null;
    this.#unexpectedCloseListener = null;
    this.#dataChannel?.close();
    this.#dataChannel = null;

    if (this.#peerConnection) {
      this.#peerConnection.onconnectionstatechange = null;
      this.#peerConnection.ontrack = null;
      this.#peerConnection.close();
      this.#peerConnection = null;
    }
    if (this.#remoteAudio) {
      this.#remoteAudio.pause();
      this.#remoteAudio.srcObject = null;
      this.#remoteAudio = null;
    }
    for (const stream of this.#remoteStreams) stopStream(stream);
    this.#remoteStreams.clear();
    if (this.#mediaStream) {
      if (this.#microphoneTrack) this.#microphoneTrack.enabled = false;
      stopStream(this.#mediaStream);
      this.#mediaStream = null;
    }
    this.#microphoneTrack = null;
  }

  #waitForDataChannelOpen(
    dataChannel: RTCDataChannel,
    signal: AbortSignal,
    requestId: string,
  ): Promise<void> {
    if (signal.aborted) return Promise.reject(signal.reason);
    if (dataChannel.readyState === "open") return Promise.resolve();
    if (
      dataChannel.readyState === "closing" ||
      dataChannel.readyState === "closed"
    ) {
      return Promise.reject(new VoiceError("connection", "network", requestId));
    }
    return new Promise((resolve, reject) => {
      const handleResult = (event: Event) => {
        dataChannel.removeEventListener("open", handleResult);
        dataChannel.removeEventListener("error", handleResult);
        dataChannel.removeEventListener("close", handleResult);
        signal.removeEventListener("abort", handleResult);
        if (event.type === "open") resolve();
        else if (event.type === "abort") {
          reject(new DOMException("Connection aborted", "AbortError"));
        } else reject(new VoiceError("connection", "network", requestId));
      };
      dataChannel.addEventListener("open", handleResult);
      dataChannel.addEventListener("error", handleResult);
      dataChannel.addEventListener("close", handleResult);
      signal.addEventListener("abort", handleResult, { once: true });
    });
  }
}
