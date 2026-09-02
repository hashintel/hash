import { describe, expect, test } from "vitest";

import {
  createOpenAIRealtimeSession,
  getOpenAIVoiceAvailability,
  OPENAI_REALTIME_POLICY_VERSION,
} from "./openai-voice-policy";

describe("OpenAI voice policy", () => {
  test("keeps voice unavailable unless the server explicitly enables it", () => {
    expect(getOpenAIVoiceAvailability({})).toEqual({
      available: false,
      connectionTimeoutMs: 15_000,
    });
    expect(
      getOpenAIVoiceAvailability({
        OPENAI_VOICE_API_KEY: "server-secret",
      }),
    ).toEqual({ available: false, connectionTimeoutMs: 15_000 });
  });

  test("fails closed in production while authentication and quotas are unavailable", () => {
    expect(
      getOpenAIVoiceAvailability({
        OPENAI_VOICE_API_KEY: "server-secret",
        PETRINAUT_OPENAI_VOICE_ENABLED: "true",
        VERCEL_ENV: "production",
      }),
    ).toEqual({ available: false, connectionTimeoutMs: 15_000 });

    expect(
      getOpenAIVoiceAvailability({
        NODE_ENV: "production",
        OPENAI_VOICE_API_KEY: "server-secret",
        PETRINAUT_OPENAI_VOICE_ENABLED: "true",
      }),
    ).toEqual({ available: false, connectionTimeoutMs: 15_000 });

    expect(
      getOpenAIVoiceAvailability({
        NODE_ENV: "production",
        OPENAI_VOICE_API_KEY: "server-secret",
        PETRINAUT_OPENAI_VOICE_ENABLED: "true",
        VERCEL_ENV: "preview",
      }),
    ).toEqual({ available: true, connectionTimeoutMs: 15_000 });
  });

  test("owns the trusted GPT-Realtime-2 duplex session policy", () => {
    expect(OPENAI_REALTIME_POLICY_VERSION).toBe("brunch-control-plane-v1");
    expect(createOpenAIRealtimeSession()).toEqual({
      type: "realtime",
      model: "gpt-realtime-2",
      output_modalities: ["audio"],
      reasoning: { effort: "low" },
      parallel_tool_calls: false,
      tool_choice: "required",
      instructions: `# Role and objective

You are the realtime voice of an expert interviewer for process-model elicitation. The person speaking is the domain expert. Listen attentively, submit each complete spoken answer to Brunch, and deliver Brunch's next interview turn.

# Personality and delivery

Sound warm, calm, curious, confident, concise, and professionally neutral. Speak at a measured conversational pace with natural emphasis. Treat the speaker as the authority on their system. Never sound robotic, fawning, rushed, overenthusiastic, or patronizing.

# Authority

Brunch is the sole authority for interview state, questions, captures, completion, and business decisions. You must never invent, change, summarize, or answer an interview question yourself.

# Turn handling

After semantic turn detection finds that the user has finished a complete spoken answer, call continue_interview exactly once with that answer. Do not speak, emit a preamble, or emit conversational text before calling the tool.

# Canonical output

After the tool result arrives, speak only its response_text strings, in array order and verbatim. Do not add, remove, paraphrase, acknowledge, or explain anything. Never call another tool while speaking a tool result.`,
      tools: [
        {
          type: "function",
          name: "continue_interview",
          description:
            "Submit the user's complete spoken answer to the authoritative Brunch interview.",
          parameters: {
            type: "object",
            additionalProperties: false,
            properties: { answer: { type: "string" } },
            required: ["answer"],
          },
        },
      ],
      audio: {
        input: {
          noise_reduction: { type: "far_field" },
          transcription: {
            model: "gpt-4o-transcribe",
            language: "en",
            prompt:
              "Expect English process-modeling vocabulary including SDCPN, stochastic Petri net, place, transition, arc, token, marking, guard, rate, distribution, parameter, subnet, scenario, and metric.",
          },
          turn_detection: {
            type: "semantic_vad",
            eagerness: "low",
            create_response: true,
            interrupt_response: true,
          },
        },
        output: { voice: "marin" },
      },
    });
  });

  test("allows no provider-owned interview decisions or unrestricted tools", () => {
    const serializedPolicy = JSON.stringify(createOpenAIRealtimeSession());

    expect(serializedPolicy).not.toContain("response.create");
    expect(serializedPolicy).not.toContain("gpt-realtime-1.5");
    expect(serializedPolicy).not.toContain('"tool_choice":"auto"');
    expect(createOpenAIRealtimeSession().tools).toHaveLength(1);
  });
});
