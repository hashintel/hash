import { VoiceError, type VoiceErrorCode } from "../../../voice-diagnostics";

import type { CanonicalSpeechSegment } from "./canonical-speech";
import type { OpenAIRealtimeSessionEvent } from "./openai-realtime-session";
import type {
  RealtimeBridgeErrorCode,
  RealtimeBrunchBridgeEvent,
  VoiceSubmissionSettlement,
} from "./realtime-brunch-bridge";
import type {
  PetrinautAiComposerControlContext,
  PetrinautAiVoiceModeContext,
} from "@hashintel/petrinaut/ui";

export type VoiceConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "error";
export type VoiceInputState = "listening" | "paused" | "submitting";
export type VoiceOutputState =
  | "cancelling"
  | "idle"
  | "waiting-for-tool"
  | "speaking"
  | "interrupted";
export type VoiceAnswerDelivery = "none" | "pending" | "delivered" | "failed";
export type VoiceInputNotice = "none" | "not-heard" | "too-long";

export interface VoiceTurnSnapshot {
  readonly canReadFullResponse: boolean;
  readonly canRepeatQuestion: boolean;
  readonly canTakeTurn: boolean;
  readonly canReviseLastAnswer: boolean;
  readonly connection: VoiceConnectionState;
  readonly currentQuestion: string;
  readonly errorCode: RealtimeBridgeErrorCode | VoiceErrorCode | null;
  readonly errorMessage: string;
  readonly errorRequestId: string;
  readonly input: VoiceInputState;
  readonly inputNotice: VoiceInputNotice;
  readonly lastAnswerDelivery: VoiceAnswerDelivery;
  readonly lastCommittedText: string;
  readonly microphoneEnabled: boolean;
  readonly microphoneLevel: number;
  readonly output: VoiceOutputState;
  readonly partialText: string;
}

export interface VoiceLatencyEvent {
  readonly correlationId: string;
  readonly elapsedMs: number;
  readonly name:
    | "submission-admitted"
    | "submission-settled"
    | "first-canonical-text"
    | "first-tts-request"
    | "first-tts-audio"
    | "question-visible"
    | "question-spoken-started"
    | "question-spoken"
    | "answer-ready";
}

interface RealtimeSession {
  cancelOutput(): Promise<void>;
  connect(): Promise<number>;
  disconnect(): Promise<void>;
  setMicrophoneEnabled(enabled: boolean): void;
  speakCanonical(segments: CanonicalSpeechSegment[]): void;
  subscribe(listener: (event: OpenAIRealtimeSessionEvent) => void): () => void;
}

interface RealtimeBridge {
  cancelPendingSpeech(): void;
  completeTurnHandoff(): void;
  start(connectionEpoch: number): void;
  stop(): void;
  subscribe(listener: (event: RealtimeBrunchBridgeEvent) => void): () => void;
  updateChat(update: ChatUpdate): void;
}

type ComposerSubmitTextInput = Parameters<
  PetrinautAiComposerControlContext["submitText"]
>[0];

interface SubmitTextInput extends Pick<ComposerSubmitTextInput, "text"> {
  readonly target: "message";
}

interface VoiceTurnControllerDependencies {
  readonly bridge: RealtimeBridge;
  readonly now?: () => number;
  readonly onLatencyEvent?: (event: VoiceLatencyEvent) => void;
  readonly session: RealtimeSession;
  readonly submitText: (input: SubmitTextInput) => Promise<unknown>;
}

interface ChatUpdate {
  readonly canAcceptInterviewAnswer: boolean;
  readonly canonicalSegments: CanonicalSpeechSegment[];
  readonly questionSegment?: CanonicalSpeechSegment;
  readonly settlements?: readonly VoiceSubmissionSettlement[];
  readonly status: PetrinautAiVoiceModeContext["status"];
}

type SnapshotListener = (snapshot: VoiceTurnSnapshot) => void;

const initialSnapshot: VoiceTurnSnapshot = {
  canReadFullResponse: false,
  canRepeatQuestion: false,
  canTakeTurn: false,
  canReviseLastAnswer: false,
  connection: "idle",
  currentQuestion: "",
  errorCode: null,
  errorMessage: "",
  errorRequestId: "",
  input: "paused",
  inputNotice: "none",
  lastAnswerDelivery: "none",
  lastCommittedText: "",
  microphoneEnabled: false,
  microphoneLevel: 0,
  output: "idle",
  partialText: "",
};

export class VoiceTurnController {
  readonly #bridge: RealtimeBridge;
  readonly #listeners = new Set<SnapshotListener>();
  readonly #now: () => number;
  readonly #onLatencyEvent: ((event: VoiceLatencyEvent) => void) | undefined;
  readonly #session: RealtimeSession;
  readonly #submitText: (input: SubmitTextInput) => Promise<unknown>;
  #activeEpoch: number | null = null;
  #activeSpeechOutputEnded = false;
  #activeSpeechResponseId: string | null = null;
  #activeSpeechResponseTerminal = false;
  #answerFinalizedAt: number | null = null;
  #answeredQuestionId: string | null = null;
  #bridgeStarted = false;
  #currentQuestionId: string | null = null;
  #generation = 0;
  #inputStateOnResume: Exclude<VoiceInputState, "paused"> | null = null;
  #inputTurnPending = false;
  #latencyCorrelationId: string | null = null;
  #lastResponseQuestion: CanonicalSpeechSegment | null = null;
  #lastResponseSegments: CanonicalSpeechSegment[] = [];
  #outputCancellationPromise: Promise<void> | null = null;
  #pauseRequested = false;
  readonly #recordedLatencyEvents = new Set<string>();
  #snapshot = initialSnapshot;
  #submittingQuestionId: string | null = null;
  #takingTurnPromise: Promise<void> | null = null;
  #teardownPromise: Promise<void> | null = null;
  #transcriptItemId: string | null = null;
  #transcriptKey: string | null = null;
  #ttsSpeechRequestId: string | null = null;

  public constructor({
    bridge,
    now = () => performance.now(),
    onLatencyEvent,
    session,
    submitText,
  }: VoiceTurnControllerDependencies) {
    this.#bridge = bridge;
    this.#now = now;
    this.#onLatencyEvent = onLatencyEvent;
    this.#session = session;
    this.#submitText = submitText;
    session.subscribe((event) => this.#handleSessionEvent(event));
    bridge.subscribe((event) => this.#handleBridgeEvent(event));
  }

  public getSnapshot(): VoiceTurnSnapshot {
    return this.#snapshot;
  }

  public subscribe(listener: SnapshotListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  public async start(): Promise<void> {
    if (
      this.#snapshot.connection === "connecting" ||
      this.#snapshot.connection === "connected"
    ) {
      return;
    }
    const generation = ++this.#generation;
    const teardownPromise = this.#teardownPromise;
    if (teardownPromise) {
      try {
        await teardownPromise;
      } catch (error) {
        if (generation !== this.#generation) return;
        const voiceError =
          error instanceof VoiceError
            ? error
            : new VoiceError("connection", "network", "");
        this.#setError(
          voiceError.message,
          voiceError.code,
          voiceError.requestId,
        );
        return;
      }
      if (generation !== this.#generation) return;
    }

    this.#inputStateOnResume = null;
    this.#inputTurnPending = false;
    this.#outputCancellationPromise = null;
    this.#pauseRequested = false;
    this.#bridgeStarted = false;
    this.#activeSpeechOutputEnded = false;
    this.#activeSpeechResponseId = null;
    this.#activeSpeechResponseTerminal = false;
    this.#update({
      connection: "connecting",
      errorCode: null,
      errorMessage: "",
      errorRequestId: "",
      input: "paused",
      output: "idle",
      partialText: "",
    });
    try {
      const connectionEpoch = await this.#session.connect();
      if (generation !== this.#generation) return;
      this.#activeEpoch = connectionEpoch;
      const microphoneEnabled = !this.#isPauseRequested();
      this.#session.setMicrophoneEnabled(microphoneEnabled);
      this.#update({
        connection: "connected",
        input: microphoneEnabled ? "listening" : "paused",
        microphoneEnabled,
      });
      if (microphoneEnabled) {
        this.#bridge.start(connectionEpoch);
        this.#bridgeStarted = true;
      }
    } catch (error) {
      if (generation !== this.#generation) return;
      const voiceError =
        error instanceof VoiceError
          ? error
          : new VoiceError("connection", "invalid-response", "");
      this.#setError(voiceError.message, voiceError.code, voiceError.requestId);
    }
  }

  public async end(): Promise<void> {
    ++this.#generation;
    this.#activeEpoch = null;
    this.#activeSpeechOutputEnded = false;
    this.#activeSpeechResponseId = null;
    this.#activeSpeechResponseTerminal = false;
    this.#answerFinalizedAt = null;
    this.#answeredQuestionId = null;
    this.#bridgeStarted = false;
    this.#currentQuestionId = null;
    this.#inputStateOnResume = null;
    this.#inputTurnPending = false;
    this.#latencyCorrelationId = null;
    this.#lastResponseQuestion = null;
    this.#lastResponseSegments = [];
    this.#outputCancellationPromise = null;
    this.#recordedLatencyEvents.clear();
    this.#submittingQuestionId = null;
    this.#takingTurnPromise = null;
    this.#pauseRequested = false;
    this.#transcriptItemId = null;
    this.#transcriptKey = null;
    this.#ttsSpeechRequestId = null;
    this.#bridge.stop();
    this.#session.setMicrophoneEnabled(false);
    const teardownPromise = this.#teardownPromise ?? this.#session.disconnect();
    this.#teardownPromise = teardownPromise;
    this.#update({ ...initialSnapshot });
    try {
      await teardownPromise;
    } finally {
      if (this.#teardownPromise === teardownPromise) {
        this.#teardownPromise = null;
      }
    }
  }

  public async reconnect(): Promise<void> {
    const pendingQuestion =
      this.#currentQuestionId !== null &&
      this.#answeredQuestionId !== this.#currentQuestionId &&
      this.#snapshot.currentQuestion
        ? {
            id: this.#currentQuestionId,
            text: this.#snapshot.currentQuestion,
          }
        : null;
    await this.end();
    if (pendingQuestion) {
      this.#currentQuestionId = pendingQuestion.id;
      this.#update({ currentQuestion: pendingQuestion.text });
    }
    await this.start();
  }

  public pause(): void {
    if (this.#snapshot.connection === "connecting") {
      this.#pauseRequested = true;
      return;
    }
    if (
      this.#snapshot.connection !== "connected" ||
      this.#snapshot.input === "paused"
    ) {
      return;
    }
    this.#inputStateOnResume = this.#snapshot.input;
    this.#pauseRequested = true;
    const output = this.#snapshot.output === "idle" ? "idle" : "interrupted";
    void this.#cancelOutput();
    this.#session.setMicrophoneEnabled(false);
    this.#update({
      input: "paused",
      microphoneEnabled: false,
      microphoneLevel: 0,
      output,
    });
  }

  /**
   * Stops or restarts capture mid-session. Unlike {@link pause} the turn is
   * left alone: the bridge stays up and anything the assistant is saying plays
   * out, so unmuting drops the user straight back into the conversation.
   */
  public setMicrophoneMuted(muted: boolean): void {
    if (
      this.#snapshot.connection !== "connected" ||
      this.#snapshot.input === "paused" ||
      this.#snapshot.microphoneEnabled === !muted
    ) {
      return;
    }
    if (
      this.#takingTurnPromise === null &&
      this.#outputCancellationPromise === null &&
      this.#activeSpeechResponseId === null &&
      (this.#snapshot.output === "idle" ||
        this.#snapshot.output === "interrupted")
    ) {
      this.#session.setMicrophoneEnabled(!muted);
    }
    this.#update({ microphoneEnabled: !muted, microphoneLevel: 0 });
  }

  public async resume(): Promise<void> {
    if (
      this.#snapshot.connection !== "connected" ||
      this.#snapshot.input !== "paused"
    ) {
      return;
    }
    const generation = this.#generation;
    while (this.#outputCancellationPromise || this.#takingTurnPromise) {
      try {
        await (this.#outputCancellationPromise ?? this.#takingTurnPromise);
      } catch (error) {
        if (generation !== this.#generation) return;
        const voiceError =
          error instanceof VoiceError
            ? error
            : new VoiceError("speech", "network", "");
        this.#setError(
          voiceError.message,
          voiceError.code,
          voiceError.requestId,
        );
        return;
      }
      const snapshotAfterCancellation = this.getSnapshot();
      if (
        generation !== this.#generation ||
        snapshotAfterCancellation.connection !== "connected" ||
        snapshotAfterCancellation.input !== "paused"
      ) {
        return;
      }
    }
    const input = this.#inputStateOnResume ?? "listening";
    this.#inputStateOnResume = null;
    this.#pauseRequested = false;
    this.#session.setMicrophoneEnabled(true);
    if (!this.#bridgeStarted && this.#activeEpoch !== null) {
      try {
        this.#bridge.start(this.#activeEpoch);
        this.#bridgeStarted = true;
      } catch (error) {
        const voiceError =
          error instanceof VoiceError
            ? error
            : new VoiceError("connection", "invalid-response", "");
        this.#setError(
          voiceError.message,
          voiceError.code,
          voiceError.requestId,
        );
        return;
      }
    }
    this.#update({ input, microphoneEnabled: true });
  }

  public async submitCorrection(correction: string): Promise<boolean> {
    const correctedText = correction.trim();
    const previousText = this.#snapshot.lastCommittedText;
    if (!correctedText || !this.#canReviseLastAnswer()) return false;
    const generation = this.#generation;
    this.#update({ input: "submitting", lastAnswerDelivery: "pending" });
    try {
      await this.#submitText({
        target: "message",
        text: `Correction to my previous voice answer "${previousText}": ${correctedText}`,
      });
      if (generation !== this.#generation) return false;
      this.#update({
        input: "listening",
        lastAnswerDelivery: "delivered",
        lastCommittedText: correctedText,
      });
      return true;
    } catch {
      if (generation === this.#generation) {
        this.#update({
          input: "paused",
          lastAnswerDelivery: "failed",
        });
        this.#setError(
          "The interview could not accept that correction. Use the composer to retry.",
        );
      }
      return false;
    }
  }

  public readFullResponse(): void {
    if (!this.#snapshot.canReadFullResponse) return;
    this.#update({ output: "waiting-for-tool" });
    this.#session.speakCanonical([...this.#lastResponseSegments]);
  }

  public repeatQuestion(): void {
    if (!this.#snapshot.canRepeatQuestion || !this.#lastResponseQuestion)
      return;
    this.#update({ output: "waiting-for-tool" });
    this.#session.speakCanonical([this.#lastResponseQuestion]);
  }

  /**
   * Hands the turn to the user only after provider cancellation has cleared
   * input and output and the active response has reached a terminal state.
   */
  public takeTurn(): Promise<void> {
    if (this.#takingTurnPromise) return this.#takingTurnPromise;
    if (!this.#snapshot.canTakeTurn) return Promise.resolve();

    const generation = this.#generation;
    this.#bridge.cancelPendingSpeech();
    this.#session.setMicrophoneEnabled(false);
    this.#inputTurnPending = false;
    this.#transcriptItemId = null;
    this.#transcriptKey = null;
    this.#update({ output: "cancelling", partialText: "" });

    const takingTurnPromise = this.#session
      .cancelOutput()
      .then(() => {
        if (
          generation !== this.#generation ||
          this.#snapshot.connection !== "connected" ||
          this.#snapshot.input === "paused"
        ) {
          return;
        }
        this.#activeSpeechOutputEnded = false;
        this.#activeSpeechResponseId = null;
        this.#activeSpeechResponseTerminal = false;
        this.#bridge.completeTurnHandoff();
        this.#session.setMicrophoneEnabled(this.#snapshot.microphoneEnabled);
        this.#update({ output: "interrupted" });
      })
      .catch((error: unknown) => {
        if (generation !== this.#generation) return;
        const voiceError =
          error instanceof VoiceError
            ? error
            : new VoiceError("speech", "network", "");
        this.#setError(
          voiceError.message,
          voiceError.code,
          voiceError.requestId,
        );
      })
      .finally(() => {
        if (this.#takingTurnPromise === takingTurnPromise) {
          this.#takingTurnPromise = null;
        }
      });
    this.#takingTurnPromise = takingTurnPromise;
    this.#update({});
    return takingTurnPromise;
  }

  public updateChat(update: ChatUpdate): void {
    const question = update.questionSegment;
    if (question && question.id !== this.#currentQuestionId) {
      this.#currentQuestionId = question.id;
      this.#update({ currentQuestion: question.text });
      this.#recordLatency("question-visible", question.id);
    }
    this.#bridge.updateChat(update);
    if (this.#snapshot.input === "paused") {
      void this.#cancelOutput();
    }
  }

  #handleBridgeEvent(event: RealtimeBrunchBridgeEvent): void {
    if (this.#snapshot.connection !== "connected") return;
    if (event.type === "error") {
      this.#setError(event.message, event.code);
      return;
    }
    if (event.type === "submission-started") {
      const paused = this.#snapshot.input === "paused";
      if (paused) {
        this.#inputStateOnResume = "submitting";
      }
      this.#inputTurnPending = false;
      this.#answerFinalizedAt = this.#now();
      this.#latencyCorrelationId = event.deliveryId;
      this.#recordedLatencyEvents.clear();
      this.#submittingQuestionId = this.#currentQuestionId;
      this.#transcriptItemId = null;
      this.#transcriptKey = null;
      this.#ttsSpeechRequestId = null;
      this.#session.setMicrophoneEnabled(false);
      this.#update({
        input: paused ? "paused" : "submitting",
        inputNotice: "none",
        lastAnswerDelivery: "pending",
        lastCommittedText: event.answer,
        output: "waiting-for-tool",
        partialText: "",
      });
      return;
    }
    if (event.type === "transcript-rejected") {
      if (event.reason === "duplicate" || event.reason === "unavailable") {
        return;
      }
      this.#transcriptItemId = null;
      this.#transcriptKey = null;
      this.#update({
        inputNotice: event.reason === "over-limit" ? "too-long" : "not-heard",
        partialText: "",
      });
      return;
    }
    if (event.type === "submission-accepted") {
      this.#answeredQuestionId = this.#submittingQuestionId;
      this.#submittingQuestionId = null;
      this.#update({ lastAnswerDelivery: "delivered" });
      return;
    }
    if (event.type === "submission-admitted") {
      this.#recordLatency("submission-admitted", event.deliveryId);
      return;
    }
    if (event.type === "canonical-text-ready") {
      this.#recordLatency("first-canonical-text", event.deliveryId);
      return;
    }
    if (event.type === "submission-settled") {
      this.#recordLatency("submission-settled", event.deliveryId);
      return;
    }
    if (event.type === "submission-stopped") {
      // Brunch was stopped before it replied: nothing to speak, and the
      // interviewer is free to listen again.
      const pausedWhileStopped = this.#snapshot.input === "paused";
      if (pausedWhileStopped) {
        this.#inputStateOnResume = "listening";
      }
      this.#update({
        input: pausedWhileStopped ? "paused" : "listening",
        output: "idle",
      });
      return;
    }
    this.#lastResponseQuestion = event.questionSegment ?? null;
    this.#lastResponseSegments = [...event.segments];
    const responseEnd = event.segments.at(-1);
    if (event.speechCancelled) {
      const paused = this.#snapshot.input === "paused";
      if (paused) {
        this.#inputStateOnResume = "listening";
      }
      this.#update({
        input: paused ? "paused" : "listening",
        output: "interrupted",
      });
      if (responseEnd) this.#recordLatency("answer-ready", responseEnd.id);
      return;
    }
    const paused = this.#snapshot.input === "paused";
    if (paused) {
      this.#inputStateOnResume = "listening";
      void this.#cancelOutput();
    }
    this.#update({
      input: paused ? "paused" : "listening",
      output: paused ? "interrupted" : "waiting-for-tool",
    });
    if (responseEnd) this.#recordLatency("answer-ready", responseEnd.id);
  }

  #handleSessionEvent(event: OpenAIRealtimeSessionEvent): void {
    if (event.type === "microphone-level") {
      if (this.#snapshot.microphoneEnabled) {
        this.#update({ microphoneLevel: event.level });
      }
      return;
    }
    if (event.type === "error") {
      this.#setError(event.message, event.code, event.requestId);
      return;
    }
    if (
      "connectionEpoch" in event &&
      event.connectionEpoch !== this.#activeEpoch
    ) {
      return;
    }
    if (event.type === "canonical-speech-requested") {
      this.#session.setMicrophoneEnabled(false);
      this.#inputTurnPending = false;
      this.#transcriptItemId = null;
      this.#transcriptKey = null;
      this.#update({ partialText: "" });
      if (
        this.#latencyCorrelationId !== null &&
        this.#ttsSpeechRequestId === null
      ) {
        this.#ttsSpeechRequestId = event.speechRequestId;
        this.#recordLatency("first-tts-request", this.#latencyCorrelationId);
      }
      return;
    }
    if (event.type === "output-started") {
      this.#activeSpeechOutputEnded = false;
      this.#activeSpeechResponseId = event.responseId;
      this.#activeSpeechResponseTerminal = false;
      this.#inputTurnPending = false;
      this.#transcriptItemId = null;
      this.#transcriptKey = null;
      if (this.#snapshot.input === "paused") {
        void this.#cancelOutput();
        this.#update({ output: "interrupted", partialText: "" });
        return;
      }
      this.#update({ output: "speaking", partialText: "" });
      if (
        this.#latencyCorrelationId !== null &&
        event.speechRequestId === this.#ttsSpeechRequestId
      ) {
        this.#recordLatency("first-tts-audio", this.#latencyCorrelationId);
      }
      if (this.#currentQuestionId) {
        this.#recordLatency("question-spoken-started", this.#currentQuestionId);
      }
      return;
    }
    if (event.type === "output-stopped") {
      if (event.responseId !== this.#activeSpeechResponseId) return;
      this.#activeSpeechOutputEnded = true;
      if (this.#activeSpeechResponseTerminal) {
        this.#clearSettledSpeech();
      }
      this.#update({
        output: this.#takingTurnPromise ? "cancelling" : "idle",
      });
      if (this.#currentQuestionId) {
        this.#recordLatency("question-spoken", this.#currentQuestionId);
      }
      return;
    }
    if (event.type === "output-interrupted") {
      if (event.responseId !== this.#activeSpeechResponseId) return;
      this.#activeSpeechOutputEnded = true;
      if (this.#activeSpeechResponseTerminal) {
        this.#clearSettledSpeech();
      }
      this.#update({
        output: this.#takingTurnPromise ? "cancelling" : "interrupted",
      });
      return;
    }
    if (event.type === "input-speech-started") {
      if (
        this.#takingTurnPromise ||
        this.#snapshot.output === "speaking" ||
        this.#snapshot.output === "cancelling"
      ) {
        return;
      }
      this.#inputTurnPending = true;
      this.#transcriptItemId = event.itemId;
      this.#transcriptKey = null;
      this.#update({ inputNotice: "none", partialText: "" });
      return;
    }
    if (event.type === "response-terminal") {
      if (event.responseId === this.#activeSpeechResponseId) {
        if (this.#activeSpeechOutputEnded) {
          this.#clearSettledSpeech();
        } else {
          this.#activeSpeechResponseTerminal = true;
        }
        this.#update({});
      }
      return;
    }
    if (event.type === "input-speech-stopped") {
      return;
    }

    const key = `${event.key.connectionEpoch}:${event.key.itemId}:${event.key.contentIndex}`;
    if (event.key.connectionEpoch !== this.#activeEpoch) return;
    if (event.key.itemId !== this.#transcriptItemId) return;
    if (event.type === "transcription-failed") {
      this.#inputTurnPending = false;
      this.#transcriptItemId = null;
      this.#transcriptKey = null;
      this.#update({ partialText: "" });
      return;
    }
    if (this.#transcriptKey !== null && this.#transcriptKey !== key) return;
    this.#transcriptKey = key;
    if (event.type === "partial") {
      this.#update({
        partialText: `${this.#snapshot.partialText}${event.text}`,
      });
      return;
    }
    this.#inputTurnPending = false;
    this.#transcriptItemId = null;
    this.#transcriptKey = null;
    this.#update({
      partialText: event.text.trim() || this.#snapshot.partialText,
    });
  }

  #setError(
    message: string,
    code: VoiceTurnSnapshot["errorCode"] = null,
    requestId = "",
  ): void {
    ++this.#generation;
    this.#activeEpoch = null;
    this.#activeSpeechOutputEnded = false;
    this.#activeSpeechResponseId = null;
    this.#activeSpeechResponseTerminal = false;
    this.#inputStateOnResume = null;
    this.#inputTurnPending = false;
    this.#latencyCorrelationId = null;
    this.#outputCancellationPromise = null;
    this.#recordedLatencyEvents.clear();
    this.#takingTurnPromise = null;
    this.#bridgeStarted = false;
    this.#transcriptItemId = null;
    this.#transcriptKey = null;
    this.#ttsSpeechRequestId = null;
    this.#bridge.stop();
    this.#session.setMicrophoneEnabled(false);
    void this.#session.disconnect();
    this.#update({
      connection: "error",
      errorCode: code,
      errorMessage: message,
      errorRequestId: requestId,
      input: "paused",
      lastAnswerDelivery:
        this.#snapshot.lastAnswerDelivery === "pending"
          ? "failed"
          : this.#snapshot.lastAnswerDelivery,
      microphoneEnabled: false,
      microphoneLevel: 0,
      output: "idle",
      partialText: "",
    });
  }

  #cancelOutput(): Promise<void> {
    const cancellationPromise = this.#session.cancelOutput();
    this.#outputCancellationPromise = cancellationPromise;
    void cancellationPromise.then(
      () => {
        if (this.#outputCancellationPromise === cancellationPromise) {
          this.#outputCancellationPromise = null;
        }
      },
      () => {
        if (this.#outputCancellationPromise === cancellationPromise) {
          this.#outputCancellationPromise = null;
        }
      },
    );
    return cancellationPromise;
  }

  #clearSettledSpeech(): void {
    this.#activeSpeechOutputEnded = false;
    this.#activeSpeechResponseId = null;
    this.#activeSpeechResponseTerminal = false;
    if (
      this.#snapshot.connection === "connected" &&
      this.#snapshot.input === "listening" &&
      this.#takingTurnPromise === null
    ) {
      this.#session.setMicrophoneEnabled(this.#snapshot.microphoneEnabled);
    }
  }

  #recordLatency(name: VoiceLatencyEvent["name"], correlationId: string): void {
    if (this.#answerFinalizedAt === null) return;
    const eventKey = `${correlationId}:${name}`;
    if (this.#recordedLatencyEvents.has(eventKey)) return;
    this.#recordedLatencyEvents.add(eventKey);
    this.#onLatencyEvent?.({
      correlationId,
      elapsedMs: Math.max(0, this.#now() - this.#answerFinalizedAt),
      name,
    });
  }

  #canReviseLastAnswer(snapshot = this.#snapshot): boolean {
    return (
      snapshot.connection === "connected" &&
      snapshot.input === "listening" &&
      snapshot.lastAnswerDelivery === "delivered" &&
      Boolean(snapshot.lastCommittedText) &&
      this.#answeredQuestionId === this.#currentQuestionId
    );
  }

  #canReplay(snapshot: VoiceTurnSnapshot): boolean {
    return (
      snapshot.connection === "connected" &&
      snapshot.input === "listening" &&
      !this.#inputTurnPending &&
      this.#activeSpeechResponseId === null &&
      (snapshot.output === "idle" || snapshot.output === "interrupted")
    );
  }

  #canTakeTurn(snapshot: VoiceTurnSnapshot): boolean {
    return (
      snapshot.connection === "connected" &&
      snapshot.input !== "paused" &&
      (snapshot.output === "waiting-for-tool" ||
        snapshot.output === "speaking") &&
      this.#currentQuestionId !== null &&
      this.#currentQuestionId !== this.#answeredQuestionId &&
      this.#currentQuestionId !== this.#submittingQuestionId &&
      Boolean(snapshot.currentQuestion) &&
      this.#takingTurnPromise === null
    );
  }

  #isPauseRequested(): boolean {
    return this.#pauseRequested;
  }

  #update(update: Partial<VoiceTurnSnapshot>): void {
    const snapshot = { ...this.#snapshot, ...update };
    const canReplay = this.#canReplay(snapshot);
    this.#snapshot = {
      ...snapshot,
      canReadFullResponse: canReplay && this.#lastResponseSegments.length > 0,
      canRepeatQuestion: canReplay && this.#lastResponseQuestion !== null,
      canTakeTurn: this.#canTakeTurn(snapshot),
      canReviseLastAnswer: this.#canReviseLastAnswer(snapshot),
    };
    for (const listener of this.#listeners) listener(this.#snapshot);
  }
}
