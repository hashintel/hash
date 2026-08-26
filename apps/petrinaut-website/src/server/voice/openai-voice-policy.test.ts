import { describe, expect, test } from "vitest";

import {
  createOpenAITranscriptionSession,
  getOpenAIVoiceAvailability,
  OPENAI_TRANSCRIPTION_POLICY_VERSION,
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

  test("owns a transcription-only session policy with semantic VAD", () => {
    expect(OPENAI_TRANSCRIPTION_POLICY_VERSION).toBe("process-modeling-en-v1");
    expect(createOpenAITranscriptionSession()).toEqual({
      type: "transcription",
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
            type: "semantic_vad",
            eagerness: "low",
          },
        },
      },
    });
  });

  test("never enables Realtime response generation", () => {
    const serializedPolicy = JSON.stringify(createOpenAITranscriptionSession());

    expect(serializedPolicy).not.toContain("response.create");
    expect(serializedPolicy).not.toContain("create_response");
    expect(serializedPolicy).not.toContain("interrupt_response");
    expect(serializedPolicy).not.toContain("output_audio");
    expect(serializedPolicy).not.toContain('"language"');
  });
});
