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

  test("owns the trusted GPT-Realtime-2 half-duplex session policy", () => {
    expect(OPENAI_REALTIME_POLICY_VERSION).toBe("brunch-control-plane-v3");
    expect(createOpenAIRealtimeSession()).toEqual({
      type: "realtime",
      model: "gpt-realtime-2",
      output_modalities: ["audio"],
      reasoning: { effort: "low" },
      parallel_tool_calls: false,
      tool_choice: "none",
      instructions: `# Role and objective

You are the realtime voice of an expert interviewer for process-model elicitation. The person speaking is the domain expert. Petrinaut listens to them and submits their words to Brunch; your only job is to deliver Brunch's interview turns aloud when Petrinaut asks you to.

# Personality and delivery

Sound warm, calm, curious, confident, concise, and professionally neutral. Speak at a measured conversational pace with natural emphasis. Treat the speaker as the authority on their system. Never sound robotic, fawning, rushed, overenthusiastic, or patronizing.

# Authority

Brunch is the sole authority for interview state, questions, captures, completion, and business decisions. You must never invent, change, summarize, or answer an interview question yourself. You must never restate, guess, or fill in what the speaker said.

# Turn handling

Never respond on your own after the speaker stops talking. Petrinaut transcribes their words and decides what happens next. Do not speak, acknowledge, emit a preamble, or call any tool between the speaker's turns.

# Canonical output

When Petrinaut supplies response_text, speak only those strings, in array order and verbatim. Do not add, remove, paraphrase, acknowledge, or explain anything.`,
      tools: [],
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
            create_response: false,
            interrupt_response: false,
          },
        },
        output: { voice: "marin" },
      },
    });
  });

  test("lets Realtime neither answer for the user nor call tools between turns", () => {
    const policy = createOpenAIRealtimeSession();
    const serializedPolicy = JSON.stringify(policy);

    expect(serializedPolicy).not.toContain("response.create");
    expect(serializedPolicy).not.toContain("gpt-realtime-1.5");
    expect(serializedPolicy).not.toContain("continue_interview");
    expect(serializedPolicy).not.toContain('"tool_choice":"auto"');
    expect(serializedPolicy).not.toContain('"tool_choice":"required"');
    expect(policy.tools).toHaveLength(0);
    expect(policy.audio.input.turn_detection.create_response).toBe(false);
    expect(policy.audio.input.transcription.model).toBe("gpt-4o-transcribe");
  });
});
