import type { VoiceExperimentAdapter } from "./voice-experiment-adapter";
import type { VoiceExperimentEvent } from "./voice-experiment-events";

const TOKEN_ENDPOINT = "/api/voice-experiment/elevenlabs-conversation-token";

type ConversationControl = {
  endSession(): Promise<void>;
  setMicMuted(isMuted: boolean): void;
};

type SessionOptions = {
  connectionType: "webrtc";
  conversationToken: string;
  onConnect(event: { conversationId: string }): void;
  onConversationCreated(conversation: ConversationControl): void;
  onDisconnect(details: { reason: string }): void;
  onError(message: string): void;
  onInterruption(): void;
  onMessage(event: {
    event_id?: number;
    message: string;
    role: "agent" | "user";
  }): void;
  onModeChange(event: { mode: "listening" | "speaking" }): void;
};

type ElevenLabsAdapterDependencies = {
  fetch: typeof globalThis.fetch;
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  now: () => number;
  startSession: (options: SessionOptions) => Promise<ConversationControl>;
};

const defaultDependencies: ElevenLabsAdapterDependencies = {
  fetch: (...args) => globalThis.fetch(...args),
  getUserMedia: (constraints) =>
    navigator.mediaDevices.getUserMedia(constraints),
  now: () => Date.now(),
  startSession: async (options) => {
    const { Conversation } = await import("@elevenlabs/client");
    return Conversation.startSession(options);
  },
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;

const getString = (
  value: Record<string, unknown> | null,
  key: string,
): string | null => {
  const candidate = value?.[key];
  return typeof candidate === "string" ? candidate : null;
};

class ElevenLabsAdapter implements VoiceExperimentAdapter {
  readonly #dependencies: ElevenLabsAdapterDependencies;
  readonly #listeners = new Set<(event: VoiceExperimentEvent) => void>();

  #connectPromise: Promise<void> | null = null;
  #connected = false;
  #conversation: ConversationControl | null = null;
  #disposed = false;
  #responseInProgress = false;
  #turnId = 0;

  public constructor(dependencies: ElevenLabsAdapterDependencies) {
    this.#dependencies = dependencies;
  }

  public subscribe(listener: (event: VoiceExperimentEvent) => void) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  public async connect(): Promise<void> {
    if (this.#connected) {
      return;
    }
    if (this.#connectPromise) {
      return this.#connectPromise;
    }

    this.#connectPromise = this.#establishConnection().finally(() => {
      this.#connectPromise = null;
    });
    return this.#connectPromise;
  }

  public async startTurn(): Promise<void> {
    const conversation = this.#requireConversation();
    this.#turnId += 1;
    this.#responseInProgress = false;
    conversation.setMicMuted(false);
    this.#emit({
      timestampMs: this.#dependencies.now(),
      turnId: this.#turnId,
      type: "recording-started",
    });
  }

  public async finishTurn(): Promise<void> {
    this.#requireConversation().setMicMuted(true);
  }

  public async dispose(): Promise<void> {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.#connected = false;
    const conversation = this.#conversation;
    this.#conversation = null;
    if (conversation) {
      await conversation.endSession();
    }
  }

  async #establishConnection(): Promise<void> {
    const tokenResponse = await this.#dependencies.fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "x-voice-experiment": "elevenlabs-brunch" },
    });
    if (!tokenResponse.ok) {
      throw new Error("The ElevenLabs voice session could not be started.");
    }

    const tokenBody = asRecord(await tokenResponse.json());
    const conversationToken = getString(tokenBody, "conversationToken");
    if (!conversationToken) {
      throw new Error(
        "The ElevenLabs voice session returned an invalid token.",
      );
    }

    const permissionStream = await this.#dependencies.getUserMedia({
      audio: true,
    });
    for (const track of permissionStream.getTracks()) {
      track.stop();
    }

    const conversation = await this.#dependencies.startSession({
      connectionType: "webrtc",
      conversationToken,
      onConnect: () => {
        if (this.#disposed) {
          return;
        }
        this.#connected = true;
        this.#emit({
          timestampMs: this.#dependencies.now(),
          type: "connected",
        });
      },
      onConversationCreated: (createdConversation) => {
        this.#conversation = createdConversation;
        createdConversation.setMicMuted(true);
      },
      onDisconnect: ({ reason }) => {
        this.#connected = false;
        if (!this.#disposed && reason === "error") {
          this.#emitError("The ElevenLabs voice connection was lost.");
        }
      },
      onError: () => {
        if (!this.#disposed) {
          this.#emitError("The ElevenLabs voice connection failed.");
        }
      },
      onInterruption: () => {
        this.#responseInProgress = false;
      },
      onMessage: ({ message, role }) => {
        if (!message.trim() || this.#disposed) {
          return;
        }
        const turnId = Math.max(this.#turnId, 1);
        if (role === "user") {
          this.#emit({
            speaker: "expert",
            timestampMs: this.#dependencies.now(),
            transcript: message,
            turnId,
            type: "final-transcript",
          });
          return;
        }

        this.#emitResponseStarted(turnId);
        this.#emit({
          speaker: "assistant",
          timestampMs: this.#dependencies.now(),
          transcript: message,
          turnId,
          type: "final-transcript",
        });
        this.#emit({
          responseText: message,
          timestampMs: this.#dependencies.now(),
          turnId,
          type: "response-completed",
        });
        this.#responseInProgress = false;
      },
      onModeChange: ({ mode }) => {
        if (mode === "speaking" && !this.#disposed) {
          this.#emitResponseStarted(Math.max(this.#turnId, 1));
        }
      },
    });

    this.#conversation = conversation;
    if (this.#disposed) {
      await conversation.endSession();
      this.#conversation = null;
    }
  }

  #emitResponseStarted(turnId: number): void {
    if (this.#responseInProgress) {
      return;
    }
    this.#responseInProgress = true;
    this.#emit({
      timestampMs: this.#dependencies.now(),
      turnId,
      type: "response-started",
    });
  }

  #requireConversation(): ConversationControl {
    if (!this.#connected || !this.#conversation || this.#disposed) {
      throw new Error("The ElevenLabs voice session is not connected.");
    }
    return this.#conversation;
  }

  #emit(event: VoiceExperimentEvent): void {
    for (const listener of this.#listeners) {
      listener(event);
    }
  }

  #emitError(message: string): void {
    this.#emit({
      message,
      timestampMs: this.#dependencies.now(),
      type: "error",
    });
  }
}

export const createElevenLabsAdapter = (
  dependencies: Partial<ElevenLabsAdapterDependencies> = {},
): VoiceExperimentAdapter =>
  new ElevenLabsAdapter({ ...defaultDependencies, ...dependencies });
