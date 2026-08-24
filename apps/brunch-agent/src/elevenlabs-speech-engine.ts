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

export const createElevenLabsSpeechEngineCallbacks = ({
  bridge,
  log = defaultLog,
}: CallbackDependencies): SpeechEngineCallbacks => ({
  debug: process.env.NODE_ENV !== "production",
  onTranscript(transcript, signal, session) {
    const conversationId = session.conversationId;
    if (!conversationId) {
      log("Rejected transcript before session initialization");
      return;
    }
    const userTurn = latestUserTranscript(transcript);
    const response = userTurn
      ? bridge.respond({
          conversationId,
          signal,
          transcript: userTurn,
        })
      : "I didn't catch that. Please hold the button and try again.";

    void session.sendResponse(response).catch((error: unknown) => {
      if (!signal.aborted) {
        log("Could not stream the Brunch voice response", {
          errorName: error instanceof Error ? error.name : "unknown",
        });
      }
    });
  },
  onClose(session) {
    if (session.conversationId) {
      bridge.release(session.conversationId);
    }
  },
  onDisconnect(session) {
    if (session.conversationId) {
      bridge.release(session.conversationId);
    }
  },
  onError(error) {
    log("Speech Engine session failed", { errorName: error.name });
  },
});
