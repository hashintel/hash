import { describe, expect, test } from "vitest";

import { toVoiceSessionState } from "./voice-session-state";

import type { VoiceTurnSnapshot } from "./voice-turn-controller";

const listeningSnapshot = {
  canReviseLastAnswer: false,
  connection: "connected",
  currentQuestion: "What happens after approval?",
  errorCode: null,
  errorMessage: "",
  errorRequestId: "",
  input: "listening",
  lastAnswerDelivery: "none",
  lastCommittedText: "",
  microphoneEnabled: true,
  microphoneLevel: 0.24,
  output: "idle",
  partialText: "The request goes to dispatch",
} satisfies VoiceTurnSnapshot;

const mapSnapshot = (
  overrides: Partial<VoiceTurnSnapshot> = {},
  committedTextRepresented = false,
) =>
  toVoiceSessionState({
    committedTextRepresented,
    snapshot: { ...listeningSnapshot, ...overrides },
  });

describe("toVoiceSessionState", () => {
  test("reports no session while the provider is idle", () => {
    expect(mapSnapshot({ connection: "idle" })).toBeNull();
  });

  test("captions the user's speech while listening", () => {
    expect(mapSnapshot()).toEqual({
      caption: "The request goes to dispatch",
      errorMessage: null,
      microphoneLevel: 0.24,
      phase: "listening",
    });
  });

  test("hands the caption to the assistant's question while speaking", () => {
    expect(mapSnapshot({ output: "speaking", partialText: "" })).toMatchObject({
      caption: "What happens after approval?",
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

  test("prefers paused over the turn phases", () => {
    expect(mapSnapshot({ input: "paused", output: "speaking" })).toMatchObject({
      phase: "paused",
    });
  });

  test("reports connecting before a session is established", () => {
    expect(mapSnapshot({ connection: "connecting" })).toMatchObject({
      caption: "The request goes to dispatch",
      phase: "connecting",
    });
  });

  test("keeps finalized speech captioned until Petrinaut represents it", () => {
    const pending = {
      lastAnswerDelivery: "pending",
      lastCommittedText: "The request goes to dispatch",
      partialText: "",
    } as const;

    expect(mapSnapshot(pending)).toMatchObject({
      caption: "The request goes to dispatch",
    });
    expect(mapSnapshot(pending, true)).toMatchObject({ caption: "" });
  });

  test("keeps rejected finalized speech captioned for recovery", () => {
    expect(
      mapSnapshot({
        lastAnswerDelivery: "failed",
        lastCommittedText: "The request goes to dispatch",
        partialText: "",
      }),
    ).toMatchObject({ caption: "The request goes to dispatch" });
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
