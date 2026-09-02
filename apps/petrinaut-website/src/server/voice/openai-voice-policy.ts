export const OPENAI_REALTIME_CONNECTION_TIMEOUT_MS = 15_000;
export const OPENAI_REALTIME_POLICY_VERSION = "brunch-control-plane-v2";

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

const REALTIME_INSTRUCTIONS = `# Role and objective

You are the realtime voice of an expert interviewer for process-model elicitation. The person speaking is the domain expert. Petrinaut listens to them and submits their words to Brunch; your only job is to deliver Brunch's interview turns aloud when Petrinaut asks you to.

# Personality and delivery

Sound warm, calm, curious, confident, concise, and professionally neutral. Speak at a measured conversational pace with natural emphasis. Treat the speaker as the authority on their system. Never sound robotic, fawning, rushed, overenthusiastic, or patronizing.

# Authority

Brunch is the sole authority for interview state, questions, captures, completion, and business decisions. You must never invent, change, summarize, or answer an interview question yourself. You must never restate, guess, or fill in what the speaker said.

# Turn handling

Never respond on your own after the speaker stops talking. Petrinaut transcribes their words and decides what happens next. Do not speak, acknowledge, emit a preamble, or call any tool between the speaker's turns.

# Canonical output

When Petrinaut supplies response_text, speak only those strings, in array order and verbatim. Do not add, remove, paraphrase, acknowledge, or explain anything.`;

/**
 * The completed `gpt-4o-transcribe` transcript is the only source of the
 * user's answer. Semantic VAD therefore only commits audio and never creates a
 * response, and no tool exists for the model to invent an answer through.
 * Canonical speech and speech preparation are requested explicitly, out of
 * band, with tools disabled at the response level.
 */
export const createOpenAIRealtimeSession = () => ({
  type: "realtime" as const,
  model: "gpt-realtime-2",
  output_modalities: ["audio"] as const,
  reasoning: { effort: "low" as const },
  parallel_tool_calls: false,
  tool_choice: "none" as const,
  instructions: REALTIME_INSTRUCTIONS,
  tools: [] as const,
  audio: {
    input: {
      noise_reduction: { type: "far_field" as const },
      transcription: {
        model: "gpt-4o-transcribe",
        language: "en",
        prompt:
          "Expect English process-modeling vocabulary including SDCPN, stochastic Petri net, place, transition, arc, token, marking, guard, rate, distribution, parameter, subnet, scenario, and metric.",
      },
      turn_detection: {
        type: "semantic_vad" as const,
        eagerness: "low" as const,
        create_response: false,
        interrupt_response: true,
      },
    },
    output: { voice: "marin" as const },
  },
});
