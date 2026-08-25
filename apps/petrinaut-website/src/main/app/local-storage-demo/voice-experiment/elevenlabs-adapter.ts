import { createInterviewCapture } from "./interview-draft";
import { interviewOpeningQuestion } from "./interview-opening";

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
  overrides: {
    agent: {
      firstMessage: string;
    };
  };
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

const parseTranscriptDiagnostic = (
  value: unknown,
):
  | ({ sequence: number } & Extract<
      VoiceExperimentEvent,
      { type: "final-transcript" | "partial-transcript" }
    >)
  | null => {
  const record = asRecord(value);
  const sequence = record?.sequence;
  const timestampMs = record?.timestampMs;
  const turnId = record?.turnId;
  const type = getString(record, "type");
  const speaker = getString(record, "speaker");
  const transcript = boundedDiagnosticText(record?.transcript, 4_000);
  if (
    !Number.isSafeInteger(sequence) ||
    Number(sequence) < 1 ||
    typeof timestampMs !== "number" ||
    !Number.isFinite(timestampMs) ||
    !Number.isSafeInteger(turnId) ||
    Number(turnId) < 1 ||
    (type !== "final-transcript" && type !== "partial-transcript") ||
    (speaker !== "assistant" && speaker !== "expert") ||
    !transcript
  ) {
    return null;
  }

  return {
    sequence: Number(sequence),
    speaker,
    timestampMs,
    transcript,
    turnId: Number(turnId),
    type,
  };
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
  const captureRecord = asRecord(record?.capture);
  const capture =
    getString(captureRecord, "toolName") === toolName
      ? createInterviewCapture({
          captureId:
            getString(captureRecord, "captureId") ?? `capture-${callId}`,
          input: captureRecord?.input,
          toolName,
        })
      : null;

  return {
    argumentSummary,
    callId,
    ...(capture ? { capture } : {}),
    sequence: Number(sequence),
    timestampMs,
    toolName,
    turnId: Number(turnId),
    type: "tool-called",
  };
};

const parseProjectionReadyDiagnostic = (
  value: unknown,
):
  | ({ sequence: number } & Extract<
      VoiceExperimentEvent,
      { type: "projection-ready" }
    >)
  | null => {
  const record = asRecord(value);
  const sequence = record?.sequence;
  const timestampMs = record?.timestampMs;
  const callId = boundedDiagnosticText(record?.callId, 96);
  if (
    getString(record, "type") !== "projection-ready" ||
    !Number.isSafeInteger(sequence) ||
    Number(sequence) < 1 ||
    typeof timestampMs !== "number" ||
    !Number.isFinite(timestampMs) ||
    !callId
  ) {
    return null;
  }

  return {
    callId,
    sequence: Number(sequence),
    timestampMs,
    type: "projection-ready",
  };
};

const parseDiagnosticEvent = (
  value: unknown,
):
  | ({ sequence: number } & Extract<
      VoiceExperimentEvent,
      | { type: "final-transcript" | "partial-transcript" }
      | { type: "projection-ready" }
      | { type: "tool-called" }
    >)
  | null =>
  parseTranscriptDiagnostic(value) ??
  parseToolDiagnostic(value) ??
  parseProjectionReadyDiagnostic(value);

class ElevenLabsAdapter implements VoiceExperimentAdapter {
  readonly #dependencies: ElevenLabsAdapterDependencies;
  readonly #listeners = new Set<(event: VoiceExperimentEvent) => void>();

  #awaitingBrunchResponse = false;
  #connectPromise: Promise<void> | null = null;
  #connected = false;
  #conversation: ConversationControl | null = null;
  #diagnosticConversationId: string | null = null;
  #diagnosticCursor = 0;
  #diagnosticPollHandle: ReturnType<typeof globalThis.setInterval> | null =
    null;
  #diagnosticPollInFlight = false;
  #disposed = false;
  #hasEmittedOpeningQuestion = false;
  #isListening = false;
  #isMicrophoneMuted = true;
  #providerMode: "listening" | "speaking" = "listening";
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
    if (this.#disposed) {
      this.#awaitingBrunchResponse = false;
      this.#disposed = false;
      this.#hasEmittedOpeningQuestion = false;
      this.#isListening = false;
      this.#isMicrophoneMuted = true;
      this.#providerMode = "listening";
      this.#responseInProgress = false;
      this.#turnId = 0;
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
    this.#requireConversation();
    if (this.#isListening) {
      return;
    }

    this.#isListening = true;
    this.#turnId += 1;
    this.#responseInProgress = this.#providerMode === "speaking";
    this.#setMicrophoneMuted(this.#providerMode === "speaking");
    this.#emit({
      timestampMs: this.#dependencies.now(),
      turnId: this.#turnId,
      type: "recording-started",
    });
  }

  public async finishTurn(): Promise<void> {
    // Start/stop owns the session; Speech Engine owns each spoken turn.
    this.#requireConversation();
  }

  public async dispose(): Promise<void> {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.#awaitingBrunchResponse = false;
    this.#connected = false;
    this.#isListening = false;
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
      this.#emit({
        ...(this.#diagnosticConversationId
          ? { conversationId: this.#diagnosticConversationId }
          : {}),
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
        this.#isMicrophoneMuted = true;
      }
      markReadyIfConnected();
    };

    const conversation = await this.#dependencies.startSession({
      connectionType: "webrtc",
      conversationToken,
      overrides: {
        agent: {
          firstMessage: interviewOpeningQuestion,
        },
      },
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
        if (role === "user" && message.trim() && !this.#disposed) {
          // A finalized expert answer closes the listening window before the
          // silent Brunch latency period, preventing a second admitted turn.
          this.#awaitingBrunchResponse = true;
          this.#setMicrophoneMuted(true);
          return;
        }
        if (
          this.#disposed ||
          role !== "agent" ||
          this.#hasEmittedOpeningQuestion ||
          !message.trim()
        ) {
          return;
        }

        this.#setMicrophoneMuted(true);
        this.#hasEmittedOpeningQuestion = true;
        const turnId = Math.max(this.#turnId, 1);
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
        this.#providerMode = mode;
        if (mode === "speaking" && !this.#disposed) {
          this.#awaitingBrunchResponse = false;
          this.#setMicrophoneMuted(true);
          this.#emitResponseStarted(Math.max(this.#turnId, 1));
        } else if (
          mode === "listening" &&
          this.#isListening &&
          !this.#awaitingBrunchResponse
        ) {
          this.#setMicrophoneMuted(false);
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
        const diagnostic = parseDiagnosticEvent(value);
        if (!diagnostic || diagnostic.sequence <= this.#diagnosticCursor) {
          continue;
        }
        this.#diagnosticCursor = diagnostic.sequence;
        const { sequence: _sequence, ...event } = diagnostic;
        if (
          event.type === "partial-transcript" ||
          event.type === "final-transcript"
        ) {
          if (event.speaker === "assistant") {
            this.#emitResponseStarted(event.turnId);
          }
          this.#emit(event);
          if (
            event.type === "final-transcript" &&
            event.speaker === "assistant"
          ) {
            this.#emit({
              responseText: event.transcript,
              timestampMs: event.timestampMs,
              turnId: event.turnId,
              type: "response-completed",
            });
            this.#responseInProgress = false;
          }
          continue;
        }
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

  #setMicrophoneMuted(isMuted: boolean): void {
    if (!this.#conversation || this.#isMicrophoneMuted === isMuted) {
      return;
    }
    this.#conversation.setMicMuted(isMuted);
    this.#isMicrophoneMuted = isMuted;
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
