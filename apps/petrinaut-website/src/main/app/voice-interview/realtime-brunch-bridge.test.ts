import { describe, expect, test, vi } from "vitest";

import { FlueChatAdmissionError } from "@hashintel/brunch-agent-transport-aisdk";

import { selectCanonicalSpeech } from "./canonical-speech";
import {
  createRealtimeSubmissionId,
  RealtimeBrunchBridge,
} from "./realtime-brunch-bridge";

import type {
  OpenAIRealtimeSession,
  OpenAIRealtimeSessionEvent,
} from "./openai-realtime-session";
import type { RealtimeBrunchBridgeEvent } from "./realtime-brunch-bridge";
import type { PetrinautAiMessage } from "@hashintel/petrinaut/ui";

const response = (id: string, text: string): PetrinautAiMessage => ({
  id,
  role: "assistant",
  parts: [{ type: "text", text, state: "done" }],
});

const createHarness = () => {
  let listener: ((event: OpenAIRealtimeSessionEvent) => void) | undefined;
  const session = {
    speakParaphrase: vi.fn<OpenAIRealtimeSession["speakParaphrase"]>(),
    speakNotice: vi.fn<OpenAIRealtimeSession["speakNotice"]>(),
    subscribe: (next: (event: OpenAIRealtimeSessionEvent) => void) => {
      listener = next;
      return () => {
        listener = undefined;
      };
    },
  };
  type Input = Parameters<
    ConstructorParameters<
      typeof RealtimeBrunchBridge
    >[0]["submitInterviewAnswer"]
  >[0];
  const inputs: Input[] = [];
  const submitInterviewAnswer = vi.fn(async (input: Input) => {
    inputs.push(input);
    if (inputs.length > 1) input.onQueued?.();
    return { kind: "message" as const, messageId: input.id };
  });
  const bridge = new RealtimeBrunchBridge({ session, submitInterviewAnswer });
  const events: RealtimeBrunchBridgeEvent[] = [];
  bridge.subscribe((event) => events.push(event));
  bridge.updateChat({
    canAcceptInterviewAnswer: true,
    canonicalSegments: [],
    status: "ready",
  });
  bridge.start(3);
  const submit = async (
    text = "Explain this.",
    itemId = "item-1",
    epoch = 3,
  ) => {
    listener?.({
      type: "completed",
      text,
      key: { itemId, contentIndex: 0, connectionEpoch: epoch },
    });
    await Promise.resolve();
    return inputs.at(-1)!;
  };
  const admit = (input: Input, submissionId = "root", messageId = "reply") => {
    input.onAdmission(submissionId);
    bridge.notifyResponseMessageStarted({
      submissionId,
      messageId,
      position: { batch: 1, index: 0 },
    });
  };
  const finish = (
    input: Input,
    messages = [
      response("reply", "May help, but this has not been simulated."),
    ],
    outcome: "completed" | "failed" | "aborted" = "completed",
  ) => input.onTurnComplete?.({ messages, outcome });
  return {
    bridge,
    session,
    events,
    inputs,
    submit,
    admit,
    finish,
    emit: (event: OpenAIRealtimeSessionEvent) => listener?.(event),
    submitInterviewAnswer,
  };
};

describe("RealtimeBrunchBridge completed-response experiment", () => {
  test("requires both whole panel completion and successful Flue settlement, never a completed text step", async () => {
    const harness = createHarness();
    const input = await harness.submit();
    harness.admit(input);
    const messages = [
      response("reply", "May help, but this has not been simulated."),
    ];
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: selectCanonicalSpeech(messages).segments,
      status: "ready",
    });
    harness.bridge.notifyResponseMessageCompleted({
      submissionId: "root",
      messageId: "reply",
      position: { batch: 1, index: 1 },
    });
    harness.finish(input, messages);
    expect(harness.session.speakParaphrase).not.toHaveBeenCalled();
    harness.bridge.notifySubmissionSettled({
      submissionId: "root",
      outcome: "completed",
    });
    expect(harness.session.speakParaphrase).toHaveBeenCalledExactlyOnceWith(
      expect.arrayContaining([
        expect.objectContaining({
          text:
            messages[0]!.parts[0]!.type === "text"
              ? messages[0]!.parts[0]!.text
              : "",
        }),
      ]),
      { deliveryId: input.id },
    );
    harness.finish(input, messages);
    expect(harness.session.speakParaphrase).toHaveBeenCalledOnce();
  });

  test("supplies the full ordered report including later corrections only after the last continuation", async () => {
    const harness = createHarness();
    const input = await harness.submit();
    harness.admit(input);
    harness.bridge.notifySubmissionSettled({
      submissionId: "root",
      outcome: "completed",
    });
    const continuation = {
      kind: "client-tool-result" as const,
      messageId: "reply",
      admission: { submissionId: "follow" },
    };
    harness.bridge.notifyAdmission(continuation);
    harness.bridge.notifyAdmission(continuation);
    const messages: PetrinautAiMessage[] = [
      {
        id: "reply",
        role: "assistant",
        parts: [
          {
            type: "text",
            state: "done",
            text: "Initial estimate: enough capacity.",
          },
          {
            type: "text",
            state: "done",
            text: "Correction: capacity is unproven. ".repeat(100),
          },
        ],
      },
    ];
    harness.finish(input, messages);
    expect(harness.session.speakParaphrase).not.toHaveBeenCalled();
    harness.bridge.notifySubmissionSettled({
      submissionId: "follow",
      outcome: "completed",
    });
    expect(
      harness.session.speakParaphrase.mock.calls[0]?.[0].map(
        ({ text }: { text: string }) => text,
      ),
    ).toEqual([
      "Initial estimate: enough capacity.",
      "Correction: capacity is unproven. ".repeat(100),
    ]);
    expect(
      harness.session.speakNotice.mock.calls.filter(
        ([kind]) => kind === "continuing",
      ),
    ).toHaveLength(1);
  });

  test.each(["failed", "aborted"] as const)(
    "withholds a %s continuation that never writes a message",
    async (outcome) => {
      const harness = createHarness();
      const input = await harness.submit();
      harness.admit(input);
      harness.bridge.notifySubmissionSettled({
        submissionId: "root",
        outcome: "completed",
      });
      harness.bridge.notifyAdmission({
        kind: "client-tool-result",
        messageId: "reply",
        admission: { submissionId: "textless" },
      });
      harness.bridge.notifySubmissionSettled({
        submissionId: "textless",
        outcome,
      });
      harness.finish(input);
      harness.bridge.notifySubmissionSettled({
        submissionId: "textless",
        outcome: "completed",
      });
      expect(harness.session.speakParaphrase).not.toHaveBeenCalled();
      expect(harness.events).toContainEqual({
        deliveryId: input.id,
        type: "submission-stopped",
        outcome,
      });
    },
  );

  test.each(["failed", "aborted"] as const)(
    "withholds a panel %s even when its last Flue step succeeded",
    async (outcome) => {
      const harness = createHarness();
      const input = await harness.submit();
      harness.admit(input);
      harness.bridge.notifySubmissionSettled({
        submissionId: "root",
        outcome: "completed",
      });
      harness.finish(input, undefined, outcome);
      expect(harness.session.speakParaphrase).not.toHaveBeenCalled();
    },
  );

  test("keeps queued input separate from the previous completed response and accepts input during playback", async () => {
    const harness = createHarness();
    const first = await harness.submit("First request", "a");
    harness.admit(first, "root-a", "reply-a");
    harness.emit({
      type: "output-started",
      connectionEpoch: 3,
      responseId: "ack",
      speechRequestId: "ack",
    });
    const second = await harness.submit("Second request", "b");
    expect(harness.inputs).toHaveLength(2);
    expect(harness.session.speakNotice).toHaveBeenCalledWith(
      "queued",
      second.id,
    );
    harness.bridge.notifySubmissionSettled({
      submissionId: "root-a",
      outcome: "completed",
    });
    harness.finish(first, [response("reply-a", "First qualified answer.")]);
    harness.admit(second, "root-b", "reply-b");
    harness.bridge.notifySubmissionSettled({
      submissionId: "root-b",
      outcome: "completed",
    });
    harness.finish(second, [
      response("reply-a", "First qualified answer."),
      response("reply-b", "Second answer."),
    ]);
    expect(
      harness.session.speakParaphrase.mock.calls.map(([segments, options]) => ({
        texts: segments.map(({ text }: { text: string }) => text),
        id: options.deliveryId,
      })),
    ).toEqual([
      { texts: ["First qualified answer."], id: first.id },
      { texts: ["Second answer."], id: second.id },
    ]);
  });

  test("preserves exact transcript text and submits only completed, identity-deduplicated input", async () => {
    const harness = createHarness();
    harness.emit({
      type: "partial",
      text: "Wait",
      key: { connectionEpoch: 3, contentIndex: 0, itemId: "partial" },
    });
    expect(harness.inputs).toHaveLength(0);
    const text = "  Preserve   this\nwording.  ";
    await harness.submit(text, "a");
    await harness.submit(text, "a");
    await harness.submit(text, "b");
    expect(harness.inputs.map(({ text: submitted }) => submitted)).toEqual([
      text,
      text,
    ]);
    expect(harness.inputs[0]).toMatchObject({
      target: "message",
      admissionTarget: { kind: "user", messageId: harness.inputs[0]!.id },
    });
    expect(harness.events).toContainEqual({
      type: "transcript-rejected",
      reason: "duplicate",
    });
  });

  test.each([
    ["", "empty"],
    [" \n ", "empty"],
    ["x".repeat(32_001), "over-limit"],
  ] as const)("rejects invalid transcript %s", async (text, reason) => {
    const harness = createHarness();
    await harness.submit(text);
    expect(harness.inputs).toHaveLength(0);
    expect(harness.events).toEqual([{ type: "transcript-rejected", reason }]);
  });

  test("ignores stale epochs and recovers after a failed transcription", async () => {
    const harness = createHarness();
    await harness.submit("Stale", "stale", 2);
    harness.emit({
      type: "transcription-failed",
      key: { connectionEpoch: 3, contentIndex: 0, itemId: "failed" },
    });
    await harness.submit("Fresh", "fresh");
    expect(harness.inputs.map(({ text }) => text)).toEqual(["Fresh"]);
  });

  test("never speaks historical, typed, unrelated or streaming text", async () => {
    const harness = createHarness();
    const unrelated = response("typed", "Not this turn.");
    harness.bridge.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: selectCanonicalSpeech([unrelated]).segments,
      status: "ready",
    });
    expect(harness.session.speakParaphrase).not.toHaveBeenCalled();
    const input = await harness.submit();
    harness.admit(input);
    harness.bridge.notifySubmissionSettled({
      submissionId: "root",
      outcome: "completed",
    });
    harness.finish(input, [
      unrelated,
      {
        id: "reply",
        role: "assistant",
        parts: [{ type: "text", state: "streaming", text: "Unfinished" }],
      },
    ]);
    expect(harness.session.speakParaphrase).not.toHaveBeenCalled();
  });

  test("retains exact Brunch question marker in the completed response only", async () => {
    const harness = createHarness();
    const input = await harness.submit();
    harness.admit(input);
    harness.bridge.notifySubmissionSettled({
      submissionId: "root",
      outcome: "completed",
    });
    const question = "Which shift owns the crew?";
    const message = response("reply", `This is still unknown. ${question}`);
    message.parts.push({
      type: "data-brunch-question",
      data: { question, toolCallId: "mark" },
    });
    harness.finish(input, [message]);
    expect(harness.session.speakParaphrase.mock.calls[0]?.[1]).toMatchObject({
      deliveryId: input.id,
      questionSegment: { text: question },
    });
  });

  test("cancellation is irreversible for pending speech but preserves canonical replay content", async () => {
    const harness = createHarness();
    const input = await harness.submit();
    harness.admit(input);
    harness.bridge.cancelPendingSpeech();
    harness.bridge.completeTurnHandoff();
    harness.bridge.notifySubmissionSettled({
      submissionId: "root",
      outcome: "completed",
    });
    harness.finish(input);
    expect(harness.session.speakParaphrase).not.toHaveBeenCalled();
    expect(harness.events.at(-1)).toMatchObject({
      type: "canonical-response-ready",
      speechCancelled: true,
    });
  });

  test("suspension retains queued inputs but suppresses responses finished while disconnected", async () => {
    const harness = createHarness();
    const first = await harness.submit();
    harness.admit(first);
    const queued = await harness.submit("Next", "b");
    harness.bridge.suspend();
    expect(queued.signal.aborted).toBe(false);
    harness.bridge.notifySubmissionSettled({
      submissionId: "root",
      outcome: "completed",
    });
    harness.finish(first);
    harness.bridge.resume(4);
    expect(harness.session.speakParaphrase).not.toHaveBeenCalled();
    harness.admit(queued, "next", "next-reply");
    harness.bridge.notifySubmissionSettled({
      submissionId: "next",
      outcome: "completed",
    });
    harness.finish(queued, [response("next-reply", "New answer")]);
    expect(harness.session.speakParaphrase).toHaveBeenCalledOnce();
    harness.bridge.stop();
  });

  test("end withdraws unsent input and late callbacks cannot autoplay after restart", async () => {
    const harness = createHarness();
    const first = await harness.submit();
    harness.admit(first);
    const queued = await harness.submit("Next", "b");
    harness.bridge.stop();
    expect(queued.signal.aborted).toBe(true);
    harness.bridge.start(4);
    harness.bridge.notifySubmissionSettled({
      submissionId: "root",
      outcome: "completed",
    });
    harness.finish(first);
    expect(harness.session.speakParaphrase).not.toHaveBeenCalled();
  });

  test.each([
    { kind: "rejected", status: 403 } as const,
    {
      kind: "submission-conflict",
      status: 409,
      submissionId: "existing",
    } as const,
    { kind: "ambiguous" } as const,
  ])("preserves $kind admission failure without retry", async (failure) => {
    const harness = createHarness();
    harness.submitInterviewAnswer.mockRejectedValueOnce(
      new FlueChatAdmissionError(failure),
    );
    await harness.submit();
    expect(harness.events).toContainEqual(
      expect.objectContaining({ type: "error", failure }),
    );
    expect(harness.submitInterviewAnswer).toHaveBeenCalledOnce();
    expect(harness.session.speakParaphrase).not.toHaveBeenCalled();
  });

  test("rejects conflicting admission identities", async () => {
    const harness = createHarness();
    const input = await harness.submit();
    input.onAdmission("first");
    input.onAdmission("different");
    expect(harness.events).toContainEqual(
      expect.objectContaining({ type: "error", code: "interview-correlation" }),
    );
  });

  test("stable identity includes epoch, encoded item and content index", () => {
    expect(
      createRealtimeSubmissionId({
        connectionEpoch: 12,
        itemId: "item/with spaces",
        contentIndex: 4,
      }),
    ).toBe("voice-realtime:12:item%2Fwith%20spaces:4");
  });
});
