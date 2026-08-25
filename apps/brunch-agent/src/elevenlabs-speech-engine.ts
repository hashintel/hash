import type { SpeechEngineCallbacks } from "@elevenlabs/elevenlabs-js";

type TranscriptMessage = {
  content: string;
  role: "agent" | "user";
};

type VoiceBridge = {
  release(conversationId: string): void;
  respond(input: {
    conversationId: string;
    signal: AbortSignal;
    transcript: string;
  }): AsyncIterable<string>;
};

type CallbackDependencies = {
  bridge: VoiceBridge;
  log?: (reason: string, context?: Record<string, unknown>) => void;
};

type VoiceSession = {
  conversationId?: string;
  sendResponse(response: AsyncIterable<string>): Promise<void>;
};

type QueuedVoiceTurn = {
  session: VoiceSession;
  signal: AbortSignal;
  transcript: string;
};

type VoiceTurnState = {
  active: Promise<void> | null;
  lastCompletedTranscript: string | null;
  queued: QueuedVoiceTurn | null;
};

const MAX_TRANSCRIPT_CHARACTERS = 12_000;

const normalizeTranscript = (transcript: string): string => {
  let sanitized = "";
  for (const character of transcript.normalize("NFKC")) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (
      codePoint === 9 ||
      codePoint === 10 ||
      codePoint === 13 ||
      codePoint >= 32
    ) {
      sanitized += character;
    }
  }

  return sanitized
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, MAX_TRANSCRIPT_CHARACTERS);
};

const latestUserTranscript = (transcript: TranscriptMessage[]): string => {
  for (let index = transcript.length - 1; index >= 0; index -= 1) {
    const message = transcript[index];
    if (message?.role === "user") {
      return normalizeTranscript(message.content);
    }
  }
  return "";
};

const defaultLog = (reason: string, context: Record<string, unknown> = {}) => {
  // Provider transcript, response text, and secrets must never be logged here.
  console.error(`[ElevenLabs Speech Engine] ${reason}`, context);
};

export const speechEngineTurnConfig = {
  turnEagerness: "patient",
  turnModel: "turn_v3",
  turnTimeout: 10,
} as const;

export const speechEngineOverrides = {
  firstMessage: true,
} as const;

type SpeechEngineConfigClient = {
  update(
    speechEngineId: string,
    request: {
      overrides: typeof speechEngineOverrides;
      turn: typeof speechEngineTurnConfig;
    },
  ): Promise<unknown>;
};

export const applySpeechEngineInterviewConfig = async ({
  speechEngine,
  speechEngineId,
}: {
  speechEngine: SpeechEngineConfigClient;
  speechEngineId: string;
}): Promise<void> => {
  await speechEngine.update(speechEngineId, {
    overrides: speechEngineOverrides,
    turn: speechEngineTurnConfig,
  });
};

export const createElevenLabsSpeechEngineCallbacks = ({
  bridge,
  log = defaultLog,
}: CallbackDependencies): SpeechEngineCallbacks => {
  const turnStateByConversationId = new Map<string, VoiceTurnState>();

  const startTurn = (
    conversationId: string,
    state: VoiceTurnState,
    turn: QueuedVoiceTurn,
  ): void => {
    const active = turn.session
      .sendResponse(
        bridge.respond({
          conversationId,
          signal: turn.signal,
          transcript: turn.transcript,
        }),
      )
      .then(() => {
        if (!turn.signal.aborted) {
          state.lastCompletedTranscript = turn.transcript;
        }
      })
      .catch((error: unknown) => {
        if (!turn.signal.aborted) {
          log("Could not stream the Brunch voice response", {
            errorName: error instanceof Error ? error.name : "unknown",
          });
        }
      })
      .finally(() => {
        if (state.active !== active) {
          return;
        }
        state.active = null;
        const queued = state.queued;
        state.queued = null;
        if (
          queued &&
          !queued.signal.aborted &&
          queued.transcript !== state.lastCompletedTranscript
        ) {
          startTurn(conversationId, state, queued);
        }
      });
    state.active = active;
  };

  const release = (conversationId: string | undefined): void => {
    if (!conversationId) {
      return;
    }
    turnStateByConversationId.delete(conversationId);
    bridge.release(conversationId);
  };

  return {
    debug: process.env.NODE_ENV !== "production",
    onTranscript(transcript, signal, session) {
      const conversationId = session.conversationId;
      if (!conversationId) {
        log("Rejected transcript before session initialization");
        return;
      }
      const userTurn = latestUserTranscript(transcript);
      if (!userTurn) {
        return;
      }

      const state = turnStateByConversationId.get(conversationId) ?? {
        active: null,
        lastCompletedTranscript: null,
        queued: null,
      };
      turnStateByConversationId.set(conversationId, state);
      if (userTurn === state.lastCompletedTranscript) {
        return;
      }

      const turn = { session, signal, transcript: userTurn };
      if (state.active) {
        state.queued = turn;
        return;
      }
      startTurn(conversationId, state, turn);
    },
    onClose(session) {
      release(session.conversationId);
    },
    onDisconnect(session) {
      release(session.conversationId);
    },
    onError(error) {
      log("Speech Engine session failed", { errorName: error.name });
    },
  };
};
