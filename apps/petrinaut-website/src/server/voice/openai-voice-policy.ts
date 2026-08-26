export const OPENAI_REALTIME_CONNECTION_TIMEOUT_MS = 15_000;
export const OPENAI_TRANSCRIPTION_POLICY_VERSION = "process-modeling-en-v1";

interface VoiceEnvironment {
  readonly NODE_ENV?: string;
  readonly OPENAI_VOICE_API_KEY?: string;
  readonly PETRINAUT_OPENAI_VOICE_ENABLED?: string;
  readonly VERCEL_ENV?: string;
}

const isNonProductionRuntime = (environment: VoiceEnvironment): boolean =>
  environment.VERCEL_ENV === "preview" ||
  environment.VERCEL_ENV === "development" ||
  (environment.VERCEL_ENV === undefined &&
    environment.NODE_ENV !== "production");

export const getOpenAIVoiceAvailability = (environment: VoiceEnvironment) => ({
  available:
    isNonProductionRuntime(environment) &&
    environment.PETRINAUT_OPENAI_VOICE_ENABLED === "true" &&
    Boolean(environment.OPENAI_VOICE_API_KEY?.trim()),
  connectionTimeoutMs: OPENAI_REALTIME_CONNECTION_TIMEOUT_MS,
});

export const createOpenAITranscriptionSession = () => ({
  type: "transcription" as const,
  audio: {
    input: {
      transcription: {
        model: "gpt-live-transcribe",
        prompt:
          "Transcribe an English domain-expert interview about process models. Preserve the supplied technical vocabulary verbatim.",
        keywords: [
          "SDCPN",
          "stochastic",
          "Petri net",
          "place",
          "transition",
          "arc",
          "token",
          "marking",
          "guard",
          "rate",
          "distribution",
          "parameter",
          "subnet",
          "scenario",
          "metric",
        ],
        languages: ["en"],
      },
      turn_detection: {
        type: "semantic_vad" as const,
        eagerness: "low" as const,
      },
    },
  },
});
