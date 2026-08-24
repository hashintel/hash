import type { HarnessReplyEvent } from "@hashintel/brunch-agent";

const VOICE_CONVERSATION_PREFIX = "voice:";
const TRUSTED_EXPERIMENT = "elevenlabs-brunch";
const MAX_SESSIONS = 100;
const MAX_EVENTS_PER_SESSION = 50;
const MAX_IDENTIFIER_CHARACTERS = 96;
const MAX_SUMMARY_CHARACTERS = 240;
const providerConversationIdPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;

export type VoiceToolDiagnostic = {
  readonly argumentSummary: string;
  readonly callId: string;
  readonly sequence: number;
  readonly timestampMs: number;
  readonly toolName: string;
  readonly turnId: number;
};

type DiagnosticSession = {
  events: VoiceToolDiagnostic[];
  nextSequence: number;
  nextTurnId: number;
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
    session.events.push({
      argumentSummary: summarizeToolInput(toolName, event.input),
      callId: safeIdentifier(event.toolCallId, "unknown-call"),
      sequence: session.nextSequence,
      timestampMs: this.#dependencies.now(),
      toolName,
      turnId,
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
