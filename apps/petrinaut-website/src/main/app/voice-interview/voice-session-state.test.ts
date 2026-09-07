import { describe, expect, test } from "vitest";

import { toVoiceSessionState } from "./voice-session-state";

import type { VoiceTurnSnapshot } from "./voice-turn-controller";

const listeningSnapshot = {
  canReadFullResponse: false,
  canRepeatQuestion: false,
  canTakeTurn: false,
  canReviseLastAnswer: false,
  connection: "connected",
  currentQuestion: "What happens after approval?",
  errorCode: null,
  errorMessage: "",
  errorRequestId: "",
  input: "listening",
  inputNotice: "none",
  lastAnswerDelivery: "none",
  lastCommittedText: "",
  microphoneEnabled: true,
  microphoneLevel: 0.24,
  output: "idle",
  partialText: "The request goes to dispatch",
} satisfies VoiceTurnSnapshot;

const mapSnapshot = (overrides: Partial<VoiceTurnSnapshot> = {}) =>
  toVoiceSessionState({ snapshot: { ...listeningSnapshot, ...overrides } });

describe("toVoiceSessionState", () => {
  test("reports no session while the provider is idle", () => {
    expect(mapSnapshot({ connection: "idle" })).toBeNull();
  });

  test("reports a listening turn with its microphone level", () => {
    expect(mapSnapshot()).toEqual({
      canReadFullResponse: false,
      canRepeatQuestion: false,
      canTakeTurn: false,
      errorMessage: null,
      microphoneLevel: 0.24,
      microphoneMuted: false,
      notice: null,
      phase: "listening",
    });
  });

  test("publishes safe handoff and canonical playback availability", () => {
    expect(
      mapSnapshot({
        canReadFullResponse: true,
        canRepeatQuestion: true,
        canTakeTurn: true,
      }),
    ).toMatchObject({
      canReadFullResponse: true,
      canRepeatQuestion: true,
      canTakeTurn: true,
    });
  });

  test("describes recoverable transcript rejections", () => {
    expect(mapSnapshot({ inputNotice: "not-heard" })?.notice).toBe(
      "We didn't catch that. Please try again.",
    );
    expect(mapSnapshot({ inputNotice: "too-long" })?.notice).toBe(
      "That answer is too long. Please try a shorter response.",
    );
  });

  test("hands the turn to the assistant while it speaks", () => {
    expect(mapSnapshot({ output: "speaking", partialText: "" })).toMatchObject({
      phase: "speaking",
    });
  });

  test("treats a pending tool and a submitting turn as thinking", () => {
    expect(
      mapSnapshot({ output: "waiting-for-tool", partialText: "" }),
    ).toMatchObject({ phase: "thinking" });
    expect(mapSnapshot({ input: "submitting", partialText: "" })).toMatchObject(
      { phase: "thinking" },
    );
  });

  test("reports a muted microphone in place of the user's own turn", () => {
    expect(mapSnapshot({ microphoneEnabled: false })).toMatchObject({
      microphoneMuted: true,
      phase: "muted",
    });
  });

  test("keeps reporting the assistant's turn while muted", () => {
    expect(
      mapSnapshot({ microphoneEnabled: false, output: "speaking" }),
    ).toMatchObject({ microphoneMuted: true, phase: "speaking" });
    expect(
      mapSnapshot({ microphoneEnabled: false, output: "waiting-for-tool" }),
    ).toMatchObject({ microphoneMuted: true, phase: "thinking" });
  });

  test("prefers paused over the turn phases", () => {
    expect(mapSnapshot({ input: "paused", output: "speaking" })).toMatchObject({
      microphoneMuted: false,
      phase: "paused",
    });
  });

  test("reports connecting before a session is established", () => {
    expect(mapSnapshot({ connection: "connecting" })).toMatchObject({
      phase: "connecting",
    });
  });

  test("names the error family and folds diagnostics into one message", () => {
    expect(
      mapSnapshot({
        connection: "error",
        errorCode: "microphone-permission",
        errorMessage: "Permission was denied.",
        errorRequestId: "req_123",
      }),
    ).toMatchObject({
      errorMessage:
        "Microphone unavailable. Permission was denied. (microphone-permission · req_123)",
      phase: "error",
    });

    expect(
      mapSnapshot({
        connection: "error",
        errorCode: "network",
        errorMessage: "",
        errorRequestId: "",
      }),
    ).toMatchObject({ errorMessage: "Connection interrupted (network)" });

    expect(
      mapSnapshot({
        connection: "error",
        errorCode: null,
        errorMessage: "",
        errorRequestId: "",
      }),
    ).toMatchObject({ errorMessage: "Voice interrupted" });
  });
});
