import type { HarnessReplyEvent } from "@hashintel/brunch-agent";

const VOICE_CONVERSATION_PREFIX = "voice:";
const TRUSTED_EXPERIMENT = "elevenlabs-brunch";
const MAX_SESSIONS = 100;
const MAX_EVENTS_PER_SESSION = 50;
const MAX_IDENTIFIER_CHARACTERS = 96;
const MAX_SUMMARY_CHARACTERS = 240;
const MAX_TRANSCRIPT_CHARACTERS = 4_000;
const MAX_CAPTURE_VALUE_CHARACTERS = 500;
const providerConversationIdPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;

type VoiceCaptureDiagnostic = {
  readonly captureId: string;
  readonly input: Record<string, string | string[]>;
  readonly toolName: string;
};

export type VoiceToolDiagnostic = {
  readonly argumentSummary: string;
  readonly callId: string;
  readonly capture?: VoiceCaptureDiagnostic;
  readonly sequence: number;
  readonly timestampMs: number;
  readonly toolName: string;
  readonly turnId: number;
};

export type VoiceTranscriptDiagnostic = {
  readonly sequence: number;
  readonly speaker: "assistant" | "expert";
  readonly timestampMs: number;
  readonly transcript: string;
  readonly turnId: number;
  readonly type: "final-transcript" | "partial-transcript";
};

export type VoiceProjectionReadyDiagnostic = {
  readonly callId: string;
  readonly sequence: number;
  readonly timestampMs: number;
  readonly type: "projection-ready";
};

export type VoiceDiagnosticEvent =
  | VoiceProjectionReadyDiagnostic
  | VoiceToolDiagnostic
  | VoiceTranscriptDiagnostic;

type DiagnosticSession = {
  events: VoiceDiagnosticEvent[];
  nextSequence: number;
  nextTurnId: number;
  toolNameByCallId: Map<string, string>;
};

type VoiceExperimentDiagnosticsDependencies = {
  now: () => number;
};

const defaultDependencies: VoiceExperimentDiagnosticsDependencies = {
  now: () => Date.now(),
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;

const boundedText = (value: unknown, limit: number): string => {
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

const safeIdentifier = (value: string, fallback: string): string =>
  boundedText(value, MAX_IDENTIFIER_CHARACTERS) || fallback;

const summarizeToolInput = (toolName: string, input: unknown): string => {
  if (toolName === "brunch_ask") {
    const question = boundedText(
      asRecord(input)?.question,
      MAX_SUMMARY_CHARACTERS - "Question: ".length,
    );
    return question ? `Question: ${question}` : "Question unavailable";
  }

  if (toolName === "brunch_sweep") {
    return "Settlement requested";
  }

  return "Arguments hidden";
};

const capturePropertiesByToolName = {
  record_model_requirement: ["category", "description"],
  record_process_decision: ["condition", "outcomes"],
  record_process_flow: ["condition", "from", "to"],
  record_process_state: ["category", "description", "name", "tokenDescription"],
  record_process_step: ["description", "name", "owner", "timing", "trigger"],
} as const;

const createCaptureDiagnostic = ({
  callId,
  input,
  toolName,
}: {
  callId: string;
  input: unknown;
  toolName: string;
}): VoiceCaptureDiagnostic | null => {
  if (!Object.hasOwn(capturePropertiesByToolName, toolName)) {
    return null;
  }
  const inputRecord = asRecord(input);
  if (!inputRecord) {
    return null;
  }
  const properties =
    capturePropertiesByToolName[
      toolName as keyof typeof capturePropertiesByToolName
    ];
  const sanitizedInput: Record<string, string | string[]> = {};
  for (const property of properties) {
    const value = inputRecord[property];
    if (typeof value === "string") {
      const sanitized = boundedText(value, MAX_CAPTURE_VALUE_CHARACTERS);
      if (sanitized) {
        sanitizedInput[property] = sanitized;
      }
    } else if (Array.isArray(value)) {
      const sanitized = value
        .map((item) => boundedText(item, MAX_CAPTURE_VALUE_CHARACTERS))
        .filter(Boolean)
        .slice(0, 20);
      if (sanitized.length > 0) {
        sanitizedInput[property] = sanitized;
      }
    }
  }
  if (Object.keys(sanitizedInput).length === 0) {
    return null;
  }

  return {
    captureId: `capture-${callId}`,
    input: sanitizedInput,
    toolName,
  };
};

export class VoiceExperimentDiagnostics {
  readonly #dependencies: VoiceExperimentDiagnosticsDependencies;
  readonly #sessions = new Map<string, DiagnosticSession>();

  public constructor(
    dependencies: Partial<VoiceExperimentDiagnosticsDependencies> = {},
  ) {
    this.#dependencies = { ...defaultDependencies, ...dependencies };
  }

  public beginTurn(conversationId: string): number {
    if (!conversationId.startsWith(VOICE_CONVERSATION_PREFIX)) {
      return 0;
    }

    const session = this.#sessionFor(conversationId);
    session.nextTurnId += 1;
    return session.nextTurnId;
  }

  public recordTranscript(
    conversationId: string,
    event: {
      isPartial: boolean;
      speaker: "assistant" | "expert";
      transcript: string;
      turnId: number;
    },
  ): void {
    if (
      !conversationId.startsWith(VOICE_CONVERSATION_PREFIX) ||
      !Number.isSafeInteger(event.turnId) ||
      event.turnId < 1
    ) {
      return;
    }

    const transcript = boundedText(event.transcript, MAX_TRANSCRIPT_CHARACTERS);
    if (!transcript) {
      return;
    }

    const session = this.#sessionFor(conversationId);
    const type = event.isPartial ? "partial-transcript" : "final-transcript";
    const last = session.events.at(-1);
    if (last && "speaker" in last && last.speaker === event.speaker) {
      if (last.transcript === transcript && last.type === type) {
        return;
      }

      const keepSequence =
        last.type === "partial-transcript" && event.isPartial;
      if (!keepSequence) {
        session.nextSequence += 1;
      }
      session.events[session.events.length - 1] = {
        sequence: keepSequence ? last.sequence : session.nextSequence,
        speaker: event.speaker,
        timestampMs: this.#dependencies.now(),
        transcript,
        turnId: event.turnId,
        type,
      };
      return;
    }

    session.nextSequence += 1;
    session.events.push({
      sequence: session.nextSequence,
      speaker: event.speaker,
      timestampMs: this.#dependencies.now(),
      transcript,
      turnId: event.turnId,
      type,
    });
    session.events = session.events.slice(-MAX_EVENTS_PER_SESSION);
  }

  public recordToolCall(
    conversationId: string,
    turnId: number,
    event: Pick<
      Extract<HarnessReplyEvent, { type: "tool-input" }>,
      "input" | "toolCallId" | "toolName"
    >,
  ): void {
    if (
      !conversationId.startsWith(VOICE_CONVERSATION_PREFIX) ||
      !Number.isSafeInteger(turnId) ||
      turnId < 1
    ) {
      return;
    }

    const session = this.#sessionFor(conversationId);
    session.nextSequence += 1;
    const toolName = safeIdentifier(event.toolName, "unknown-tool");
    const callId = safeIdentifier(event.toolCallId, "unknown-call");
    const capture = createCaptureDiagnostic({
      callId,
      input: event.input,
      toolName,
    });
    session.toolNameByCallId.set(callId, toolName);
    session.events.push({
      argumentSummary: summarizeToolInput(toolName, event.input),
      callId,
      ...(capture ? { capture } : {}),
      sequence: session.nextSequence,
      timestampMs: this.#dependencies.now(),
      toolName,
      turnId,
    });
    session.events = session.events.slice(-MAX_EVENTS_PER_SESSION);
  }

  public recordToolOutput(
    conversationId: string,
    event: Pick<
      Extract<HarnessReplyEvent, { type: "tool-output" }>,
      "output" | "toolCallId"
    >,
  ): void {
    if (!conversationId.startsWith(VOICE_CONVERSATION_PREFIX)) {
      return;
    }
    const session = this.#sessionFor(conversationId);
    const callId = safeIdentifier(event.toolCallId, "unknown-call");
    const toolName = session.toolNameByCallId.get(callId);
    session.toolNameByCallId.delete(callId);
    if (
      toolName !== "brunch_sweep" ||
      asRecord(event.output)?.status !== "applied"
    ) {
      return;
    }

    session.nextSequence += 1;
    session.events.push({
      callId,
      sequence: session.nextSequence,
      timestampMs: this.#dependencies.now(),
      type: "projection-ready",
    });
    session.events = session.events.slice(-MAX_EVENTS_PER_SESSION);
  }

  public read(providerConversationId: string, afterSequence: number) {
    const session = this.#sessions.get(
      `${VOICE_CONVERSATION_PREFIX}${providerConversationId}`,
    );
    return (
      session?.events.filter(({ sequence }) => sequence > afterSequence) ?? []
    );
  }

  #sessionFor(conversationId: string): DiagnosticSession {
    const existing = this.#sessions.get(conversationId);
    if (existing) {
      return existing;
    }

    if (this.#sessions.size >= MAX_SESSIONS) {
      const oldest = this.#sessions.keys().next().value as string | undefined;
      if (oldest) {
        this.#sessions.delete(oldest);
      }
    }

    const session: DiagnosticSession = {
      events: [],
      nextSequence: 0,
      nextTurnId: 0,
      toolNameByCallId: new Map(),
    };
    this.#sessions.set(conversationId, session);
    return session;
  }
}

const jsonResponse = (body: unknown, status = 200): Response =>
  Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });

export const createVoiceExperimentDiagnosticsHandler =
  (diagnostics: VoiceExperimentDiagnostics) =>
  async (request: Request): Promise<Response> => {
    if (request.method !== "GET") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }
    if (request.headers.get("x-voice-experiment") !== TRUSTED_EXPERIMENT) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    const url = new URL(request.url);
    const conversationId = url.searchParams.get("conversationId") ?? "";
    const afterText = url.searchParams.get("after") ?? "0";
    const after = Number(afterText);
    if (
      !providerConversationIdPattern.test(conversationId) ||
      !/^\d+$/u.test(afterText) ||
      !Number.isSafeInteger(after) ||
      after < 0
    ) {
      return jsonResponse({ error: "Invalid diagnostic query" }, 400);
    }

    return jsonResponse({ events: diagnostics.read(conversationId, after) });
  };

export const voiceExperimentDiagnostics = new VoiceExperimentDiagnostics();
export const voiceExperimentDiagnosticsHandler =
  createVoiceExperimentDiagnosticsHandler(voiceExperimentDiagnostics);
