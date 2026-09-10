import { describe, expect, test, vi } from "vitest";

import { FlueChatAdmissionError } from "@hashintel/brunch-agent-transport-aisdk";

import {
  createRealtimeSubmissionId,
  RealtimeBrunchBridge,
  type RealtimeBrunchBridgeEvent,
} from "./realtime-brunch-bridge";

import type { CanonicalSpeechSegment } from "./canonical-speech";
import type {
  OpenAIRealtimeSessionEvent,
  OpenAIRealtimeTranscriptKey,
} from "./openai-realtime-session";

const segment = (
  id: string,
  text: string,
  submissionId?: string,
): CanonicalSpeechSegment => ({
  contentHash: "fnv1a32:12345678",
  id,
  messageId: `message-${id}`,
  partId: id,
  source: "assistant-text",
  ...(submissionId === undefined ? {} : { submissionIds: [submissionId] }),
  text,
});

const transcriptKey = (
  connectionEpoch: number,
  itemId = "user-item-1",
  contentIndex = 0,
): OpenAIRealtimeTranscriptKey => ({ connectionEpoch, contentIndex, itemId });

const completedTranscript = (
  connectionEpoch: number,
  text = "The supervisor approves it.",
  itemId = "user-item-1",
  contentIndex = 0,
): Extract<OpenAIRealtimeSessionEvent, { readonly text: string }> => ({
  key: transcriptKey(connectionEpoch, itemId, contentIndex),
  text,
  type: "completed",
});

const failedTranscript = (
  connectionEpoch: number,
  itemId = "user-item-1",
): Extract<OpenAIRealtimeSessionEvent, { type: "transcription-failed" }> => ({
  key: transcriptKey(connectionEpoch, itemId),
  type: "transcription-failed",
});

const completedResponseMessage = (
  messageId: string,
  submissionId: string,
  index: number,
) => ({
  messageId,
  position: { batch: 1, index },
  submissionId,
});

const createHarness = () => {
  let listener: ((event: OpenAIRealtimeSessionEvent) => void) | undefined;
  const session = {
    speakCanonical: vi.fn(),
    subscribe: vi.fn((next: (event: OpenAIRealtimeSessionEvent) => void) => {
      listener = next;
      return () => {
        listener = undefined;
      };
    }),
  };
  const submitInterviewAnswer = vi.fn<
    ConstructorParameters<
      typeof RealtimeBrunchBridge
    >[0]["submitInterviewAnswer"]
  >(async (input) => {
    input.onAdmission("submission-voice-1");
    return {
      kind: "message",
      messageId: input.id,
      submissionId: "submission-voice-1",
    };
  });
  const bridge = new RealtimeBrunchBridge({
    session,
    submitInterviewAnswer,
    reportDiagnostic: vi.fn(),
  });
  const events: RealtimeBrunchBridgeEvent[] = [];
  bridge.subscribe((event) => events.push(event));

  return {
    bridge,
    emit: (event: OpenAIRealtimeSessionEvent) => listener?.(event),
    events,
    session,
    submitInterviewAnswer,
  };
};

const startReady = (
  harness: ReturnType<typeof createHarness>,
  connectionEpoch = 3,
): void => {
  harness.bridge.updateChat({
    canAcceptInterviewAnswer: true,
    canonicalSegments: [],
    status: "ready",
  });
  harness.bridge.start(connectionEpoch);
};

describe("RealtimeBrunchBridge", () => {
  const vocabularyLeak =
    "SDCPN, stochastic Petri net, place, transition, arc, token, marking, guard, rate, distribution, parameter, subnet, scenario, and metric.";
  const assistantText =
    "The supervisor reviews the request before the manager approves it.";

  test.each([
    ["prompt-regurgitation", vocabularyLeak],
    ["prompt-regurgitation", vocabularyLeak.normalize("NFKC").toUpperCase()],
    [
      "prompt-regurgitation",
      "place, transition, arc, token, marking, guard, rate, distribution, parameter, subnet",
    ],
    ["self-echo", assistantText],
    [
      "self-echo",
      "ＴＨＥ supervisor—reviews the request, before\n the manager approves it!",
    ],
    ["self-echo", "reviews the request before the manager approves it"],
  ])("silently discards %s before pending admission: %s", (reason, text) => {
    const harness = createHarness();
    startReady(harness);
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: false,
      canonicalSegments: [],
      status: "streaming",
    });
    harness.emit({
      type: "output-started",
      connectionEpoch: 3,
      responseId: "playing",
      speechRequestId: "speech",
      canonicalText: [assistantText],
    });
    harness.emit({
      type: "input-speech-started",
      connectionEpoch: 3,
      itemId: "false-vad",
      interruptionBySpeaking: true,
    });
    // Output and canonical chat may change before transcription completes.
    harness.emit({
      type: "output-interrupted",
      connectionEpoch: 3,
      responseId: "playing",
    });
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: false,
      canonicalSegments: [
        segment("later", "Which department handles the invoice?"),
      ],
      status: "streaming",
    });
    // Repeated starts cannot replace the original playback snapshot.
    harness.emit({
      type: "input-speech-started",
      connectionEpoch: 3,
      itemId: "false-vad",
      interruptionBySpeaking: true,
    });
    harness.emit(completedTranscript(3, text, "false-vad"));
    expect(harness.events).toEqual([
      { itemId: "false-vad", type: "transcript-rejected", reason },
    ]);
    expect(harness.submitInterviewAnswer).not.toHaveBeenCalled();
    harness.emit(completedTranscript(3, text, "false-vad"));
    expect(harness.events.at(-1)).toEqual({
      itemId: "false-vad",
      type: "transcript-rejected",
      reason: "duplicate",
    });

    // A false transcript must not occupy the single pending-answer slot.
    harness.emit({
      type: "input-speech-started",
      connectionEpoch: 3,
      itemId: "real",
      interruptionBySpeaking: true,
    });
    harness.emit(completedTranscript(3, "wait", "real"));
    expect(harness.events.at(-1)).toEqual({
      type: "transcript-retained",
      answer: "wait",
    });
    const ready = {
      canAcceptInterviewAnswer: true,
      canonicalSegments: [],
      status: "ready" as const,
    };
    harness.bridge.updateChat(ready);
    harness.bridge.updateChat(ready);
    harness.emit(completedTranscript(3, "wait", "real"));
    expect(harness.submitInterviewAnswer).toHaveBeenCalledOnce();
    expect(harness.submitInterviewAnswer).toHaveBeenCalledWith(
      expect.objectContaining({ text: "wait" }),
    );
  });

  test.each([
    "stop",
    "no",
    "wait",
    "ＳＴＯＰ!",
    "place",
    "transition",
    "The supervisor does not approve it; the auditor makes that decision.",
    "Use a place and transition with a token and a guard for approval.",
    "metric scenario subnet parameter distribution rate guard marking token arc transition place net Petri stochastic SDCPN",
  ])(
    "admits novel interruption exactly once without changing its text: %s",
    (text) => {
      const harness = createHarness();
      startReady(harness);
      harness.emit({
        type: "output-started",
        connectionEpoch: 3,
        responseId: "playing",
        speechRequestId: "speech",
        canonicalText: [assistantText],
      });
      harness.emit({
        type: "input-speech-started",
        connectionEpoch: 3,
        itemId: "real",
        interruptionBySpeaking: true,
      });
      harness.emit(completedTranscript(3, text, "real"));
      harness.emit(completedTranscript(3, text, "real"));
      expect(harness.submitInterviewAnswer).toHaveBeenCalledOnce();
      expect(harness.submitInterviewAnswer).toHaveBeenCalledWith(
        expect.objectContaining({ text }),
      );
    },
  );

  test("rejects a short exact self-echo while admitting short novel speech", () => {
    const harness = createHarness();
    startReady(harness);
    harness.emit({
      type: "output-started",
      connectionEpoch: 3,
      responseId: "playing",
      speechRequestId: "speech",
      canonicalText: ["Who approves this?"],
    });
    harness.emit({
      type: "input-speech-started",
      connectionEpoch: 3,
      itemId: "short-echo",
      interruptionBySpeaking: true,
    });
    harness.emit(completedTranscript(3, "ＷＨＯ approves this!", "short-echo"));

    expect(harness.events.at(-1)).toEqual({
      itemId: "short-echo",
      type: "transcript-rejected",
      reason: "self-echo",
    });
    expect(harness.submitInterviewAnswer).not.toHaveBeenCalled();

    harness.emit({
      type: "input-speech-started",
      connectionEpoch: 3,
      itemId: "short-novel",
      interruptionBySpeaking: true,
    });
    harness.emit(completedTranscript(3, "The supervisor does.", "short-novel"));

    expect(harness.submitInterviewAnswer).toHaveBeenCalledOnce();
    expect(harness.submitInterviewAnswer).toHaveBeenCalledWith(
      expect.objectContaining({ text: "The supervisor does." }),
    );
  });

  test.each([vocabularyLeak, assistantText])(
    "leaves ordinary transcripts unchanged: %s",
    (text) => {
      const harness = createHarness();
      startReady(harness);
      harness.emit(completedTranscript(3, text));
      expect(harness.submitInterviewAnswer).toHaveBeenCalledOnce();
      expect(harness.submitInterviewAnswer).toHaveBeenCalledWith(
        expect.objectContaining({ text }),
      );
    },
  );

  test("does not classify ordinary capture merely because interruption is enabled", () => {
    const harness = createHarness();
    startReady(harness);
    harness.emit({
      type: "input-speech-started",
      connectionEpoch: 3,
      itemId: "ordinary",
      interruptionBySpeaking: true,
    });
    harness.emit(completedTranscript(3, vocabularyLeak, "ordinary"));
    expect(harness.submitInterviewAnswer).toHaveBeenCalledOnce();
  });

  test.each(["stop", "cancelPendingSpeech", "failure", "reconnect"] as const)(
    "cleans playback snapshots on %s",
    (action) => {
      const harness = createHarness();
      startReady(harness);
      harness.emit({
        type: "output-started",
        connectionEpoch: 3,
        responseId: "old",
        speechRequestId: "speech",
        canonicalText: [assistantText],
      });
      harness.emit({
        type: "input-speech-started",
        connectionEpoch: 3,
        itemId: "unfinished",
        interruptionBySpeaking: true,
      });
      if (action === "failure")
        harness.bridge.updateChat({
          canAcceptInterviewAnswer: false,
          canonicalSegments: [],
          status: "error",
        });
      else if (action === "reconnect") harness.bridge.start(4);
      else harness.bridge[action]();
      if (action === "cancelPendingSpeech")
        harness.bridge.completeTurnHandoff();
      else harness.bridge.start(4);
      harness.bridge.updateChat({
        canAcceptInterviewAnswer: true,
        canonicalSegments: [],
        status: "ready",
      });
      const epoch = action === "cancelPendingSpeech" ? 3 : 4;
      const itemId =
        action === "cancelPendingSpeech"
          ? "fresh-after-cancellation"
          : "unfinished";
      harness.emit({
        type: "input-speech-started",
        connectionEpoch: epoch,
        itemId,
        interruptionBySpeaking: true,
      });
      harness.emit(completedTranscript(epoch, assistantText, itemId));
      expect(harness.submitInterviewAnswer).toHaveBeenCalledOnce();
    },
  );

  test("does not classify a prompt leak while playback creation is still pending", () => {
    const harness = createHarness();
    startReady(harness);
    harness.emit({
      type: "canonical-speech-requested",
      connectionEpoch: 3,
      speechRequestId: "creating",
    });
    harness.emit({
      type: "input-speech-started",
      connectionEpoch: 3,
      itemId: "false-vad",
      interruptionBySpeaking: true,
    });
    harness.emit(completedTranscript(3, vocabularyLeak, "false-vad"));
    expect(harness.submitInterviewAnswer).toHaveBeenCalledOnce();
    expect(harness.submitInterviewAnswer).toHaveBeenCalledWith(
      expect.objectContaining({ text: vocabularyLeak }),
    );
    expect(harness.events).not.toContainEqual(
      expect.objectContaining({ type: "transcript-rejected" }),
    );
  });

  test("keeps an accepted interruption through a later speech request", async () => {
    const harness = createHarness();
    startReady(harness);
    harness.emit({
      canonicalText: [assistantText],
      connectionEpoch: 3,
      responseId: "playing",
      speechRequestId: "speech-playing",
      type: "output-started",
    });
    harness.emit({
      connectionEpoch: 3,
      interruptionBySpeaking: true,
      itemId: "interruption",
      type: "input-speech-started",
    });
    harness.emit({
      connectionEpoch: 3,
      speechRequestId: "speech-follow-on",
      type: "canonical-speech-requested",
    });

    harness.emit(
      completedTranscript(
        3,
        "Actually, the auditor approves it.",
        "interruption",
      ),
    );

    await vi.waitFor(() =>
      expect(harness.submitInterviewAnswer).toHaveBeenCalledOnce(),
    );
    expect(harness.events).not.toContainEqual({
      reason: "unavailable",
      type: "transcript-rejected",
    });
  });

  test.each(["output-stopped", "output-interrupted"] as const)(
    "does not compare against playback that already %s",
    (type) => {
      const harness = createHarness();
      startReady(harness);
      harness.emit({
        type: "output-started",
        connectionEpoch: 3,
        responseId: "old",
        speechRequestId: "speech",
        canonicalText: [assistantText],
      });
      harness.emit({ type, connectionEpoch: 3, responseId: "old" });
      harness.emit({
        type: "input-speech-started",
        connectionEpoch: 3,
        itemId: "real",
        interruptionBySpeaking: true,
      });
      harness.emit(completedTranscript(3, assistantText, "real"));
      expect(harness.submitInterviewAnswer).toHaveBeenCalledOnce();
    },
  );

  test("retains an interrupting transcript until the previous Brunch submission settles", async () => {
    const harness = createHarness();
    startReady(harness);
    harness.emit(completedTranscript(3));
    await vi.waitFor(() =>
      expect(
        harness.events.some(({ type }) => type === "submission-accepted"),
      ).toBe(true),
    );
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: false,
      canonicalSegments: [],
      status: "streaming",
    });
    harness.emit({
      type: "canonical-speech-requested",
      connectionEpoch: 3,
      speechRequestId: "speech-1",
    });
    harness.emit({
      type: "input-speech-started",
      connectionEpoch: 3,
      itemId: "interruption",
      interruptionBySpeaking: true,
    });
    harness.emit(
      completedTranscript(
        3,
        "Actually, the manager approves it.",
        "interruption",
      ),
    );
    expect(harness.submitInterviewAnswer).toHaveBeenCalledOnce();
    const update = {
      canAcceptInterviewAnswer: true,
      canonicalSegments: [
        segment("reply", "Who is informed?", "submission-voice-1"),
      ],
      status: "ready" as const,
    };
    harness.bridge.updateChat(update);
    await vi.waitFor(() =>
      expect(harness.submitInterviewAnswer).toHaveBeenCalledTimes(2),
    );
    expect(harness.submitInterviewAnswer).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: "voice-realtime:3:interruption:0",
        text: "Actually, the manager approves it.",
      }),
    );
    harness.emit(
      completedTranscript(
        3,
        "Actually, the manager approves it.",
        "interruption",
      ),
    );
    harness.bridge.updateChat(update);
    expect(harness.submitInterviewAnswer).toHaveBeenCalledTimes(2);
    expect(harness.session.speakCanonical).not.toHaveBeenCalled();
  });

  test("submits sequential utterances in speech order when transcription completes out of order", async () => {
    const harness = createHarness();
    startReady(harness);
    for (const itemId of ["first-item", "second-item"]) {
      harness.emit({
        connectionEpoch: 3,
        interruptionBySpeaking: true,
        itemId,
        type: "input-speech-started",
      });
      harness.emit({
        connectionEpoch: 3,
        itemId,
        type: "input-speech-stopped",
      });
    }

    harness.emit(completedTranscript(3, "Second answer.", "second-item"));
    expect(harness.submitInterviewAnswer).not.toHaveBeenCalled();

    harness.emit(completedTranscript(3, "First answer.", "first-item"));
    await vi.waitFor(() =>
      expect(harness.events).toContainEqual(
        expect.objectContaining({
          answer: "First answer.",
          type: "submission-accepted",
        }),
      ),
    );
    expect(harness.submitInterviewAnswer).toHaveBeenCalledOnce();
    expect(harness.submitInterviewAnswer).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ text: "First answer." }),
    );
    expect(harness.events).toContainEqual({
      answer: "Second answer.",
      type: "transcript-retained",
    });

    harness.bridge.updateChat({
      canAcceptInterviewAnswer: false,
      canonicalSegments: [],
      status: "streaming",
    });
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [
        segment("first-reply", "Who acts next?", "submission-voice-1"),
      ],
      status: "ready",
    });

    await vi.waitFor(() =>
      expect(harness.submitInterviewAnswer).toHaveBeenCalledTimes(2),
    );
    expect(harness.submitInterviewAnswer).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ text: "Second answer." }),
    );
  });

  test("retains a half-duplex follow-up accepted before the first submission starts", async () => {
    const harness = createHarness();
    startReady(harness);
    for (const itemId of ["first-item", "second-item"]) {
      harness.emit({
        connectionEpoch: 3,
        itemId,
        type: "input-speech-started",
      });
      harness.emit({
        connectionEpoch: 3,
        itemId,
        type: "input-speech-stopped",
      });
    }

    harness.emit(completedTranscript(3, "First answer.", "first-item"));
    await vi.waitFor(() =>
      expect(harness.events).toContainEqual(
        expect.objectContaining({
          answer: "First answer.",
          type: "submission-accepted",
        }),
      ),
    );
    harness.emit(completedTranscript(3, "Second answer.", "second-item"));

    expect(harness.events).toContainEqual({
      answer: "Second answer.",
      type: "transcript-retained",
    });
    expect(harness.events).not.toContainEqual({
      itemId: "second-item",
      reason: "unavailable",
      type: "transcript-rejected",
    });

    harness.bridge.updateChat({
      canAcceptInterviewAnswer: false,
      canonicalSegments: [],
      status: "streaming",
    });
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [
        segment("first-reply", "Who acts next?", "submission-voice-1"),
      ],
      status: "ready",
    });

    await vi.waitFor(() =>
      expect(harness.submitInterviewAnswer).toHaveBeenCalledTimes(2),
    );
    expect(harness.submitInterviewAnswer).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ text: "Second answer." }),
    );
  });

  test("treats transcript completion as the stop boundary for a half-duplex follow-up", async () => {
    const harness = createHarness();
    startReady(harness);
    harness.emit({
      connectionEpoch: 3,
      itemId: "first-item",
      type: "input-speech-started",
    });
    harness.emit({
      connectionEpoch: 3,
      itemId: "first-item",
      type: "input-speech-stopped",
    });
    harness.emit({
      connectionEpoch: 3,
      itemId: "second-item",
      type: "input-speech-started",
    });

    harness.emit(completedTranscript(3, "First answer.", "first-item"));
    await vi.waitFor(() =>
      expect(harness.events).toContainEqual(
        expect.objectContaining({
          answer: "First answer.",
          type: "submission-accepted",
        }),
      ),
    );
    harness.emit(completedTranscript(3, "Second answer.", "second-item"));

    expect(harness.events).toContainEqual({
      answer: "Second answer.",
      type: "transcript-retained",
    });
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: false,
      canonicalSegments: [],
      status: "streaming",
    });
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [
        segment("first-reply", "Who acts next?", "submission-voice-1"),
      ],
      status: "ready",
    });
    await vi.waitFor(() =>
      expect(harness.submitInterviewAnswer).toHaveBeenCalledTimes(2),
    );
    expect(harness.submitInterviewAnswer).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ text: "Second answer." }),
    );
  });

  test.each([false, true])(
    "retires unfinished input across cancellation when pending answers are discarded: %s",
    (discardPendingInterruption) => {
      const harness = createHarness();
      startReady(harness);
      harness.emit({
        connectionEpoch: 3,
        interruptionBySpeaking: true,
        itemId: "cancelled-item",
        type: "input-speech-started",
      });

      harness.bridge.cancelPendingSpeech({ discardPendingInterruption });
      harness.bridge.completeTurnHandoff();
      harness.emit({
        connectionEpoch: 3,
        itemId: "fresh-item",
        type: "input-speech-started",
      });
      harness.emit({
        connectionEpoch: 3,
        itemId: "fresh-item",
        type: "input-speech-stopped",
      });
      harness.emit(completedTranscript(3, "A fresh answer.", "fresh-item"));

      expect(harness.submitInterviewAnswer).toHaveBeenCalledOnce();
      expect(harness.submitInterviewAnswer).toHaveBeenCalledWith(
        expect.objectContaining({ text: "A fresh answer." }),
      );
    },
  );

  test.each(["stop", "reconnect"] as const)(
    "clears a retained interruption on %s",
    (action) => {
      const harness = createHarness();
      startReady(harness);
      harness.bridge.updateChat({
        canAcceptInterviewAnswer: false,
        canonicalSegments: [],
        status: "streaming",
      });
      harness.emit({
        type: "input-speech-started",
        connectionEpoch: 3,
        itemId: "pending",
        interruptionBySpeaking: true,
      });
      harness.emit(completedTranscript(3, "Pending answer", "pending"));
      expect(harness.events).toContainEqual({
        type: "transcript-retained",
        answer: "Pending answer",
      });
      if (action === "reconnect") harness.bridge.start(4);
      else harness.bridge[action]();
      harness.bridge.updateChat({
        canAcceptInterviewAnswer: true,
        canonicalSegments: [],
        status: "ready",
      });
      expect(harness.submitInterviewAnswer).not.toHaveBeenCalled();
    },
  );

  test.each(["stop-before-cancellation", "cancellation-before-stop"] as const)(
    "preserves a retained interruption through host Stop when %s settles first",
    async (order) => {
      const harness = createHarness();
      startReady(harness);
      harness.emit(completedTranscript(3, "Initial answer", "initial"));
      await vi.waitFor(() =>
        expect(harness.events).toContainEqual(
          expect.objectContaining({ type: "submission-accepted" }),
        ),
      );
      harness.bridge.updateChat({
        canAcceptInterviewAnswer: false,
        canonicalSegments: [],
        status: "streaming",
      });
      harness.emit({
        type: "input-speech-started",
        connectionEpoch: 3,
        itemId: "pending",
        interruptionBySpeaking: true,
      });
      harness.emit(completedTranscript(3, "Pending answer", "pending"));

      harness.bridge.cancelPendingSpeech();
      const stoppedChat = {
        canAcceptInterviewAnswer: true,
        canonicalSegments: [],
        status: "ready" as const,
        settlements: [
          { outcome: "aborted" as const, submissionId: "submission-voice-1" },
        ],
        stopped: true,
      };
      if (order === "stop-before-cancellation") {
        harness.bridge.updateChat(stoppedChat);
        expect(harness.submitInterviewAnswer).toHaveBeenCalledOnce();
        harness.bridge.completeTurnHandoff();
      } else {
        harness.bridge.completeTurnHandoff();
        expect(harness.submitInterviewAnswer).toHaveBeenCalledOnce();
        harness.bridge.updateChat(stoppedChat);
      }

      await vi.waitFor(() =>
        expect(harness.submitInterviewAnswer).toHaveBeenCalledTimes(2),
      );
      expect(harness.submitInterviewAnswer).toHaveBeenLastCalledWith(
        expect.objectContaining({ text: "Pending answer" }),
      );
    },
  );

  test("preserves a completed answer buffered behind input cancelled by host Stop", () => {
    const harness = createHarness();
    startReady(harness);
    for (const itemId of ["first-item", "completed-item"]) {
      harness.emit({
        connectionEpoch: 3,
        interruptionBySpeaking: true,
        itemId,
        type: "input-speech-started",
      });
      harness.emit({
        connectionEpoch: 3,
        itemId,
        type: "input-speech-stopped",
      });
    }
    harness.emit(completedTranscript(3, "Keep this answer.", "completed-item"));
    expect(harness.submitInterviewAnswer).not.toHaveBeenCalled();

    harness.bridge.cancelPendingSpeech();

    expect(harness.events).toContainEqual({
      answer: "Keep this answer.",
      type: "transcript-retained",
    });
    expect(harness.events).not.toContainEqual({
      itemId: "completed-item",
      reason: "unavailable",
      type: "transcript-rejected",
    });

    harness.bridge.completeTurnHandoff();
    expect(harness.submitInterviewAnswer).toHaveBeenCalledOnce();
    expect(harness.submitInterviewAnswer).toHaveBeenCalledWith(
      expect.objectContaining({ text: "Keep this answer." }),
    );
  });

  test("discards a retained interruption for an explicit turn handoff", () => {
    const harness = createHarness();
    startReady(harness);
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: false,
      canonicalSegments: [],
      status: "streaming",
    });
    harness.emit({
      type: "input-speech-started",
      connectionEpoch: 3,
      itemId: "pending",
      interruptionBySpeaking: true,
    });
    harness.emit(completedTranscript(3, "Stale pending answer", "pending"));

    harness.bridge.cancelPendingSpeech({ discardPendingInterruption: true });
    harness.bridge.completeTurnHandoff();
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [],
      status: "ready",
    });

    expect(harness.submitInterviewAnswer).not.toHaveBeenCalled();
  });

  test("releases generated output ownership after interruption before playback", async () => {
    const harness = createHarness();
    startReady(harness);
    harness.emit({
      type: "canonical-speech-requested",
      connectionEpoch: 3,
      speechRequestId: "speech-generated",
    });
    harness.emit({
      type: "response-terminal",
      connectionEpoch: 3,
      playbackExpected: true,
      responseId: "response-generated",
      speechRequestId: "speech-generated",
      status: "completed",
    });
    harness.emit({
      type: "output-interrupted",
      connectionEpoch: 3,
      responseId: "response-generated",
      speechRequestId: "speech-generated",
    });

    harness.emit({
      type: "input-speech-started",
      connectionEpoch: 3,
      itemId: "ordinary-answer",
    });
    harness.emit(
      completedTranscript(3, "A fresh ordinary answer", "ordinary-answer"),
    );

    await vi.waitFor(() =>
      expect(harness.submitInterviewAnswer).toHaveBeenCalledOnce(),
    );
    expect(harness.submitInterviewAnswer).toHaveBeenCalledWith(
      expect.objectContaining({ text: "A fresh ordinary answer" }),
    );
  });

  test("drains a retained interruption once the panel reopens voice input", async () => {
    const harness = createHarness();
    startReady(harness);
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: false,
      canonicalSegments: [],
      status: "streaming",
    });
    harness.emit({
      type: "input-speech-started",
      connectionEpoch: 3,
      itemId: "interruption",
      interruptionBySpeaking: true,
    });
    harness.emit(
      completedTranscript(3, "The auditor approves it.", "interruption"),
    );

    // The panel reports ready before it releases the queued voice input, so
    // the first ready update cannot deliver the retained answer.
    const heldSegments = [
      segment("held", "Who signs it off?", "submission-held"),
    ];
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: false,
      canonicalSegments: heldSegments,
      status: "ready",
    });
    expect(harness.submitInterviewAnswer).not.toHaveBeenCalled();

    harness.bridge.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: heldSegments,
      status: "ready",
    });
    await vi.waitFor(() =>
      expect(harness.submitInterviewAnswer).toHaveBeenCalledOnce(),
    );
    expect(harness.submitInterviewAnswer).toHaveBeenCalledWith(
      expect.objectContaining({ text: "The auditor approves it." }),
    );
    expect(harness.session.speakCanonical).not.toHaveBeenCalled();
  });

  test("refuses ordinary capture while a submission is active", async () => {
    const harness = createHarness();
    startReady(harness);
    harness.emit(completedTranscript(3));
    await vi.waitFor(() =>
      expect(
        harness.events.some(({ type }) => type === "submission-accepted"),
      ).toBe(true),
    );
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: false,
      canonicalSegments: [],
      status: "streaming",
    });

    harness.emit(completedTranscript(3, "   ", "second-item"));

    expect(harness.events).toContainEqual({
      itemId: "second-item",
      type: "transcript-rejected",
      reason: "unavailable",
    });
    expect(harness.submitInterviewAnswer).toHaveBeenCalledOnce();
  });

  test("retains only the first pending interruption and reports the extra utterance", () => {
    const harness = createHarness();
    startReady(harness);
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: false,
      canonicalSegments: [],
      status: "streaming",
    });
    for (const itemId of ["first", "second"]) {
      harness.emit({
        type: "input-speech-started",
        connectionEpoch: 3,
        itemId,
        interruptionBySpeaking: true,
      });
      harness.emit(completedTranscript(3, itemId, itemId));
    }
    expect(harness.events).toContainEqual({
      itemId: "second",
      type: "transcript-rejected",
      reason: "pending",
    });
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [],
      status: "ready",
    });
    expect(harness.submitInterviewAnswer).toHaveBeenCalledOnce();
    expect(harness.submitInterviewAnswer).toHaveBeenCalledWith(
      expect.objectContaining({ text: "first" }),
    );
  });

  test("rehydrates settled canonical speech without submission or playback", () => {
    const harness = createHarness();
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [
        segment("settled", "Already delivered.", "submission-settled"),
      ],
      status: "ready",
    });

    harness.bridge.start(9);

    expect(harness.submitInterviewAnswer).not.toHaveBeenCalled();
    expect(harness.session.speakCanonical).not.toHaveBeenCalled();
    expect(harness.events).toEqual([]);
  });

  test("does not dispatch canonical updates that arrive during output cancellation", () => {
    const harness = createHarness();
    startReady(harness);
    const cancelledSegment = segment(
      "cancelled-update",
      "Do not speak this cancelled update.",
    );

    harness.bridge.cancelPendingSpeech();
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: false,
      canonicalSegments: [cancelledSegment],
      status: "streaming",
    });

    expect(harness.session.speakCanonical).not.toHaveBeenCalled();

    harness.bridge.completeTurnHandoff();
    const laterSegment = segment("later-update", "Speak this later update.");
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [cancelledSegment, laterSegment],
      status: "ready",
    });

    expect(harness.session.speakCanonical).toHaveBeenCalledOnce();
    expect(harness.session.speakCanonical).toHaveBeenCalledWith([laterSegment]);
  });

  test("submits only a completed transcript through the user admission target", async () => {
    const harness = createHarness();
    startReady(harness, 7);
    const key = transcriptKey(7);

    harness.emit({ key, text: "The supervisor", type: "partial" });
    harness.emit({
      arguments: '{"answer":"Fabricated answer"}',
      callId: "legacy-call",
      connectionEpoch: 7,
      itemId: "legacy-item",
      name: "continue_interview",
      responseId: "legacy-response",
      type: "tool-arguments-done",
    } as unknown as OpenAIRealtimeSessionEvent);
    expect(harness.submitInterviewAnswer).not.toHaveBeenCalled();

    harness.emit(completedTranscript(7, "  The   supervisor\napproves it.  "));

    await vi.waitFor(() =>
      expect(harness.submitInterviewAnswer).toHaveBeenCalledOnce(),
    );
    const deliveryId = createRealtimeSubmissionId(key);
    expect(harness.submitInterviewAnswer).toHaveBeenCalledWith(
      expect.objectContaining({
        admissionTarget: { kind: "user", messageId: deliveryId },
        id: deliveryId,
        text: "The supervisor approves it.",
      }),
    );
    expect(harness.events).toContainEqual({
      answer: "The supervisor approves it.",
      deliveryId,
      itemId: "user-item-1",
      type: "submission-started",
    });
    expect(JSON.stringify(harness.events)).not.toContain("Fabricated answer");
  });

  test("rejects unfinished input invalidated by output and accepts fresh input", async () => {
    const harness = createHarness();
    startReady(harness);

    harness.emit({
      connectionEpoch: 3,
      itemId: "item-before-output",
      type: "input-speech-started",
    });
    harness.emit({
      connectionEpoch: 3,
      responseId: "response-output",
      speechRequestId: "speech-output",
      type: "output-started",
    });
    harness.emit(
      completedTranscript(3, "This completed too late.", "item-before-output"),
    );

    expect(harness.submitInterviewAnswer).not.toHaveBeenCalled();
    expect(harness.events).toContainEqual({
      itemId: "item-before-output",
      reason: "unavailable",
      type: "transcript-rejected",
    });

    harness.emit({
      connectionEpoch: 3,
      responseId: "response-output",
      type: "output-stopped",
    });
    harness.emit({
      connectionEpoch: 3,
      itemId: "item-after-output",
      type: "input-speech-started",
    });
    harness.emit(completedTranscript(3, "This is fresh.", "item-after-output"));
    await vi.waitFor(() =>
      expect(harness.submitInterviewAnswer).toHaveBeenCalledOnce(),
    );
    expect(harness.submitInterviewAnswer).toHaveBeenCalledWith(
      expect.objectContaining({ text: "This is fresh." }),
    );

    harness.emit(completedTranscript(3, "Stale replay.", "item-before-output"));
    expect(harness.submitInterviewAnswer).toHaveBeenCalledOnce();
  });

  test("rejects unfinished input as soon as canonical speech is requested", async () => {
    const harness = createHarness();
    startReady(harness);

    harness.emit({
      connectionEpoch: 3,
      itemId: "item-before-request",
      type: "input-speech-started",
    });
    harness.emit({
      connectionEpoch: 3,
      speechRequestId: "speech-request",
      type: "canonical-speech-requested",
    });
    harness.emit(
      completedTranscript(
        3,
        "This completed before output started.",
        "item-before-request",
      ),
    );

    expect(harness.submitInterviewAnswer).not.toHaveBeenCalled();
    expect(harness.events).toContainEqual({
      itemId: "item-before-request",
      reason: "unavailable",
      type: "transcript-rejected",
    });

    harness.emit(
      completedTranscript(
        3,
        "The stale item cannot recover authority.",
        "item-before-request",
      ),
    );
    expect(harness.submitInterviewAnswer).not.toHaveBeenCalled();

    harness.bridge.completeTurnHandoff();
    harness.emit({
      connectionEpoch: 3,
      itemId: "item-after-handoff",
      type: "input-speech-started",
    });
    harness.emit(
      completedTranscript(3, "This is fresh.", "item-after-handoff"),
    );

    await vi.waitFor(() =>
      expect(harness.submitInterviewAnswer).toHaveBeenCalledOnce(),
    );
    expect(harness.submitInterviewAnswer).toHaveBeenCalledWith(
      expect.objectContaining({ text: "This is fresh." }),
    );
  });

  test("retains follow-on output ownership across an earlier response stop", async () => {
    const harness = createHarness();
    startReady(harness);
    harness.emit({
      connectionEpoch: 3,
      speechRequestId: "speech-early",
      type: "canonical-speech-requested",
    });
    harness.emit({
      connectionEpoch: 3,
      responseId: "response-early",
      speechRequestId: "speech-early",
      type: "output-started",
    });
    harness.emit({
      connectionEpoch: 3,
      playbackExpected: true,
      responseId: "response-early",
      status: "completed",
      type: "response-terminal",
    });
    harness.emit({
      connectionEpoch: 3,
      speechRequestId: "speech-follow-on",
      type: "canonical-speech-requested",
    });
    harness.emit({
      connectionEpoch: 3,
      playbackExpected: true,
      responseId: "response-follow-on",
      speechRequestId: "speech-follow-on",
      status: "completed",
      type: "response-terminal",
    });
    harness.emit({
      connectionEpoch: 3,
      responseId: "response-early",
      type: "output-stopped",
    });

    harness.emit({
      connectionEpoch: 3,
      itemId: "item-during-follow-on",
      type: "input-speech-started",
    });
    harness.emit(
      completedTranscript(
        3,
        "This overlaps pending follow-on output.",
        "item-during-follow-on",
      ),
    );

    expect(harness.submitInterviewAnswer).not.toHaveBeenCalled();
    expect(harness.events).toContainEqual({
      itemId: "item-during-follow-on",
      reason: "unavailable",
      type: "transcript-rejected",
    });

    harness.bridge.completeTurnHandoff();
    harness.emit({
      connectionEpoch: 3,
      itemId: "item-after-handoff",
      type: "input-speech-started",
    });
    harness.emit(
      completedTranscript(3, "This is fresh.", "item-after-handoff"),
    );

    await vi.waitFor(() =>
      expect(harness.submitInterviewAnswer).toHaveBeenCalledOnce(),
    );
    expect(harness.submitInterviewAnswer).toHaveBeenCalledWith(
      expect.objectContaining({ text: "This is fresh." }),
    );
  });

  test("releases pending output ownership when creation is cancelled before playback", async () => {
    const harness = createHarness();
    startReady(harness);
    harness.emit({
      connectionEpoch: 3,
      speechRequestId: "speech-cancelled",
      type: "canonical-speech-requested",
    });

    harness.emit({
      connectionEpoch: 3,
      speechRequestId: "speech-cancelled",
      playbackExpected: false,
      status: "cancelled",
      type: "response-terminal",
    });
    harness.emit({
      connectionEpoch: 3,
      itemId: "item-after-cancellation",
      type: "input-speech-started",
    });
    harness.emit(
      completedTranscript(
        3,
        "This follows acknowledged cancellation.",
        "item-after-cancellation",
      ),
    );

    await vi.waitFor(() =>
      expect(harness.submitInterviewAnswer).toHaveBeenCalledOnce(),
    );
    expect(harness.submitInterviewAnswer).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "This follows acknowledged cancellation.",
      }),
    );
  });

  test("releases the matching pending request when completed output has no audio", async () => {
    const harness = createHarness();
    startReady(harness);
    harness.emit({
      connectionEpoch: 3,
      speechRequestId: "speech-silent",
      type: "canonical-speech-requested",
    });

    harness.emit({
      connectionEpoch: 3,
      playbackExpected: false,
      responseId: "response-silent",
      speechRequestId: "speech-silent",
      status: "completed",
      type: "response-terminal",
    });
    harness.emit({
      connectionEpoch: 3,
      itemId: "item-after-silent-response",
      type: "input-speech-started",
    });
    harness.emit(
      completedTranscript(
        3,
        "This follows a completed response without audio.",
        "item-after-silent-response",
      ),
    );

    await vi.waitFor(() =>
      expect(harness.submitInterviewAnswer).toHaveBeenCalledOnce(),
    );
    expect(harness.submitInterviewAnswer).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "This follows a completed response without audio.",
      }),
    );
  });

  test("derives stable delivery identity from epoch, item, and content index", () => {
    expect(
      createRealtimeSubmissionId(transcriptKey(12, "item/with spaces", 4)),
    ).toBe("voice-realtime:12:item%2Fwith%20spaces:4");
  });

  test("submits duplicate completed transcript events exactly once", async () => {
    const harness = createHarness();
    startReady(harness);
    const transcript = completedTranscript(3);

    harness.emit(transcript);
    harness.emit(transcript);

    await vi.waitFor(() =>
      expect(harness.submitInterviewAnswer).toHaveBeenCalledOnce(),
    );
    expect(harness.events).toContainEqual({
      itemId: "user-item-1",
      reason: "duplicate",
      type: "transcript-rejected",
    });
  });

  test.each([
    ["", "empty"],
    [" \n\t ", "empty"],
    ["a".repeat(32_001), "over-limit"],
  ] as const)(
    "rejects an invalid completed transcript as %s",
    (text, reason) => {
      const harness = createHarness();
      startReady(harness);

      harness.emit(completedTranscript(3, text));

      expect(harness.submitInterviewAnswer).not.toHaveBeenCalled();
      expect(harness.events).toEqual([
        { itemId: "user-item-1", reason, type: "transcript-rejected" },
      ]);
    },
  );

  test("rejects a failed transcript and accepts the next keyed turn", async () => {
    const harness = createHarness();
    startReady(harness);

    harness.emit(failedTranscript(3, "failed-item"));
    expect(harness.events).toEqual([
      {
        itemId: "failed-item",
        reason: "failed",
        type: "transcript-rejected",
      },
    ]);

    harness.emit(completedTranscript(3, "Retried answer.", "retry-item"));
    await vi.waitFor(() =>
      expect(harness.submitInterviewAnswer).toHaveBeenCalledWith(
        expect.objectContaining({ text: "Retried answer." }),
      ),
    );
  });

  test("rejects completed transcripts while the shared submission path is unavailable", () => {
    const harness = createHarness();
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: false,
      canonicalSegments: [],
      status: "streaming",
    });
    harness.bridge.start(3);

    harness.emit(completedTranscript(3));

    expect(harness.submitInterviewAnswer).not.toHaveBeenCalled();
    expect(harness.events).toEqual([
      {
        itemId: "user-item-1",
        reason: "unavailable",
        type: "transcript-rejected",
      },
    ]);
  });

  test("ignores transcripts from an inactive connection epoch", () => {
    const harness = createHarness();
    startReady(harness, 2);

    harness.emit(completedTranscript(1, "Stale answer"));
    harness.emit(failedTranscript(1, "stale-failed"));

    expect(harness.submitInterviewAnswer).not.toHaveBeenCalled();
    expect(harness.events).toEqual([]);
  });

  test("correlates the admitted submission with exact canonical response segments", async () => {
    const harness = createHarness();
    startReady(harness, 7);
    harness.emit(completedTranscript(7));
    await vi.waitFor(() =>
      expect(harness.submitInterviewAnswer).toHaveBeenCalledOnce(),
    );
    const input = harness.submitInterviewAnswer.mock.calls[0]?.[0];
    expect(input).toBeDefined();

    input?.onAdmission("submission-voice-1");
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: false,
      canonicalSegments: [],
      status: "submitted",
    });
    const unrelated = segment(
      "unrelated",
      "Do not speak this.",
      "submission-other",
    );
    const correlated = segment(
      "correlated",
      "Speak this canonical response.",
      "submission-voice-1",
    );
    const correlatedQuestion: CanonicalSpeechSegment = {
      ...segment(
        "correlated-question",
        "Which operator confirms the batch?",
        "submission-voice-1",
      ),
      messageId: correlated.messageId,
      source: "assistant-question",
    };
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [unrelated, correlated],
      questionSegment: correlatedQuestion,
      status: "ready",
    });

    const deliveryId = createRealtimeSubmissionId(transcriptKey(7));
    expect(harness.session.speakCanonical).toHaveBeenCalledWith([correlated]);
    expect(harness.events.map(({ type }) => type)).toEqual([
      "submission-started",
      "submission-admitted",
      "submission-accepted",
      "canonical-text-ready",
      "submission-settled",
      "canonical-response-ready",
    ]);
    expect(harness.events.at(-1)).toEqual({
      deliveryId,
      questionSegment: correlatedQuestion,
      segments: [correlated],
      type: "canonical-response-ready",
    });
  });

  test("settles a completed submission with no canonical response and accepts the next turn", async () => {
    const harness = createHarness();
    startReady(harness, 7);
    harness.emit(completedTranscript(7, "The silent answer."));
    await vi.waitFor(() =>
      expect(harness.submitInterviewAnswer).toHaveBeenCalledOnce(),
    );

    harness.bridge.updateChat({
      canAcceptInterviewAnswer: false,
      canonicalSegments: [],
      status: "submitted",
    });
    const eventCountBeforeUnrelatedSettlement = harness.events.length;
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [],
      settlements: [{ outcome: "completed", submissionId: "submission-other" }],
      status: "ready",
    });
    expect(harness.events).toHaveLength(eventCountBeforeUnrelatedSettlement);

    const deliveryId = createRealtimeSubmissionId(transcriptKey(7));
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [],
      settlements: [
        { outcome: "completed", submissionId: "submission-other" },
        { outcome: "completed", submissionId: "submission-voice-1" },
      ],
      status: "ready",
    });
    expect(harness.events.slice(-2)).toEqual([
      { deliveryId, type: "submission-settled" },
      { deliveryId, segments: [], type: "canonical-response-ready" },
    ]);

    harness.emit(completedTranscript(7, "The next answer.", "next-item"));
    await vi.waitFor(() =>
      expect(harness.submitInterviewAnswer).toHaveBeenCalledTimes(2),
    );
    expect(harness.submitInterviewAnswer).toHaveBeenLastCalledWith(
      expect.objectContaining({ text: "The next answer." }),
    );
  });

  test("speaks a completed canonical segment while chat remains streaming and settles separately", async () => {
    const harness = createHarness();
    startReady(harness, 7);
    harness.emit(completedTranscript(7));
    await vi.waitFor(() =>
      expect(harness.submitInterviewAnswer).toHaveBeenCalledOnce(),
    );
    const correlated = segment(
      "correlated",
      "Speak this committed response.",
      "submission-voice-1",
    );
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: false,
      canonicalSegments: [correlated],
      status: "streaming",
    });

    expect(harness.session.speakCanonical).not.toHaveBeenCalled();
    harness.bridge.notifyResponseMessageCompleted(
      completedResponseMessage(correlated.messageId, "submission-voice-1", 1),
    );

    expect(harness.session.speakCanonical).toHaveBeenCalledWith([correlated]);
    expect(harness.events.map(({ type }) => type)).not.toContain(
      "submission-settled",
    );
    expect(harness.events.map(({ type }) => type)).not.toContain(
      "canonical-response-ready",
    );

    harness.bridge.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [correlated],
      status: "ready",
    });

    expect(harness.session.speakCanonical).toHaveBeenCalledOnce();
    expect(harness.events.slice(-2).map(({ type }) => type)).toEqual([
      "submission-settled",
      "canonical-response-ready",
    ]);
  });

  test("does not let a completed reasoning-only or tool-only step authorize later text", async () => {
    const harness = createHarness();
    startReady(harness, 7);
    harness.emit(completedTranscript(7));
    await vi.waitFor(() =>
      expect(harness.submitInterviewAnswer).toHaveBeenCalledOnce(),
    );
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: false,
      canonicalSegments: [],
      status: "streaming",
    });

    const messageId = "reasoning-or-tool-message";
    harness.bridge.notifyResponseMessageCompleted(
      completedResponseMessage(messageId, "submission-voice-1", 1),
    );
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: false,
      canonicalSegments: [],
      status: "streaming",
    });
    harness.bridge.notifyResponseMessageStarted({
      messageId,
      position: { batch: 1, index: 2 },
      submissionId: "submission-voice-1",
    });
    const laterText = {
      ...segment(
        "not-yet-completed",
        "Do not let the earlier completion authorize this text.",
      ),
      messageId,
      submissionIds: ["submission-voice-1"],
    };
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: false,
      canonicalSegments: [laterText],
      status: "streaming",
    });

    expect(harness.session.speakCanonical).not.toHaveBeenCalled();

    harness.bridge.notifyResponseMessageCompleted(
      completedResponseMessage(messageId, "submission-voice-1", 3),
    );
    expect(harness.session.speakCanonical).toHaveBeenCalledWith([laterText]);
  });

  test("speaks later continuation segments once and in canonical order", async () => {
    const harness = createHarness();
    startReady(harness, 7);
    harness.emit(completedTranscript(7));
    await vi.waitFor(() =>
      expect(harness.submitInterviewAnswer).toHaveBeenCalledOnce(),
    );
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: false,
      canonicalSegments: [],
      status: "streaming",
    });
    const first = {
      ...segment("first", "First committed segment."),
      messageId: "assistant-response",
      submissionIds: ["submission-voice-1"],
    };
    harness.bridge.notifyResponseMessageCompleted(
      completedResponseMessage(first.messageId, "submission-voice-1", 1),
    );
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: false,
      canonicalSegments: [first],
      status: "streaming",
    });
    harness.bridge.notifyResponseMessageCompleted(
      completedResponseMessage(first.messageId, "submission-voice-1", 1),
    );

    const second = {
      ...segment("second", "Second committed segment."),
      messageId: first.messageId,
      submissionIds: ["submission-voice-1", "submission-continuation"],
    };
    const third = {
      ...segment("third", "Third committed segment."),
      messageId: first.messageId,
      submissionIds: ["submission-voice-1", "submission-continuation"],
    };
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: false,
      canonicalSegments: [first, second, third],
      status: "streaming",
    });
    expect(harness.session.speakCanonical).toHaveBeenCalledTimes(1);

    harness.bridge.notifyResponseMessageCompleted(
      completedResponseMessage(first.messageId, "submission-continuation", 2),
    );

    const fourth = {
      ...segment("fourth", "Fourth committed segment."),
      messageId: first.messageId,
      submissionIds: ["submission-voice-1", "submission-continuation"],
    };
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: false,
      canonicalSegments: [first, second, third, fourth],
      status: "streaming",
    });
    harness.bridge.notifyResponseMessageCompleted(
      completedResponseMessage(first.messageId, "submission-continuation", 3),
    );

    expect(harness.session.speakCanonical.mock.calls).toEqual([
      [[first]],
      [[second, third]],
      [[fourth]],
    ]);
  });

  test("does not start speech cancelled while its correlated response is pending", async () => {
    const harness = createHarness();
    startReady(harness, 7);
    harness.emit(completedTranscript(7));
    await vi.waitFor(() =>
      expect(harness.submitInterviewAnswer).toHaveBeenCalledOnce(),
    );
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: false,
      canonicalSegments: [],
      status: "streaming",
    });

    harness.bridge.cancelPendingSpeech();

    const correlated = segment(
      "correlated",
      "Retain this without speaking it.",
      "submission-voice-1",
    );
    harness.bridge.notifyResponseMessageCompleted(
      completedResponseMessage(correlated.messageId, "submission-voice-1", 1),
    );
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: false,
      canonicalSegments: [correlated],
      status: "streaming",
    });
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [correlated],
      status: "ready",
    });

    expect(harness.session.speakCanonical).not.toHaveBeenCalled();
    expect(harness.events.at(-1)).toMatchObject({
      segments: [correlated],
      speechCancelled: true,
      type: "canonical-response-ready",
    });
  });

  test("does not speak a completed segment from an aborted submission", async () => {
    const harness = createHarness();
    startReady(harness, 7);
    harness.emit(completedTranscript(7));
    await vi.waitFor(() =>
      expect(harness.submitInterviewAnswer).toHaveBeenCalledOnce(),
    );
    const aborted = segment(
      "aborted",
      "Never speak an aborted response.",
      "submission-voice-1",
    );
    harness.bridge.notifyResponseMessageCompleted(
      completedResponseMessage(aborted.messageId, "submission-voice-1", 1),
    );
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: false,
      canonicalSegments: [aborted],
      settlements: [{ outcome: "aborted", submissionId: "submission-voice-1" }],
      status: "streaming",
    });
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [aborted],
      settlements: [{ outcome: "aborted", submissionId: "submission-voice-1" }],
      status: "ready",
    });

    expect(harness.session.speakCanonical).not.toHaveBeenCalled();
    expect(harness.events.at(-1)).toEqual({
      deliveryId: createRealtimeSubmissionId(transcriptKey(7)),
      outcome: "aborted",
      type: "submission-stopped",
    });
  });

  test("rejects a path-B result that does not preserve the delivery identity", async () => {
    const harness = createHarness();
    harness.submitInterviewAnswer.mockResolvedValueOnce({
      kind: "message",
      messageId: "different-message",
      submissionId: "submission-voice-1",
    });
    startReady(harness);

    harness.emit(completedTranscript(3));

    await vi.waitFor(() =>
      expect(harness.events).toContainEqual(
        expect.objectContaining({
          code: "interview-correlation",
          type: "error",
        }),
      ),
    );
  });

  test.each([
    {
      code: "admission-rejected",
      failure: { kind: "rejected", status: 403 } as const,
      message: "Brunch rejected the message before admission (HTTP 403).",
    },
    {
      code: "admission-conflict",
      failure: {
        kind: "submission-conflict",
        status: 409,
        submissionId: "submission-existing",
      } as const,
      message:
        "The delivery key already belongs to admitted submission submission-existing; the changed payload was not admitted.",
    },
    {
      code: "admission-ambiguous",
      failure: { kind: "ambiguous" } as const,
      message:
        "Brunch may have accepted the message, but admission could not be confirmed. Reopen the conversation before trying again.",
    },
    {
      code: "admission-aborted",
      failure: { kind: "aborted" } as const,
      message: "The local chat submission was cancelled.",
    },
  ])(
    "preserves a $failure.kind admission outcome",
    async ({ code, failure, message }) => {
      const harness = createHarness();
      harness.submitInterviewAnswer.mockRejectedValueOnce(
        new FlueChatAdmissionError(failure),
      );
      startReady(harness);

      harness.emit(completedTranscript(3));

      await vi.waitFor(() =>
        expect(harness.events).toContainEqual({
          code,
          failure,
          message,
          type: "error",
        }),
      );
      expect(harness.submitInterviewAnswer).toHaveBeenCalledOnce();
    },
  );

  test("requires a shared chat busy cycle before accepting new canonical text", async () => {
    const harness = createHarness();
    startReady(harness);
    harness.emit(completedTranscript(3));
    await vi.waitFor(() =>
      expect(harness.submitInterviewAnswer).toHaveBeenCalledOnce(),
    );
    const response = segment(
      "response",
      "Canonical response.",
      "submission-voice-1",
    );

    harness.bridge.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [response],
      status: "ready",
    });
    expect(harness.session.speakCanonical).not.toHaveBeenCalled();

    harness.bridge.updateChat({
      canAcceptInterviewAnswer: false,
      canonicalSegments: [response],
      status: "streaming",
    });
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [response],
      status: "ready",
    });

    expect(harness.session.speakCanonical).toHaveBeenCalledWith([response]);
  });
});
