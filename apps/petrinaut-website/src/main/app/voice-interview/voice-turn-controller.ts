import type { CanonicalSpeechSegment } from "./canonical-speech";
import type {
  OpenAIRealtimeSessionEvent,
  OpenAIRealtimeTranscriptKey,
} from "./openai-realtime-session";

export type VoiceTurnPhase =
  | "idle"
  | "connecting"
  | "listening"
  | "transcribing"
  | "delivering"
  | "waiting"
  | "synthesizing"
  | "playing"
  | "recoverable-error";

export interface VoiceTurnSnapshot {
  readonly errorMessage: string;
  readonly lastCommittedText: string;
  readonly partialText: string;
  readonly phase: VoiceTurnPhase;
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
  readonly playback: SpeechPlayback;
  readonly session: RealtimeSession;
  readonly submitText: (input: SubmitTextInput) => Promise<unknown>;
}

interface ChatUpdate {
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
  errorMessage: "",
  lastCommittedText: "",
  partialText: "",
  phase: "idle",
};

export class VoiceTurnController {
  readonly #conversationId: string;
  readonly #listeners = new Set<SnapshotListener>();
  readonly #playback: SpeechPlayback;
  readonly #session: RealtimeSession;
  readonly #submitText: (input: SubmitTextInput) => Promise<unknown>;
  readonly #completedKeys = new Set<string>();
  readonly #seenSpeechSegmentIds = new Set<string>();
  readonly #speechQueue: CanonicalSpeechSegment[] = [];
  #activeEpoch: number | null = null;
  #activeItemId: string | null = null;
  #activeKey: string | null = null;
  #activeSpeechSegmentId: string | null = null;
  #awaitingChatCycle = false;
  #chatStatus: ChatStatus = "ready";
  #generation = 0;
  #pendingDelivery: SubmitTextInput | null = null;
  #sawBusyChatStatus = false;
  #snapshot = initialSnapshot;
  #speechLoopGeneration: number | null = null;

  public constructor({
    conversationId,
    playback,
    session,
    submitText,
  }: VoiceTurnControllerDependencies) {
    this.#conversationId = conversationId;
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
    if (!this.#isChatReady()) {
      this.#session.setMicrophoneEnabled(false);
      this.#update({
        errorMessage: "Wait for Brunch to finish before starting voice input.",
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
      const canListen = this.#isChatReady() && this.#speechQueue.length === 0;
      this.#session.setMicrophoneEnabled(canListen);
      this.#update({
        partialText: "",
        phase: canListen ? "listening" : "waiting",
      });
      this.#startSpeechQueueIfNeeded();
    } catch (error) {
      if (generation !== this.#generation) {
        return;
      }
      this.#session.setMicrophoneEnabled(false);
      this.#update({
        errorMessage:
          error instanceof Error
            ? error.message
            : "Voice input could not be started. Try reconnecting.",
        phase: "recoverable-error",
      });
    }
  }

  public async end(): Promise<void> {
    ++this.#generation;
    this.#activeEpoch = null;
    this.#activeItemId = null;
    this.#activeKey = null;
    this.#activeSpeechSegmentId = null;
    this.#awaitingChatCycle = false;
    this.#pendingDelivery = null;
    this.#sawBusyChatStatus = false;
    this.#speechLoopGeneration = null;
    this.#speechQueue.length = 0;
    this.#playback.cancel();
    this.#session.setMicrophoneEnabled(false);
    await this.#session.disconnect();
    this.#update({
      errorMessage: "",
      partialText: "",
      phase: "idle",
    });
  }

  public async reconnect(): Promise<void> {
    await this.end();
    await this.start();
  }

  public async submitCorrection(correction: string): Promise<void> {
    const correctedText = correction.trim();
    const previousText = this.#snapshot.lastCommittedText;
    if (
      !correctedText ||
      !previousText ||
      this.#snapshot.phase !== "listening"
    ) {
      return;
    }

    this.#session.setMicrophoneEnabled(false);
    this.#update({ errorMessage: "", phase: "delivering" });
    await this.#deliver({
      target: "message",
      text: `Correction to my previous voice answer "${previousText}": ${correctedText}`,
    });
  }

  public updateChat({ canonicalSegments, status }: ChatUpdate): void {
    this.#chatStatus = status;
    const canQueueSpeech =
      status !== "error" &&
      this.#snapshot.phase !== "idle" &&
      this.#snapshot.phase !== "recoverable-error";
    for (const segment of canonicalSegments) {
      if (this.#seenSpeechSegmentIds.has(segment.id)) {
        continue;
      }
      this.#seenSpeechSegmentIds.add(segment.id);
      if (canQueueSpeech) {
        this.#speechQueue.push(segment);
      }
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
        ? "Brunch could not accept the voice turn. Use the composer to retry."
        : "Brunch could not complete the current turn. Use the composer to retry.";
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
      this.#session.setMicrophoneEnabled(false);
      void this.#session.disconnect();
      this.#update({ errorMessage, phase: "recoverable-error" });
      return;
    }

    this.#startSpeechQueueIfNeeded();
    if (status === "submitted" || status === "streaming") {
      if (this.#awaitingChatCycle) {
        this.#sawBusyChatStatus = true;
      }
      this.#session.setMicrophoneEnabled(false);
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

  async #deliver(input: SubmitTextInput): Promise<void> {
    if (!this.#isChatReady()) {
      this.#pendingDelivery = input;
      this.#session.setMicrophoneEnabled(false);
      this.#update({ phase: "waiting" });
      return;
    }

    const generation = this.#generation;
    this.#awaitingChatCycle = true;
    this.#sawBusyChatStatus = false;
    try {
      await this.#submitText(input);
      if (
        generation !== this.#generation ||
        !this.#isAwaitingCurrentChatCycle()
      ) {
        return;
      }
      if (this.#snapshot.phase === "delivering") {
        this.#update({ phase: "waiting" });
      }
      this.#settleListeningIfReady();
    } catch {
      if (generation !== this.#generation) {
        return;
      }
      if (!this.#isChatReady()) {
        this.#pendingDelivery = input;
        this.#awaitingChatCycle = false;
        this.#session.setMicrophoneEnabled(false);
        this.#update({ phase: "waiting" });
        return;
      }
      this.#awaitingChatCycle = false;
      this.#session.setMicrophoneEnabled(false);
      this.#update({
        errorMessage:
          "Brunch could not accept the voice turn. Use the composer to retry.",
        phase: "recoverable-error",
      });
    }
  }

  #isAwaitingCurrentChatCycle(): boolean {
    return this.#awaitingChatCycle;
  }

  #isChatReady(): boolean {
    return this.#chatStatus === "ready";
  }

  #handleSessionEvent(event: OpenAIRealtimeSessionEvent): void {
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
      this.#session.setMicrophoneEnabled(false);
      this.#update({ errorMessage: event.message, phase: "recoverable-error" });
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
      this.#session.setMicrophoneEnabled(false);
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
      this.#session.setMicrophoneEnabled(false);
      this.#update({
        partialText: `${this.#snapshot.partialText}${event.text}`,
        phase: "transcribing",
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

    this.#session.setMicrophoneEnabled(false);
    const input = {
      id: createVoiceMessageId(this.#conversationId, event.key),
      text: finalText,
    };
    const canDeliver = this.#isChatReady();
    this.#update({
      errorMessage: "",
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
      this.#snapshot.phase === "transcribing"
    ) {
      return;
    }

    const generation = this.#generation;
    this.#speechLoopGeneration = generation;
    this.#session.setMicrophoneEnabled(false);
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
      this.#session.setMicrophoneEnabled(false);
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
            }
          },
        });
      } catch {
        if (
          generation !== this.#generation ||
          this.#speechLoopGeneration !== generation
        ) {
          return;
        }
        this.#activeSpeechSegmentId = null;
        this.#speechLoopGeneration = null;
        this.#speechQueue.length = 0;
        this.#session.setMicrophoneEnabled(false);
        this.#update({
          errorMessage:
            "The response could not be spoken. Read the visible text instead.",
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
      this.#speechLoopGeneration !== null
    ) {
      return;
    }

    if (this.#snapshot.phase === "transcribing") {
      this.#session.setMicrophoneEnabled(false);
      return;
    }

    if (this.#speechQueue.length > 0) {
      this.#startSpeechQueueIfNeeded();
      return;
    }

    if (this.#awaitingChatCycle) {
      if (!this.#sawBusyChatStatus || this.#chatStatus !== "ready") {
        this.#session.setMicrophoneEnabled(false);
        return;
      }
      this.#awaitingChatCycle = false;
      this.#sawBusyChatStatus = false;
    }

    if (!this.#isChatReady()) {
      this.#session.setMicrophoneEnabled(false);
      if (this.#snapshot.phase !== "delivering") {
        this.#update({ phase: "waiting" });
      }
      return;
    }

    this.#session.setMicrophoneEnabled(true);
    this.#update({ errorMessage: "", phase: "listening" });
  }

  #update(update: Partial<VoiceTurnSnapshot>): void {
    this.#snapshot = { ...this.#snapshot, ...update };
    for (const listener of this.#listeners) {
      listener(this.#snapshot);
    }
  }
}
