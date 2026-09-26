import { expect, test, vi } from "vitest";

import { createFlueUiStream } from "../src/ui-stream";

import type { LiveToolStreamEvent } from "../src/live-tool-stream";
import type { ConversationStreamChunk } from "@flue/sdk";
import type { UIMessageChunk } from "ai";

const position = (index: number) => ({ batch: 1, index });

const project = (
  chunks: readonly ConversationStreamChunk[],
): UIMessageChunk[] => {
  const written: UIMessageChunk[] = [];
  const projector = createFlueUiStream({
    submissionId: "submission-1",
    clientToolNames: new Set(["readPetrinautDoc"]),
    write: (chunk) => written.push(chunk),
  });
  for (const chunk of chunks) projector.accept(chunk);
  return written;
};

test("projects data and metadata onto the AI SDK stream", () => {
  const written = project([
    {
      type: "message-started",
      conversationId: "conversation-1",
      messageId: "message-1",
      submissionId: "submission-1",
      turnId: "turn-1",
      position: position(0),
    },
    {
      type: "message-metadata",
      conversationId: "conversation-1",
      messageId: "message-1",
      metadata: { elapsedMs: 17 },
      position: position(1),
    },
    {
      type: "data-part",
      conversationId: "conversation-1",
      messageId: "message-1",
      name: "orderCard",
      data: { orderId: "42", status: "loaded" },
      position: position(2),
    },
    {
      type: "submission-settled",
      conversationId: "conversation-1",
      submissionId: "submission-1",
      outcome: "completed",
      position: position(3),
    },
  ]);

  expect(written).toContainEqual({
    type: "message-metadata",
    messageMetadata: { elapsedMs: 17 },
  });
  expect(written).toContainEqual({
    type: "data-orderCard",
    data: { orderId: "42", status: "loaded" },
  });
});

test("ignores observation catch-up chunks in a submission stream", () => {
  const written = project([
    {
      type: "message-started",
      conversationId: "conversation-1",
      messageId: "message-1",
      submissionId: "submission-1",
      turnId: "turn-1",
      position: position(0),
    },
    {
      type: "stream-checkpoint",
      incarnation: "incarnation-1",
    },
    {
      type: "conversation-reset",
      conversationId: "conversation-1",
      snapshot: {
        v: 1,
        conversationId: "conversation-1",
        offset: "0",
        messages: [],
        settlements: [],
      },
      position: position(1),
    },
    {
      type: "message-appended",
      conversationId: "conversation-1",
      message: {
        id: "user-1",
        role: "user",
        purpose: "user",
        display: "visible",
        parts: [{ type: "text", text: "Hello.", state: "done" }],
      },
      position: position(2),
    },
    {
      type: "submission-settled",
      conversationId: "conversation-1",
      submissionId: "submission-1",
      outcome: "completed",
      position: position(3),
    },
  ]);

  expect(written.map((chunk) => chunk.type)).toEqual([
    "start",
    "start-step",
    "finish-step",
    "finish",
  ]);
});

test("maps client-tool input before exposing it to the AI SDK", () => {
  const written: UIMessageChunk[] = [];
  const projector = createFlueUiStream({
    submissionId: "submission-1",
    clientToolNames: new Set(["addArc"]),
    mapClientToolInput: ({ input }) => ({ ...(input as object), weight: 1 }),
    write: (chunk) => written.push(chunk),
  });
  projector.accept({
    type: "message-started",
    conversationId: "conversation-1",
    messageId: "message-1",
    submissionId: "submission-1",
    turnId: "turn-1",
    position: position(0),
  });
  projector.accept({
    type: "tool-input",
    conversationId: "conversation-1",
    messageId: "message-1",
    toolCallId: "call-1",
    toolName: "addArc",
    input: { weight: "1" },
    position: position(1),
  });

  expect(written).toContainEqual({
    type: "tool-input-available",
    toolCallId: "call-1",
    toolName: "addArc",
    input: { weight: 1 },
  });
});

test("marks host-defined client tools as dynamic for the AI SDK", () => {
  const written: UIMessageChunk[] = [];
  const projector = createFlueUiStream({
    submissionId: "submission-1",
    clientToolNames: new Set(["mutate_petrinet"]),
    dynamicClientToolNames: new Set(["mutate_petrinet"]),
    write: (chunk) => written.push(chunk),
  });
  projector.accept({
    type: "message-started",
    conversationId: "conversation-1",
    messageId: "message-1",
    submissionId: "submission-1",
    turnId: "turn-1",
    position: position(0),
  });
  projector.accept({
    type: "tool-input",
    conversationId: "conversation-1",
    messageId: "message-1",
    toolCallId: "call-1",
    toolName: "mutate_petrinet",
    input: { operations: [] },
    position: position(1),
  });

  expect(written).toContainEqual({
    type: "tool-input-available",
    toolCallId: "call-1",
    toolName: "mutate_petrinet",
    input: { operations: [] },
    dynamic: true,
  });
});

test("bounds cyclic failed-submission objects", () => {
  const cyclicError: Record<string, unknown> = { reason: "Recursive failure" };
  cyclicError.self = cyclicError;
  cyclicError.payload = "x".repeat(20_000);

  const written = project([
    {
      type: "submission-settled",
      conversationId: "conversation-1",
      submissionId: "submission-1",
      outcome: "failed",
      error: cyclicError,
      position: position(0),
    },
  ]);

  const failure = written.find((chunk) => chunk.type === "error");
  expect(failure?.errorText).toContain('"self":"[Circular]"');
  expect(failure?.errorText.length).toBeLessThanOrEqual(10_000);
});

test("reports server tool failures to the diagnostic callback before projection", () => {
  const written: UIMessageChunk[] = [];
  const reported: Parameters<
    NonNullable<Parameters<typeof createFlueUiStream>[0]["onToolOutputError"]>
  >[0][] = [];
  const projector = createFlueUiStream({
    submissionId: "submission-1",
    clientToolNames: new Set(["readPetrinautDoc"]),
    onToolOutputError: (event) => reported.push(event),
    write: (chunk) => written.push(chunk),
  });
  projector.accept({
    type: "message-started",
    conversationId: "conversation-1",
    messageId: "message-1",
    submissionId: "submission-1",
    turnId: "turn-1",
    position: position(0),
  });
  projector.accept({
    type: "tool-input",
    conversationId: "conversation-1",
    messageId: "message-1",
    toolCallId: "visible-1",
    toolName: "query_workpiece",
    input: {},
    position: position(1),
  });
  projector.accept({
    type: "tool-output-error",
    conversationId: "conversation-1",
    toolCallId: "visible-1",
    errorText: "Unknown governing revision",
    position: position(2),
  });

  expect(reported).toEqual([
    {
      submissionId: "submission-1",
      toolCallId: "visible-1",
      toolName: "query_workpiece",
      errorText: "Unknown governing revision",
    },
  ]);
  const errorChunks = written.filter(
    (chunk) => chunk.type === "tool-output-error",
  );
  expect(errorChunks).toEqual([
    {
      type: "tool-output-error",
      toolCallId: "visible-1",
      errorText: "Unknown governing revision",
      providerExecuted: true,
    },
  ]);
});

test("does not report tool failures from another submission", () => {
  const reported: unknown[] = [];
  const projector = createFlueUiStream({
    submissionId: "submission-1",
    clientToolNames: new Set(),
    onToolOutputError: (event) => reported.push(event),
    write: () => {},
  });
  projector.accept({
    type: "message-started",
    conversationId: "conversation-1",
    messageId: "message-9",
    submissionId: "submission-other",
    turnId: "turn-9",
    position: position(0),
  });
  projector.accept({
    type: "tool-output-error",
    conversationId: "conversation-1",
    toolCallId: "other-1",
    errorText: "not ours",
    position: position(1),
  });
  expect(reported).toEqual([]);
});

const liveEvent = (
  sequence: number,
  event:
    | {
        readonly kind: "tool-input-delta";
        readonly inputTextDelta: string;
        readonly toolCallId: string;
        readonly toolName: string;
      }
    | {
        readonly kind: "tool-input-start";
        readonly toolCallId: string;
        readonly toolName: string;
      },
): LiveToolStreamEvent => ({
  ...event,
  instanceId: "instance-1",
  sequence,
  submissionId: "submission-1",
  turnId: "turn-1",
  v: 1,
});

test("does not regress admitted calls on duplicate, out-of-order, or terminal live events", () => {
  const written: UIMessageChunk[] = [];
  const projector = createFlueUiStream({
    submissionId: "submission-1",
    clientToolNames: new Set(),
    write: (chunk) => written.push(chunk),
  });
  projector.accept({
    type: "message-started",
    conversationId: "conversation-1",
    messageId: "message-1",
    submissionId: "submission-1",
    turnId: "turn-1",
    position: position(0),
  });
  projector.accept({
    type: "tool-input",
    conversationId: "conversation-1",
    messageId: "message-1",
    toolCallId: "canonical-call",
    toolName: "read_workpiece",
    input: {},
    position: position(1),
  });
  const before = [...written];
  projector.acceptLive(
    liveEvent(3, {
      kind: "tool-input-start",
      toolCallId: "canonical-call",
      toolName: "read_workpiece",
    }),
  );
  projector.acceptLive(
    liveEvent(3, {
      kind: "tool-input-delta",
      inputTextDelta: "{}",
      toolCallId: "canonical-call",
      toolName: "read_workpiece",
    }),
  );
  projector.acceptLive(
    liveEvent(2, {
      kind: "tool-input-start",
      toolCallId: "late-call",
      toolName: "read_workpiece",
    }),
  );
  projector.acceptLive({
    instanceId: "instance-1",
    kind: "turn-finished",
    sequence: 4,
    submissionId: "submission-1",
    turnId: "turn-1",
    v: 1,
  });
  expect(written).toEqual(before);
});

test.each(["turn", "disconnect"] as const)(
  "terminates an abandoned live proposal on %s",
  (terminal) => {
    const written: UIMessageChunk[] = [];
    const projector = createFlueUiStream({
      submissionId: "submission-1",
      clientToolNames: new Set(),
      write: (chunk) => written.push(chunk),
    });
    projector.accept({
      type: "message-started",
      conversationId: "conversation-1",
      messageId: "message-1",
      submissionId: "submission-1",
      turnId: "turn-1",
      position: position(0),
    });
    projector.acceptLive(
      liveEvent(0, {
        kind: "tool-input-start",
        toolCallId: "abandoned-call",
        toolName: "read_workpiece",
      }),
    );
    if (terminal === "turn") {
      projector.acceptLive({
        instanceId: "instance-1",
        kind: "turn-finished",
        sequence: 1,
        submissionId: "submission-1",
        turnId: "turn-1",
        v: 1,
      });
    } else {
      projector.disconnectLive();
    }
    expect(written).toContainEqual({
      type: "tool-input-error",
      toolCallId: "abandoned-call",
      toolName: "read_workpiece",
      input: undefined,
      errorText: "This tool proposal was not executed.",
    });
  },
);

test("lets canonical admission win the live turn-terminal race", () => {
  vi.useFakeTimers();
  try {
    const written: UIMessageChunk[] = [];
    const projector = createFlueUiStream({
      submissionId: "submission-1",
      clientToolNames: new Set(),
      provisionalMessageId: (turnId) => `live:${turnId}`,
      write: (chunk) => written.push(chunk),
    });
    projector.accept({
      type: "message-started",
      conversationId: "conversation-1",
      messageId: "message-1",
      submissionId: "submission-1",
      turnId: "turn-1",
      position: position(0),
    });
    projector.acceptLive(
      liveEvent(0, {
        kind: "tool-input-start",
        toolCallId: "racing-call",
        toolName: "read_workpiece",
      }),
    );
    projector.acceptLive({
      instanceId: "instance-1",
      kind: "turn-finished",
      sequence: 1,
      submissionId: "submission-1",
      turnId: "turn-1",
      v: 1,
    });
    projector.accept({
      type: "tool-input",
      conversationId: "conversation-1",
      input: {},
      messageId: "message-1",
      position: position(1),
      toolCallId: "racing-call",
      toolName: "read_workpiece",
    });
    vi.runAllTimers();

    expect(written.some((chunk) => chunk.type === "tool-input-error")).toBe(
      false,
    );
    expect(written).toContainEqual({
      type: "tool-input-available",
      input: {},
      providerExecuted: true,
      toolCallId: "racing-call",
      toolName: "read_workpiece",
    });
  } finally {
    vi.useRealTimers();
  }
});
