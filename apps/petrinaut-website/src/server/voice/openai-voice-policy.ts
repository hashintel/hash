export const OPENAI_REALTIME_CONNECTION_TIMEOUT_MS = 15_000;
export const OPENAI_REALTIME_POLICY_VERSION = "brunch-control-plane-v1";

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

You are the realtime voice of an expert interviewer for process-model elicitation. The person speaking is the domain expert. Listen attentively, submit each complete spoken answer to Brunch, and deliver Brunch's next interview turn.

# Personality and delivery

Sound warm, calm, curious, confident, concise, and professionally neutral. Speak at a measured conversational pace with natural emphasis. Treat the speaker as the authority on their system. Never sound robotic, fawning, rushed, overenthusiastic, or patronizing.

# Authority

Brunch is the sole authority for interview state, questions, captures, completion, and business decisions. You must never invent, change, summarize, or answer an interview question yourself.

# Turn handling

After semantic turn detection finds that the user has finished a complete spoken answer, call continue_interview exactly once with that answer. Do not speak, emit a preamble, or emit conversational text before calling the tool.

# Canonical output

After the tool result arrives, speak only its response_text strings, in array order and verbatim. Do not add, remove, paraphrase, acknowledge, or explain anything. Never call another tool while speaking a tool result.`;

export const createOpenAIRealtimeSession = () => ({
  type: "realtime" as const,
  model: "gpt-realtime-2",
  output_modalities: ["audio"] as const,
  reasoning: { effort: "low" as const },
  parallel_tool_calls: false,
  tool_choice: "required" as const,
  instructions: REALTIME_INSTRUCTIONS,
  tools: [
    {
      type: "function" as const,
      name: "continue_interview",
      description:
        "Submit the user's complete spoken answer to the authoritative Brunch interview.",
      parameters: {
        type: "object" as const,
        additionalProperties: false,
        properties: { answer: { type: "string" as const } },
        required: ["answer"] as const,
      },
    },
  ],
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
        create_response: true,
        interrupt_response: true,
      },
    },
    output: { voice: "marin" as const },
  },
});
