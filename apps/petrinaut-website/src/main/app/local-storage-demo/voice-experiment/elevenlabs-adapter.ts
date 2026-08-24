import type { VoiceExperimentAdapter } from "./voice-experiment-adapter";
import type { VoiceExperimentEvent } from "./voice-experiment-events";

const TOKEN_ENDPOINT = "/api/voice-experiment/elevenlabs-conversation-token";
const DIAGNOSTICS_ENDPOINT =
  "/api/voice-experiment/elevenlabs-brunch-diagnostics";
const DIAGNOSTICS_POLL_INTERVAL_MS = 500;

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
  clearInterval: (handle: ReturnType<typeof globalThis.setInterval>) => void;
  fetch: typeof globalThis.fetch;
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  now: () => number;
  setInterval: (
    callback: () => void,
    intervalMs: number,
  ) => ReturnType<typeof globalThis.setInterval>;
  startSession: (options: SessionOptions) => Promise<ConversationControl>;
};

const defaultDependencies: ElevenLabsAdapterDependencies = {
  clearInterval: (handle) => globalThis.clearInterval(handle),
  fetch: (...args) => globalThis.fetch(...args),
  getUserMedia: (constraints) =>
    navigator.mediaDevices.getUserMedia(constraints),
  now: () => Date.now(),
  setInterval: (callback, intervalMs) =>
    globalThis.setInterval(callback, intervalMs),
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

const boundedDiagnosticText = (value: unknown, limit: number): string => {
  if (typeof value !== "string") {
    return "";
  }
  let sanitized = "";
  for (const character of value.normalize("NFKC")) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint >= 32 && codePoint !== 127) {
      sanitized += character;
    }
  }
  return sanitized.replace(/\s+/gu, " ").trim().slice(0, limit);
};

const parseToolDiagnostic = (
  value: unknown,
):
  | ({ sequence: number } & Extract<
      VoiceExperimentEvent,
      { type: "tool-called" }
    >)
  | null => {
  const record = asRecord(value);
  const sequence = record?.sequence;
  const timestampMs = record?.timestampMs;
  const turnId = record?.turnId;
  const toolName = boundedDiagnosticText(record?.toolName, 96);
  const callId = boundedDiagnosticText(record?.callId, 96);
  const argumentSummary = boundedDiagnosticText(record?.argumentSummary, 240);
  if (
    !Number.isSafeInteger(sequence) ||
    Number(sequence) < 1 ||
    typeof timestampMs !== "number" ||
    !Number.isFinite(timestampMs) ||
    !Number.isSafeInteger(turnId) ||
    Number(turnId) < 1 ||
    !toolName ||
    !callId ||
    !argumentSummary
  ) {
    return null;
  }

  return {
    argumentSummary,
    callId,
    sequence: Number(sequence),
    timestampMs,
    toolName,
    turnId: Number(turnId),
    type: "tool-called",
  };
};

class ElevenLabsAdapter implements VoiceExperimentAdapter {
  readonly #dependencies: ElevenLabsAdapterDependencies;
  readonly #listeners = new Set<(event: VoiceExperimentEvent) => void>();

  #connectPromise: Promise<void> | null = null;
  #connected = false;
  #conversation: ConversationControl | null = null;
  #diagnosticConversationId: string | null = null;
  #diagnosticCursor = 0;
  #diagnosticPollHandle: ReturnType<typeof globalThis.setInterval> | null =
    null;
  #diagnosticPollInFlight = false;
  #disposed = false;
  #hasConnected = false;
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
    // React Strict Mode probes effect cleanup before the first real mount.
    // Re-arm an adapter that was disposed before it ever owned a session.
    if (this.#disposed && !this.#hasConnected) {
      this.#disposed = false;
    }
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
    this.#stopDiagnosticsPolling();
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

    let providerConnected = false;
    let readinessSettled = false;
    let resolveReady: () => void = () => undefined;
    let rejectReady: (error: Error) => void = () => undefined;
    const ready = new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    const markReadyIfConnected = () => {
      if (
        readinessSettled ||
        !providerConnected ||
        !this.#conversation ||
        this.#disposed
      ) {
        return;
      }
      readinessSettled = true;
      this.#connected = true;
      this.#hasConnected = true;
      this.#emit({
        timestampMs: this.#dependencies.now(),
        type: "connected",
      });
      resolveReady();
    };
    const failBeforeConnected = (message: string) => {
      if (!readinessSettled) {
        readinessSettled = true;
        rejectReady(new Error(message));
      }
    };
    const setConversation = (createdConversation: ConversationControl) => {
      if (this.#conversation !== createdConversation) {
        this.#conversation = createdConversation;
        createdConversation.setMicMuted(true);
      }
      markReadyIfConnected();
    };

    const conversation = await this.#dependencies.startSession({
      connectionType: "webrtc",
      conversationToken,
      onConnect: ({ conversationId }) => {
        if (this.#disposed) {
          return;
        }
        providerConnected = true;
        this.#startDiagnosticsPolling(conversationId);
        markReadyIfConnected();
      },
      onConversationCreated: (createdConversation) => {
        setConversation(createdConversation);
      },
      onDisconnect: ({ reason }) => {
        this.#connected = false;
        this.#stopDiagnosticsPolling();
        failBeforeConnected(
          "The ElevenLabs voice connection closed before it was ready.",
        );
        if (!this.#disposed && reason === "error") {
          this.#emitError("The ElevenLabs voice connection was lost.");
        }
      },
      onError: () => {
        if (!this.#disposed) {
          failBeforeConnected("The ElevenLabs voice connection failed.");
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

    setConversation(conversation);
    if (this.#disposed) {
      await conversation.endSession();
      this.#conversation = null;
      readinessSettled = true;
      resolveReady();
      return;
    }

    await ready;
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

  #startDiagnosticsPolling(conversationId: string): void {
    this.#stopDiagnosticsPolling();
    this.#diagnosticConversationId = conversationId;
    this.#diagnosticCursor = 0;
    this.#diagnosticPollHandle = this.#dependencies.setInterval(() => {
      void this.#pollDiagnostics();
    }, DIAGNOSTICS_POLL_INTERVAL_MS);
  }

  #stopDiagnosticsPolling(): void {
    if (this.#diagnosticPollHandle !== null) {
      this.#dependencies.clearInterval(this.#diagnosticPollHandle);
    }
    this.#diagnosticPollHandle = null;
    this.#diagnosticConversationId = null;
    this.#diagnosticPollInFlight = false;
  }

  async #pollDiagnostics(): Promise<void> {
    const conversationId = this.#diagnosticConversationId;
    if (!conversationId || this.#diagnosticPollInFlight || this.#disposed) {
      return;
    }

    this.#diagnosticPollInFlight = true;
    try {
      const query = new URLSearchParams({
        conversationId,
        after: String(this.#diagnosticCursor),
      });
      const response = await this.#dependencies.fetch(
        `${DIAGNOSTICS_ENDPOINT}?${query}`,
        { headers: { "x-voice-experiment": "elevenlabs-brunch" } },
      );
      if (!response.ok || this.#diagnosticConversationId !== conversationId) {
        return;
      }

      const body = asRecord(await response.json());
      if (!Array.isArray(body?.events)) {
        return;
      }
      for (const value of body.events) {
        const diagnostic = parseToolDiagnostic(value);
        if (!diagnostic || diagnostic.sequence <= this.#diagnosticCursor) {
          continue;
        }
        this.#diagnosticCursor = diagnostic.sequence;
        const { sequence: _sequence, ...event } = diagnostic;
        this.#emit(event);
      }
    } catch {
      // Diagnostics are non-authoritative and must never disrupt voice turns.
    } finally {
      this.#diagnosticPollInFlight = false;
    }
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
