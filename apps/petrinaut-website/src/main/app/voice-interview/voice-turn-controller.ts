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

interface VoiceTurnControllerDependencies {
  readonly conversationId: string;
  readonly session: RealtimeSession;
  readonly submitText: (input: SubmitTextInput) => Promise<unknown>;
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
  readonly #session: RealtimeSession;
  readonly #submitText: (input: SubmitTextInput) => Promise<unknown>;
  readonly #completedKeys = new Set<string>();
  #activeEpoch: number | null = null;
  #activeItemId: string | null = null;
  #activeKey: string | null = null;
  #awaitingChatCycle = false;
  #chatStatus: ChatStatus = "ready";
  #generation = 0;
  #sawBusyChatStatus = false;
  #snapshot = initialSnapshot;

  public constructor({
    conversationId,
    session,
    submitText,
  }: VoiceTurnControllerDependencies) {
    this.#conversationId = conversationId;
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
      const canListen = this.#isChatReady();
      this.#session.setMicrophoneEnabled(canListen);
      this.#update({
        partialText: "",
        phase: canListen ? "listening" : "waiting",
      });
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
    this.#awaitingChatCycle = false;
    this.#sawBusyChatStatus = false;
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

  public updateChatStatus(status: ChatStatus): void {
    this.#chatStatus = status;
    if (!this.#awaitingChatCycle) {
      if (
        (status === "submitted" || status === "streaming") &&
        this.#snapshot.phase === "listening"
      ) {
        this.#session.setMicrophoneEnabled(false);
        this.#update({ phase: "waiting" });
      } else if (
        status === "ready" &&
        this.#activeEpoch !== null &&
        this.#snapshot.phase === "waiting"
      ) {
        this.#session.setMicrophoneEnabled(true);
        this.#update({ errorMessage: "", phase: "listening" });
      } else if (status === "error" && this.#snapshot.phase === "waiting") {
        this.#session.setMicrophoneEnabled(false);
        this.#update({
          errorMessage:
            "Brunch could not complete the current turn. Use the composer to retry.",
          phase: "recoverable-error",
        });
      }
      return;
    }

    if (status === "submitted" || status === "streaming") {
      this.#sawBusyChatStatus = true;
      this.#update({ phase: "waiting" });
      return;
    }
    if (status === "error") {
      this.#awaitingChatCycle = false;
      this.#session.setMicrophoneEnabled(false);
      this.#update({
        errorMessage:
          "Brunch could not accept the voice turn. Use the composer to retry.",
        phase: "recoverable-error",
      });
      return;
    }
    this.#reopenListeningIfReady();
  }

  async #deliver(input: SubmitTextInput): Promise<void> {
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
      this.#update({ phase: "waiting" });
      this.#reopenListeningIfReady();
    } catch {
      if (generation !== this.#generation) {
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
      this.#sawBusyChatStatus = false;
      this.#session.setMicrophoneEnabled(false);
      this.#update({ errorMessage: event.message, phase: "recoverable-error" });
      return;
    }
    if (event.type === "input-committed") {
      if (
        event.connectionEpoch !== this.#activeEpoch ||
        (this.#activeItemId !== null && this.#activeItemId !== event.itemId) ||
        (this.#snapshot.phase !== "listening" &&
          this.#snapshot.phase !== "transcribing")
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
        this.#snapshot.phase !== "transcribing")
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
      const canListen = this.#isChatReady();
      this.#session.setMicrophoneEnabled(canListen);
      this.#update({
        partialText: "",
        phase: canListen ? "listening" : "waiting",
      });
      return;
    }

    this.#session.setMicrophoneEnabled(false);
    this.#update({
      errorMessage: "",
      lastCommittedText: finalText,
      partialText: "",
      phase: "delivering",
    });
    void this.#deliver({
      id: createVoiceMessageId(this.#conversationId, event.key),
      text: finalText,
    });
  }

  #reopenListeningIfReady(): void {
    if (
      !this.#awaitingChatCycle ||
      !this.#sawBusyChatStatus ||
      this.#chatStatus !== "ready"
    ) {
      return;
    }
    this.#awaitingChatCycle = false;
    this.#sawBusyChatStatus = false;
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
