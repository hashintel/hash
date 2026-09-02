import { VoiceError, type VoiceErrorCode } from "../../../voice-diagnostics";

import type {
  CanonicalSpeechSegment,
  InterviewSpeechSource,
} from "./canonical-speech";
import type { OpenAIRealtimeSessionEvent } from "./openai-realtime-session";
import type {
  RealtimeBridgeErrorCode,
  RealtimeBrunchBridgeEvent,
} from "./realtime-brunch-bridge";

export type VoiceConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "error";
export type VoiceInputState = "listening" | "paused" | "submitting";
export type VoiceOutputState =
  | "idle"
  | "waiting-for-tool"
  | "speaking"
  | "interrupted";
export type VoiceAnswerDelivery = "none" | "pending" | "delivered" | "failed";

export interface VoiceTurnSnapshot {
  readonly canReadFullResponse: boolean;
  readonly canRepeatQuestion: boolean;
  readonly canReviseLastAnswer: boolean;
  readonly connection: VoiceConnectionState;
  readonly currentQuestion: string;
  readonly errorCode: RealtimeBridgeErrorCode | VoiceErrorCode | null;
  readonly errorMessage: string;
  readonly errorRequestId: string;
  readonly input: VoiceInputState;
  readonly lastAnswerDelivery: VoiceAnswerDelivery;
  readonly lastCommittedText: string;
  readonly microphoneEnabled: boolean;
  readonly microphoneLevel: number;
  readonly output: VoiceOutputState;
  readonly partialText: string;
}

export interface VoiceLatencyEvent {
  readonly elapsedMs: number;
  readonly name:
    | "question-visible"
    | "question-spoken-started"
    | "question-spoken"
    | "answer-ready";
  readonly questionId: string;
}

type ChatStatus = "ready" | "submitted" | "streaming" | "error";

interface RealtimeSession {
  cancelOutput(): void;
  connect(): Promise<number>;
  disconnect(): Promise<void>;
  setMicrophoneEnabled(enabled: boolean): void;
  speakCanonical(segments: CanonicalSpeechSegment[]): void;
  subscribe(listener: (event: OpenAIRealtimeSessionEvent) => void): () => void;
}

interface RealtimeBridge {
  cancelPendingSpeech(): void;
  start(connectionEpoch: number): void;
  stop(): void;
  subscribe(listener: (event: RealtimeBrunchBridgeEvent) => void): () => void;
  updateChat(update: ChatUpdate): void;
}

interface SubmitTextInput {
  readonly target: "message";
  readonly text: string;
}

interface VoiceTurnControllerDependencies {
  readonly bridge: RealtimeBridge;
  readonly now?: () => number;
  readonly onLatencyEvent?: (event: VoiceLatencyEvent) => void;
  readonly session: RealtimeSession;
  readonly submitText: (input: SubmitTextInput) => Promise<unknown>;
}

interface ChatUpdate {
  readonly automaticSource?: InterviewSpeechSource | null;
  readonly canAcceptInterviewAnswer: boolean;
  readonly canonicalSegments: CanonicalSpeechSegment[];
  readonly status: ChatStatus;
}

type SnapshotListener = (snapshot: VoiceTurnSnapshot) => void;

const initialSnapshot: VoiceTurnSnapshot = {
  canReadFullResponse: false,
  canRepeatQuestion: false,
  canReviseLastAnswer: false,
  connection: "idle",
  currentQuestion: "",
  errorCode: null,
  errorMessage: "",
  errorRequestId: "",
  input: "paused",
  lastAnswerDelivery: "none",
  lastCommittedText: "",
  microphoneEnabled: false,
  microphoneLevel: 0,
  output: "idle",
  partialText: "",
};

const latestQuestion = (
  segments: CanonicalSpeechSegment[],
): CanonicalSpeechSegment | undefined =>
  segments.findLast(({ source }) => source === "brunch-ask");

export class VoiceTurnController {
  readonly #bridge: RealtimeBridge;
  readonly #listeners = new Set<SnapshotListener>();
  readonly #now: () => number;
  readonly #onLatencyEvent: ((event: VoiceLatencyEvent) => void) | undefined;
  readonly #session: RealtimeSession;
  readonly #submitText: (input: SubmitTextInput) => Promise<unknown>;
  #activeEpoch: number | null = null;
  #answerFinalizedAt: number | null = null;
  #answeredQuestionId: string | null = null;
  #bridgeStarted = false;
  #currentQuestionId: string | null = null;
  #generation = 0;
  #inputStateOnResume: Exclude<VoiceInputState, "paused"> | null = null;
  #pauseRequested = false;
  #snapshot = initialSnapshot;
  #speechSource: InterviewSpeechSource | null = null;
  #submittingQuestionId: string | null = null;
  #teardownPromise: Promise<void> | null = null;
  #transcriptItemId: string | null = null;
  #transcriptKey: string | null = null;

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
    this.#pauseRequested = false;
    this.#bridgeStarted = false;
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
    this.#answerFinalizedAt = null;
    this.#answeredQuestionId = null;
    this.#bridgeStarted = false;
    this.#currentQuestionId = null;
    this.#inputStateOnResume = null;
    this.#submittingQuestionId = null;
    this.#pauseRequested = false;
    this.#transcriptItemId = null;
    this.#transcriptKey = null;
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
    this.#cancelOutput();
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
    this.#session.setMicrophoneEnabled(!muted);
    this.#update({ microphoneEnabled: !muted, microphoneLevel: 0 });
  }

  public resume(): void {
    if (
      this.#snapshot.connection !== "connected" ||
      this.#snapshot.input !== "paused"
    ) {
      return;
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
    const source = this.#speechSource;
    if (!source || !this.#snapshot.canReadFullResponse) {
      return;
    }
    this.#update({ output: "waiting-for-tool" });
    this.#session.speakCanonical([...source.fullResponseSegments]);
  }

  public repeatQuestion(): void {
    const question = this.#speechSource?.questionSegment;
    if (!question || !this.#snapshot.canRepeatQuestion) {
      return;
    }
    this.#update({ output: "waiting-for-tool" });
    this.#session.speakCanonical([question]);
  }

  public updateChat(update: ChatUpdate): void {
    this.#speechSource = update.automaticSource ?? null;
    const canReplay = this.#canReplay(this.#snapshot);
    const replayAvailabilityChanged =
      this.#snapshot.canReadFullResponse !==
        (canReplay &&
          Boolean(this.#speechSource?.fullResponseSegments.length)) ||
      this.#snapshot.canRepeatQuestion !==
        (canReplay && Boolean(this.#speechSource?.questionSegment));
    const question = latestQuestion(update.canonicalSegments);
    if (question && question.id !== this.#currentQuestionId) {
      this.#currentQuestionId = question.id;
      this.#update({ currentQuestion: question.text });
      this.#recordLatency("question-visible", question.id);
    } else if (replayAvailabilityChanged) {
      this.#update({});
    }
    this.#bridge.updateChat(update);
    if (this.#snapshot.input === "paused") {
      this.#cancelOutput();
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
      this.#answerFinalizedAt = this.#now();
      this.#submittingQuestionId = this.#currentQuestionId;
      this.#transcriptItemId = null;
      this.#transcriptKey = null;
      this.#update({
        input: paused ? "paused" : "submitting",
        lastAnswerDelivery: "pending",
        lastCommittedText: event.answer,
        output: "waiting-for-tool",
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
    if (event.type === "speech-delivery-pending") {
      this.#update({ output: "waiting-for-tool" });
      return;
    }
    const paused = this.#snapshot.input === "paused";
    if (paused) {
      this.#inputStateOnResume = "listening";
      this.#cancelOutput();
    }
    this.#update({
      input: paused ? "paused" : "listening",
      output: paused ? "interrupted" : "waiting-for-tool",
    });
    const question = event.segments.findLast(
      ({ source }) => source === "brunch-ask",
    );
    if (question) this.#recordLatency("answer-ready", question.id);
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
    if (event.type === "output-started") {
      if (this.#snapshot.input === "paused") {
        this.#cancelOutput();
        this.#update({ output: "interrupted" });
        return;
      }
      this.#update({ output: "speaking" });
      if (this.#currentQuestionId) {
        this.#recordLatency("question-spoken-started", this.#currentQuestionId);
      }
      return;
    }
    if (event.type === "output-stopped") {
      this.#update({ output: "idle" });
      if (this.#currentQuestionId) {
        this.#recordLatency("question-spoken", this.#currentQuestionId);
      }
      return;
    }
    if (event.type === "output-interrupted") {
      this.#update({ output: "interrupted" });
      return;
    }
    if (event.type === "input-speech-started") {
      this.#bridge.cancelPendingSpeech();
      this.#transcriptItemId = event.itemId;
      this.#transcriptKey = null;
      if (this.#snapshot.output !== "idle") {
        this.#update({ output: "interrupted", partialText: "" });
      } else {
        this.#update({ partialText: "" });
      }
      return;
    }
    if (
      event.type === "input-speech-stopped" ||
      event.type === "response-terminal" ||
      event.type === "tool-arguments-delta" ||
      event.type === "tool-arguments-done"
    ) {
      return;
    }

    const key = `${event.key.connectionEpoch}:${event.key.itemId}:${event.key.contentIndex}`;
    if (event.key.connectionEpoch !== this.#activeEpoch) return;
    if (event.key.itemId !== this.#transcriptItemId) return;
    if (event.type === "transcription-failed") {
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
    this.#inputStateOnResume = null;
    this.#bridgeStarted = false;
    this.#transcriptItemId = null;
    this.#transcriptKey = null;
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

  #cancelOutput(): void {
    this.#bridge.cancelPendingSpeech();
    this.#session.cancelOutput();
  }

  #recordLatency(name: VoiceLatencyEvent["name"], questionId: string): void {
    if (this.#answerFinalizedAt === null) return;
    this.#onLatencyEvent?.({
      elapsedMs: Math.max(0, this.#now() - this.#answerFinalizedAt),
      name,
      questionId,
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
      (snapshot.output === "idle" || snapshot.output === "interrupted")
    );
  }

  #isPauseRequested(): boolean {
    return this.#pauseRequested;
  }

  #update(update: Partial<VoiceTurnSnapshot>): void {
    const snapshot = { ...this.#snapshot, ...update };
    this.#snapshot = {
      ...snapshot,
      canReadFullResponse:
        this.#canReplay(snapshot) &&
        Boolean(this.#speechSource?.fullResponseSegments.length),
      canRepeatQuestion:
        this.#canReplay(snapshot) &&
        Boolean(this.#speechSource?.questionSegment),
      canReviseLastAnswer: this.#canReviseLastAnswer(snapshot),
    };
    for (const listener of this.#listeners) listener(this.#snapshot);
  }
}
