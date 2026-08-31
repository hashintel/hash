import { VoiceError, type VoiceErrorCode } from "../../../voice-diagnostics";

import type { CanonicalSpeechSegment } from "./canonical-speech";
import type {
  OpenAIRealtimeSessionEvent,
  OpenAIRealtimeTranscriptKey,
} from "./openai-realtime-session";

export type VoiceTurnPhase =
  | "idle"
  | "connecting"
  | "listening"
  | "paused"
  | "transcribing"
  | "delivering"
  | "waiting"
  | "synthesizing"
  | "playing"
  | "recoverable-error";

/**
 * Whether the committed answer reached the interview. `pending` covers an
 * in-flight submission, so a failed or unfinished delivery is never mistaken
 * for a successful one.
 */
export type VoiceAnswerDelivery = "none" | "pending" | "delivered" | "failed";

export interface VoiceTurnSnapshot {
  readonly canReviseLastAnswer: boolean;
  readonly currentQuestion: string;
  readonly errorCode: VoiceErrorCode | null;
  readonly errorMessage: string;
  readonly errorRequestId: string;
  readonly lastAnswerDelivery: VoiceAnswerDelivery;
  readonly lastCommittedText: string;
  readonly microphoneEnabled: boolean;
  readonly microphoneLevel: number;
  readonly partialText: string;
  readonly phase: VoiceTurnPhase;
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
  connect(): Promise<number>;
  disconnect(): Promise<void>;
  setMicrophoneEnabled(enabled: boolean): void;
  subscribe(listener: (event: OpenAIRealtimeSessionEvent) => void): () => void;
}

interface SubmitTextInput {
  readonly id?: string;
  readonly target?: "auto" | "message";
  readonly text: string;
}

interface SpeechPlayback {
  cancel(): void;
  play(
    segment: CanonicalSpeechSegment,
    events?: { readonly onPlaying?: () => void },
  ): Promise<void>;
}

interface VoiceTurnControllerDependencies {
  readonly conversationId: string;
  readonly now?: () => number;
  readonly onLatencyEvent?: (event: VoiceLatencyEvent) => void;
  readonly playback: SpeechPlayback;
  readonly session: RealtimeSession;
  readonly submitText: (input: SubmitTextInput) => Promise<unknown>;
}

interface ChatUpdate {
  readonly canAcceptInterviewAnswer?: boolean;
  readonly canonicalSegments: CanonicalSpeechSegment[];
  readonly status: ChatStatus;
}

type SnapshotListener = (snapshot: VoiceTurnSnapshot) => void;

const transcriptKey = (key: OpenAIRealtimeTranscriptKey): string =>
  `${key.connectionEpoch}:${key.itemId}:${key.contentIndex}`;

export const createVoiceMessageId = (
  conversationId: string,
  key: OpenAIRealtimeTranscriptKey,
): string =>
  [
    "voice",
    encodeURIComponent(conversationId),
    key.connectionEpoch,
    encodeURIComponent(key.itemId),
    key.contentIndex,
  ].join(":");

const initialSnapshot: VoiceTurnSnapshot = {
  canReviseLastAnswer: false,
  currentQuestion: "",
  errorCode: null,
  errorMessage: "",
  errorRequestId: "",
  lastAnswerDelivery: "none",
  lastCommittedText: "",
  microphoneEnabled: false,
  microphoneLevel: 0,
  partialText: "",
  phase: "idle",
};

export class VoiceTurnController {
  readonly #conversationId: string;
  readonly #listeners = new Set<SnapshotListener>();
  readonly #now: () => number;
  readonly #onLatencyEvent: ((event: VoiceLatencyEvent) => void) | undefined;
  readonly #playback: SpeechPlayback;
  readonly #session: RealtimeSession;
  readonly #submitText: (input: SubmitTextInput) => Promise<unknown>;
  readonly #completedKeys = new Set<string>();
  readonly #seenSpeechSegmentIds = new Set<string>();
  readonly #speechQueue: CanonicalSpeechSegment[] = [];
  #answerFinalizedAt: number | null = null;
  #answerReadyQuestionId: string | null = null;
  #activeEpoch: number | null = null;
  #activeItemId: string | null = null;
  #activeKey: string | null = null;
  #activeSpeechSegmentId: string | null = null;
  #awaitingChatCycle = false;
  #availableSegments: CanonicalSpeechSegment[] = [];
  #canAcceptInterviewAnswer = true;
  #chatStatus: ChatStatus = "ready";
  #currentQuestionId: string | null = null;
  #deliverySequence = 0;
  #generation = 0;
  #pendingDelivery: SubmitTextInput | null = null;
  #paused = false;
  #questionAnswered = false;
  #questionPlaybackComplete = false;
  #redoing = false;
  #sawBusyChatStatus = false;
  #snapshot = initialSnapshot;
  #speechLoopGeneration: number | null = null;

  public constructor({
    conversationId,
    now = () => performance.now(),
    onLatencyEvent,
    playback,
    session,
    submitText,
  }: VoiceTurnControllerDependencies) {
    this.#conversationId = conversationId;
    this.#now = now;
    this.#onLatencyEvent = onLatencyEvent;
    this.#playback = playback;
    this.#session = session;
    this.#submitText = submitText;
    session.subscribe((event) => this.#handleSessionEvent(event));
  }

  public getSnapshot(): VoiceTurnSnapshot {
    return this.#snapshot;
  }

  public subscribe(listener: SnapshotListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  public async start(): Promise<void> {
    if (this.#snapshot.phase !== "idle") {
      return;
    }
    this.#queueAvailableSegments();
    if (!this.#isChatReady() && !this.#hasPendingQuestion()) {
      this.#setMicrophoneEnabled(false);
      this.#update({
        errorMessage:
          "Wait for the current response to finish before starting.",
        phase: "recoverable-error",
      });
      return;
    }

    const generation = ++this.#generation;
    this.#update({ errorMessage: "", phase: "connecting" });
    try {
      const connectionEpoch = await this.#session.connect();
      if (generation !== this.#generation) {
        return;
      }
      this.#activeEpoch = connectionEpoch;
      this.#activeItemId = null;
      this.#activeKey = null;
      this.#completedKeys.clear();
      this.#paused = false;
      const canListen =
        this.#canAcceptInterviewAnswer &&
        this.#isChatReady() &&
        this.#speechQueue.length === 0 &&
        !this.#hasAnswerableQuestion();
      this.#setMicrophoneEnabled(canListen);
      this.#update({
        partialText: "",
        phase: canListen ? "listening" : "waiting",
      });
      this.#startSpeechQueueIfNeeded();
    } catch (error) {
      if (generation !== this.#generation) {
        return;
      }
      const voiceError =
        error instanceof VoiceError
          ? error
          : new VoiceError("connection", "invalid-response", "");
      this.#setMicrophoneEnabled(false);
      this.#update({
        errorCode: voiceError.code,
        errorMessage: voiceError.message,
        errorRequestId: voiceError.requestId,
        phase: "recoverable-error",
      });
    }
  }

  public async end(): Promise<void> {
    if (!this.#questionAnswered && this.#currentQuestionId !== null) {
      this.#seenSpeechSegmentIds.delete(this.#currentQuestionId);
    }
    ++this.#generation;
    this.#activeEpoch = null;
    this.#activeItemId = null;
    this.#activeKey = null;
    this.#activeSpeechSegmentId = null;
    this.#awaitingChatCycle = false;
    this.#pendingDelivery = null;
    this.#answerFinalizedAt = null;
    this.#answerReadyQuestionId = null;
    this.#currentQuestionId = null;
    this.#paused = false;
    this.#questionAnswered = false;
    this.#questionPlaybackComplete = false;
    this.#redoing = false;
    this.#sawBusyChatStatus = false;
    this.#speechLoopGeneration = null;
    this.#speechQueue.length = 0;
    this.#playback.cancel();
    this.#setMicrophoneEnabled(false);
    await this.#session.disconnect();
    this.#update({
      errorMessage: "",
      currentQuestion: "",
      lastAnswerDelivery: "none",
      lastCommittedText: "",
      microphoneLevel: 0,
      partialText: "",
      phase: "idle",
    });
  }

  public async reconnect(): Promise<void> {
    const pendingQuestionId = this.#questionAnswered
      ? null
      : this.#currentQuestionId;
    await this.end();
    if (
      pendingQuestionId !== null &&
      this.#availableSegments.some(
        (segment) =>
          segment.id === pendingQuestionId && segment.source === "brunch-ask",
      )
    ) {
      this.#seenSpeechSegmentIds.delete(pendingQuestionId);
    }
    await this.start();
  }

  public async submitCorrection(correction: string): Promise<boolean> {
    const correctedText = correction.trim();
    const previousText = this.#snapshot.lastCommittedText;
    if (!correctedText || !this.#canReviseLastAnswer()) {
      return false;
    }

    this.#questionAnswered = true;
    this.#setMicrophoneEnabled(false);
    this.#update({
      errorMessage: "",
      lastAnswerDelivery: "pending",
      phase: "delivering",
    });
    return this.#deliver({
      target: "message",
      text: `Correction to my previous voice answer "${previousText}": ${correctedText}`,
    });
  }

  public interruptAndSpeak(): void {
    if (
      this.#activeEpoch === null ||
      (this.#snapshot.phase !== "playing" &&
        this.#snapshot.phase !== "synthesizing")
    ) {
      return;
    }

    ++this.#generation;
    this.#speechLoopGeneration = null;
    this.#activeSpeechSegmentId = null;
    this.#speechQueue.length = 0;
    this.#playback.cancel();
    this.#questionPlaybackComplete = Boolean(this.#snapshot.currentQuestion);
    this.#paused = false;
    this.#settleListeningIfReady();
  }

  public doneSpeaking(): void {
    if (this.#activeEpoch === null || this.#snapshot.phase !== "listening") {
      return;
    }
    this.#setMicrophoneEnabled(false);
    this.#update({ phase: "transcribing" });
  }

  public pause(): void {
    if (this.#activeEpoch === null || this.#snapshot.phase !== "listening") {
      return;
    }
    this.#paused = true;
    this.#setMicrophoneEnabled(false);
    this.#update({ phase: "paused" });
  }

  public resume(): void {
    if (this.#snapshot.phase !== "paused") {
      return;
    }
    this.#paused = false;
    this.#startSpeechQueueIfNeeded();
    this.#settleListeningIfReady();
  }

  public redoAnswer(): void {
    if (!this.#canReviseLastAnswer()) {
      return;
    }
    this.#redoing = true;
    this.#questionAnswered = false;
    this.#paused = false;
    this.#settleListeningIfReady();
  }

  public updateChat({
    canAcceptInterviewAnswer = true,
    canonicalSegments,
    status,
  }: ChatUpdate): void {
    this.#availableSegments = canonicalSegments;
    this.#canAcceptInterviewAnswer = canAcceptInterviewAnswer;
    this.#chatStatus = status;
    const canQueueSpeech =
      status !== "error" &&
      this.#snapshot.phase !== "idle" &&
      this.#snapshot.phase !== "recoverable-error";
    for (const segment of canonicalSegments) {
      if (this.#seenSpeechSegmentIds.has(segment.id)) {
        continue;
      }
      if (canQueueSpeech) {
        this.#queueSpeechSegment(segment);
      } else if (segment.source === "assistant-text") {
        this.#seenSpeechSegmentIds.add(segment.id);
      }
    }

    if (this.#snapshot.phase === "recoverable-error") {
      return;
    }

    if (
      status === "ready" &&
      !this.#awaitingChatCycle &&
      this.#pendingDelivery !== null
    ) {
      const pendingDelivery = this.#pendingDelivery;
      this.#pendingDelivery = null;
      this.#session.setMicrophoneEnabled(false);
      this.#update({ errorMessage: "", phase: "delivering" });
      void this.#deliver(pendingDelivery);
      return;
    }

    if (status === "error") {
      if (this.#snapshot.phase === "idle") {
        return;
      }
      const errorMessage = this.#awaitingChatCycle
        ? "The interview could not accept that answer. Use the composer to retry."
        : "The interview could not complete that turn. Use the composer to retry.";
      ++this.#generation;
      this.#activeEpoch = null;
      this.#activeItemId = null;
      this.#activeKey = null;
      this.#awaitingChatCycle = false;
      this.#sawBusyChatStatus = false;
      this.#speechQueue.length = 0;
      this.#activeSpeechSegmentId = null;
      this.#speechLoopGeneration = null;
      this.#playback.cancel();
      this.#setMicrophoneEnabled(false);
      void this.#session.disconnect();
      this.#update({ errorMessage, phase: "recoverable-error" });
      return;
    }

    this.#startSpeechQueueIfNeeded();
    if (status === "submitted" || status === "streaming") {
      if (this.#awaitingChatCycle) {
        this.#sawBusyChatStatus = true;
      }
      if (this.#hasAnswerableQuestion() && !this.#paused) {
        this.#settleListeningIfReady();
        return;
      }
      this.#setMicrophoneEnabled(false);
      if (
        this.#speechLoopGeneration === null &&
        (this.#snapshot.phase === "listening" ||
          this.#snapshot.phase === "delivering" ||
          this.#snapshot.phase === "waiting")
      ) {
        this.#update({ phase: "waiting" });
      }
      return;
    }
    this.#settleListeningIfReady();
  }

  async #deliver(input: SubmitTextInput): Promise<boolean> {
    if (!this.#isChatReady()) {
      this.#pendingDelivery = input;
      this.#setMicrophoneEnabled(false);
      this.#update({ phase: "waiting" });
      return false;
    }

    const generation = this.#generation;
    const delivery = ++this.#deliverySequence;
    this.#awaitingChatCycle = true;
    this.#sawBusyChatStatus = false;
    try {
      await this.#submitText(input);
      this.#recordDeliveryOutcome(delivery, "delivered");
      if (
        generation !== this.#generation ||
        !this.#isAwaitingCurrentChatCycle()
      ) {
        return false;
      }
      if (this.#snapshot.phase === "delivering") {
        this.#update({ phase: "waiting" });
      }
      this.#settleListeningIfReady();
      return true;
    } catch {
      this.#recordDeliveryOutcome(delivery, "failed");
      if (
        generation !== this.#generation ||
        this.#snapshot.phase === "recoverable-error"
      ) {
        return false;
      }
      if (!this.#isChatReady()) {
        this.#pendingDelivery = input;
        this.#awaitingChatCycle = false;
        this.#setMicrophoneEnabled(false);
        this.#update({ phase: "waiting" });
        return false;
      }
      this.#awaitingChatCycle = false;
      this.#setMicrophoneEnabled(false);
      this.#update({
        errorMessage:
          "The interview could not accept that answer. Use the composer to retry.",
        phase: "recoverable-error",
      });
      return false;
    }
  }

  /**
   * Applies a delivery result only while it still describes the answer the
   * snapshot is waiting on, so a late result cannot relabel a newer answer.
   */
  #recordDeliveryOutcome(
    delivery: number,
    outcome: "delivered" | "failed",
  ): void {
    if (
      delivery !== this.#deliverySequence ||
      this.#snapshot.lastAnswerDelivery !== "pending"
    ) {
      return;
    }
    this.#update({ lastAnswerDelivery: outcome });
  }

  #isAwaitingCurrentChatCycle(): boolean {
    return this.#awaitingChatCycle;
  }

  #isChatReady(): boolean {
    return this.#chatStatus === "ready";
  }

  #handleSessionEvent(event: OpenAIRealtimeSessionEvent): void {
    if (event.type === "microphone-level") {
      if (this.#snapshot.microphoneEnabled) {
        this.#update({ microphoneLevel: event.level });
      }
      return;
    }
    if (event.type === "error") {
      ++this.#generation;
      this.#activeEpoch = null;
      this.#activeItemId = null;
      this.#activeKey = null;
      this.#awaitingChatCycle = false;
      this.#pendingDelivery = null;
      this.#sawBusyChatStatus = false;
      this.#activeSpeechSegmentId = null;
      this.#speechLoopGeneration = null;
      this.#speechQueue.length = 0;
      this.#playback.cancel();
      this.#setMicrophoneEnabled(false);
      this.#update({
        errorCode: event.code,
        errorMessage: event.message,
        errorRequestId: event.requestId,
        phase: "recoverable-error",
      });
      return;
    }
    if (this.#pendingDelivery !== null) {
      return;
    }
    if (event.type === "input-committed") {
      if (
        event.connectionEpoch !== this.#activeEpoch ||
        (this.#activeItemId !== null && this.#activeItemId !== event.itemId) ||
        (this.#snapshot.phase !== "listening" &&
          this.#snapshot.phase !== "transcribing" &&
          this.#snapshot.phase !== "waiting")
      ) {
        return;
      }
      this.#activeItemId = event.itemId;
      this.#setMicrophoneEnabled(false);
      this.#update({ phase: "transcribing" });
      return;
    }

    if (
      event.key.connectionEpoch !== this.#activeEpoch ||
      (this.#snapshot.phase !== "listening" &&
        this.#snapshot.phase !== "transcribing" &&
        this.#snapshot.phase !== "waiting")
    ) {
      return;
    }
    const key = transcriptKey(event.key);
    if (this.#completedKeys.has(key)) {
      return;
    }
    if (
      (this.#activeItemId !== null &&
        this.#activeItemId !== event.key.itemId) ||
      (this.#activeKey !== null && this.#activeKey !== key)
    ) {
      return;
    }
    this.#activeItemId = event.key.itemId;
    this.#activeKey = key;

    if (event.type === "partial") {
      this.#update({
        partialText: `${this.#snapshot.partialText}${event.text}`,
      });
      return;
    }
    this.#completedKeys.add(key);

    const finalText = event.text.trim();
    this.#activeItemId = null;
    this.#activeKey = null;
    if (!finalText) {
      this.#update({
        partialText: "",
        phase: "waiting",
      });
      this.#settleListeningIfReady();
      return;
    }

    this.#setMicrophoneEnabled(false);
    const previousText = this.#snapshot.lastCommittedText;
    const redoing = this.#redoing;
    this.#redoing = false;
    this.#questionAnswered = true;
    this.#answerFinalizedAt = this.#now();
    const input = redoing
      ? {
          target: "message" as const,
          text: `Correction to my previous voice answer "${previousText}": ${finalText}`,
        }
      : {
          id: createVoiceMessageId(this.#conversationId, event.key),
          text: finalText,
        };
    const canDeliver = this.#isChatReady();
    this.#update({
      errorMessage: "",
      lastAnswerDelivery: "pending",
      lastCommittedText: finalText,
      partialText: "",
      phase: canDeliver ? "delivering" : "waiting",
    });
    if (canDeliver) {
      void this.#deliver(input);
    } else {
      this.#pendingDelivery = input;
    }
  }

  #startSpeechQueueIfNeeded(): void {
    if (
      this.#speechLoopGeneration !== null ||
      this.#speechQueue.length === 0 ||
      this.#activeEpoch === null ||
      this.#snapshot.phase === "transcribing" ||
      this.#paused
    ) {
      return;
    }

    const generation = this.#generation;
    this.#speechLoopGeneration = generation;
    this.#setMicrophoneEnabled(false);
    this.#update({ errorMessage: "", phase: "synthesizing" });
    void this.#drainSpeechQueue(generation);
  }

  async #drainSpeechQueue(generation: number): Promise<void> {
    while (
      generation === this.#generation &&
      this.#speechLoopGeneration === generation &&
      this.#activeEpoch !== null
    ) {
      const segment = this.#speechQueue.shift();
      if (!segment) {
        break;
      }

      this.#activeSpeechSegmentId = segment.id;
      this.#setMicrophoneEnabled(false);
      this.#update({ errorMessage: "", phase: "synthesizing" });
      try {
        await this.#playback.play(segment, {
          onPlaying: () => {
            if (
              generation === this.#generation &&
              this.#speechLoopGeneration === generation &&
              this.#activeSpeechSegmentId === segment.id
            ) {
              this.#update({ phase: "playing" });
              if (segment.source === "brunch-ask") {
                this.#recordLatency("question-spoken-started", segment.id);
              }
            }
          },
        });
      } catch (error) {
        if (
          generation !== this.#generation ||
          this.#speechLoopGeneration !== generation
        ) {
          return;
        }
        const voiceError =
          error instanceof VoiceError
            ? error
            : new VoiceError("speech", "invalid-response", "");
        this.#activeSpeechSegmentId = null;
        this.#speechLoopGeneration = null;
        this.#speechQueue.length = 0;
        this.#setMicrophoneEnabled(false);
        this.#update({
          errorCode: voiceError.code,
          errorMessage: voiceError.message,
          errorRequestId: voiceError.requestId,
          phase: "recoverable-error",
        });
        return;
      }

      if (
        generation !== this.#generation ||
        this.#speechLoopGeneration !== generation
      ) {
        return;
      }
      this.#activeSpeechSegmentId = null;
      if (segment.source === "brunch-ask") {
        this.#questionPlaybackComplete = true;
        this.#recordLatency("question-spoken", segment.id);
      }
    }

    if (
      generation !== this.#generation ||
      this.#speechLoopGeneration !== generation
    ) {
      return;
    }
    this.#activeSpeechSegmentId = null;
    this.#speechLoopGeneration = null;
    this.#settleListeningIfReady();
  }

  #settleListeningIfReady(): void {
    if (
      this.#activeEpoch === null ||
      this.#snapshot.phase === "recoverable-error" ||
      this.#paused ||
      this.#speechLoopGeneration !== null
    ) {
      if (this.#paused) {
        this.#setMicrophoneEnabled(false);
      }
      return;
    }

    if (this.#snapshot.phase === "transcribing") {
      this.#setMicrophoneEnabled(false);
      return;
    }

    if (!this.#canAcceptInterviewAnswer) {
      this.#setMicrophoneEnabled(false);
      if (this.#snapshot.phase !== "delivering") {
        this.#update({ phase: "waiting" });
      }
      return;
    }

    if (this.#hasAnswerableQuestion()) {
      this.#awaitingChatCycle = false;
      this.#sawBusyChatStatus = false;
      this.#setMicrophoneEnabled(true);
      this.#update({ errorMessage: "", phase: "listening" });
      if (this.#answerReadyQuestionId !== this.#activeQuestionId()) {
        this.#answerReadyQuestionId = this.#activeQuestionId();
        this.#recordLatency("answer-ready", this.#activeQuestionId());
      }
      return;
    }

    if (this.#speechQueue.length > 0) {
      this.#startSpeechQueueIfNeeded();
      return;
    }

    if (this.#awaitingChatCycle) {
      if (!this.#sawBusyChatStatus || this.#chatStatus !== "ready") {
        this.#setMicrophoneEnabled(false);
        if (this.#snapshot.phase !== "waiting") {
          this.#update({ phase: "waiting" });
        }
        return;
      }
      this.#awaitingChatCycle = false;
      this.#sawBusyChatStatus = false;
    }

    if (!this.#isChatReady()) {
      this.#setMicrophoneEnabled(false);
      if (this.#snapshot.phase !== "delivering") {
        this.#update({ phase: "waiting" });
      }
      return;
    }

    this.#setMicrophoneEnabled(true);
    this.#update({ errorMessage: "", phase: "listening" });
  }

  #activeQuestionId(): string {
    return this.#currentQuestionId ?? this.#snapshot.currentQuestion;
  }

  #hasPendingQuestion(): boolean {
    return (
      Boolean(this.#snapshot.currentQuestion) && this.#canAcceptInterviewAnswer
    );
  }

  #hasAnswerableQuestion(): boolean {
    return (
      Boolean(this.#snapshot.currentQuestion) &&
      this.#questionPlaybackComplete &&
      !this.#questionAnswered &&
      this.#canAcceptInterviewAnswer
    );
  }

  #canReviseLastAnswer(snapshot = this.#snapshot): boolean {
    return (
      Boolean(snapshot.lastCommittedText) &&
      this.#activeEpoch !== null &&
      snapshot.phase === "listening" &&
      !this.#awaitingChatCycle &&
      this.#speechLoopGeneration === null &&
      this.#canAcceptInterviewAnswer
    );
  }

  #queueAvailableSegments(): void {
    for (const segment of this.#availableSegments) {
      if (!this.#seenSpeechSegmentIds.has(segment.id)) {
        this.#queueSpeechSegment(segment);
      }
    }
  }

  #queueSpeechSegment(segment: CanonicalSpeechSegment): void {
    this.#seenSpeechSegmentIds.add(segment.id);
    this.#speechQueue.push(segment);
    if (segment.source === "brunch-ask") {
      this.#currentQuestionId = segment.id;
      this.#questionPlaybackComplete = false;
      this.#questionAnswered = false;
      this.#redoing = false;
      this.#answerReadyQuestionId = null;
      this.#awaitingChatCycle = false;
      this.#sawBusyChatStatus = false;
      this.#update({
        currentQuestion: segment.text,
        lastAnswerDelivery: "none",
        lastCommittedText: "",
      });
      this.#recordLatency("question-visible", segment.id);
    }
  }

  #recordLatency(name: VoiceLatencyEvent["name"], questionId: string): void {
    if (this.#answerFinalizedAt === null) {
      return;
    }
    this.#onLatencyEvent?.({
      elapsedMs: Math.max(0, this.#now() - this.#answerFinalizedAt),
      name,
      questionId,
    });
  }

  #setMicrophoneEnabled(enabled: boolean): void {
    const microphoneEnabled = enabled && this.#canAcceptInterviewAnswer;
    this.#session.setMicrophoneEnabled(microphoneEnabled);
    if (
      this.#snapshot.microphoneEnabled !== microphoneEnabled ||
      (!microphoneEnabled && this.#snapshot.microphoneLevel !== 0)
    ) {
      this.#update({
        microphoneEnabled,
        ...(microphoneEnabled ? {} : { microphoneLevel: 0 }),
      });
    }
  }

  #update(update: Partial<VoiceTurnSnapshot>): void {
    const clearedError =
      update.errorMessage !== undefined && !("errorCode" in update)
        ? { errorCode: null, errorRequestId: "" }
        : {};
    const snapshot = { ...this.#snapshot, ...clearedError, ...update };
    this.#snapshot = {
      ...snapshot,
      canReviseLastAnswer: this.#canReviseLastAnswer(snapshot),
    };
    for (const listener of this.#listeners) {
      listener(this.#snapshot);
    }
  }
}
