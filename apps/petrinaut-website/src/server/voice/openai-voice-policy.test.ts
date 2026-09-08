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
    expect(OPENAI_REALTIME_POLICY_VERSION).toBe("brunch-bounded-relay-v4");
    const { instructions, ...configuration } = createOpenAIRealtimeSession();
    expect(instructions).toContain("verbatim speech renderer");
    expect(configuration).toEqual({
      type: "realtime",
      model: "gpt-realtime-2",
      output_modalities: ["audio"],
      reasoning: { effort: "low" },
      parallel_tool_calls: false,
      tool_choice: "none",
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
    expect(policy.instructions).toContain("explicitly requested");
    expect(policy.instructions).toContain(
      "Never interpret or summarize domain evidence",
    );
    expect(policy.instructions).toContain("confirm a workpiece change");
    expect(policy.instructions).toContain("ask a domain follow-up");
    expect(policy.instructions).toContain("alter Brunch's qualifications");
    expect(policy.audio.input.turn_detection.create_response).toBe(false);
    expect(policy.audio.input.transcription.model).toBe("gpt-4o-transcribe");
  });
});
