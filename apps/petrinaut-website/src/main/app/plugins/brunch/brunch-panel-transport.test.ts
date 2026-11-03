import { Chat } from "@ai-sdk/react";
import { FetchError, FlueApiError } from "@flue/sdk";
import { expect, test, vi } from "vitest";

import {
  parsePetrinautUserMessageBody,
  petrinautContextualUserMessageBody,
  readPetrinautSubmissionContext,
} from "@hashintel/brunch-agent";
import { FlueChatDisconnectError } from "@local/flue-aisdk-transport";

import { interviewBudgetLevels } from "../../../../shared/interview-budget";
import { createBrunchFlueAdapter } from "./brunch-flue-adapter";
import {
  BrunchPanelConversationTracker,
  createBrunchPanelTransport,
  createUnavailableBrunchPanelTransport,
} from "./brunch-panel-transport";
import { canonicalPetrinautClientToolNames } from "./tools/brunch-client-tools";

import type { PetrinautAiComposerSubmitText } from "./chat/ai-assistant-composer-control";
import type { PetrinautAiMessage } from "./chat/ai-assistant-panel";
import type { AgentSendResult, FlueClient } from "@flue/sdk";

// The same await-and-return contract as the panel, using the installed SDK.
const submitThroughChat =
  (chat: Chat<PetrinautAiMessage>): PetrinautAiComposerSubmitText =>
  async ({ id, text }) => {
    if (id === undefined) throw new Error("Expected a delivery identity");
    await chat.sendMessage({
      id,
      role: "user",
      parts: [{ type: "text", text }],
    });
    return { kind: "message", messageId: id };
  };

test("host submission rejects a refused admission even though SDK sendMessage fulfills", async () => {
  const send = vi.fn<FlueClient["send"]>(async () => {
    throw new FlueApiError(403, "Refused");
  });
  const tracker = new BrunchPanelConversationTracker();
  const chat = new Chat<PetrinautAiMessage>({
    transport: createBrunchPanelTransport(
      Promise.resolve({ send } as unknown as FlueClient),
      tracker,
    ),
  });
  const submitText = submitThroughChat(chat);
  await expect(submitText({ id: "raw", text: "Comments" })).resolves.toEqual({
    kind: "message",
    messageId: "raw",
  });
  expect(chat.error).toMatchObject({
    failure: { kind: "rejected", status: 403 },
  });
  await expect(
    tracker.submitTextWithAdmission(submitText, {
      id: "host",
      text: "Comments",
      target: "message",
      preserveDraft: true,
    }),
  ).rejects.toMatchObject({
    name: "FlueChatAdmissionError",
    failure: { kind: "rejected", status: 403 },
  });
});

test("captures words before waiting for the client and retains them for the same admission identity", async () => {
  let words = ["RelayDesk"];
  let resolveClient!: (client: FlueClient) => void;
  const clientPromise = new Promise<FlueClient>((resolve) => {
    resolveClient = resolve;
  });
  const send = vi.fn<FlueClient["send"]>(async () => {
    throw new FlueApiError(400, "Rejected");
  });
  const tracker = new BrunchPanelConversationTracker();
  const transport = createBrunchPanelTransport(clientPromise, tracker, {
    readWords: () => words,
  });
  const options = {
    trigger: "submit-message" as const,
    chatId: "one",
    messageId: "user-one",
    messages: [
      {
        id: "user-one",
        role: "user" as const,
        parts: [{ type: "text" as const, text: "Use it." }],
      },
    ],
    abortSignal: undefined,
  };
  const first = transport.sendMessages(options);
  words = ["Bay Three"];
  resolveClient({ send } as unknown as FlueClient);
  await expect(first).rejects.toThrow();
  await expect(transport.sendMessages(options)).rejects.toThrow();
  const expected = petrinautContextualUserMessageBody({
    userText: "Use it.",
    diagnosticsContext: "",
    submissionContext: { words: ["RelayDesk"] },
  });
  expect(
    send.mock.calls.map(([submission]) => submission.message.body),
  ).toEqual([expected, expected]);
});

test("an empty words snapshot without an allowance sends an ordinary message", async () => {
  const send = vi.fn<FlueClient["send"]>(async () => {
    throw new FlueApiError(400, "Rejected");
  });
  const transport = createBrunchPanelTransport(
    Promise.resolve({ send } as unknown as FlueClient),
    new BrunchPanelConversationTracker(),
    { readWords: () => [] },
  );
  await expect(
    transport.sendMessages({
      trigger: "submit-message",
      chatId: "one",
      messageId: "user-one",
      messages: [
        { id: "user-one", role: "user", parts: [{ type: "text", text: "Hi" }] },
      ],
      abortSignal: undefined,
    }),
  ).rejects.toThrow();
  expect(send.mock.calls[0]?.[0].message.body).toBe("Hi");
});

test.each(interviewBudgetLevels)(
  "sends current %s budget on each submission, with Off identical to the legacy request",
  async (level) => {
    const send = vi.fn<FlueClient["send"]>(async () => {
      throw new FlueApiError(503, "test admission unavailable");
    });
    const initialData = {
      binding: {
        documentId: "document",
        conversationId: "conversation",
        incarnationId: "incarnation",
      },
    };
    for (const inputMode of ["text", "voice"] as const) {
      for (const asked of [0, 2, 9]) {
        const tracker = new BrunchPanelConversationTracker();
        tracker.recordInputMode(inputMode);
        const transport = createBrunchPanelTransport(
          Promise.resolve({ send } as unknown as FlueClient),
          tracker,
          {
            initialData,
            interviewBudgetLevel: level,
            interviewRepliesAsked: asked,
          },
        );
        await expect(
          transport.sendMessages({
            trigger: "submit-message",
            chatId: "conversation",
            messageId: undefined,
            abortSignal: undefined,
            messages: [
              // Rendered messages can merge steps or include a wrap-up. They
              // are deliberately different from the host's canonical count.
              {
                id: "reply",
                role: "assistant",
                parts: [{ type: "text", text: "Recorded." }],
              },
              {
                id: "answer",
                role: "user",
                parts: [{ type: "text", text: "Four agents" }],
              },
            ],
          }),
        ).rejects.toThrow();
        const request = send.mock.lastCall?.[0];
        if (level === "off") {
          expect(JSON.stringify(request)).toBe(
            JSON.stringify({
              idempotencyKey: "ai-sdk:user:answer",
              message: { kind: "user", body: "Four agents" },
              initialData,
            }),
          );
        } else {
          const caps =
            inputMode === "text"
              ? { quick: 3, standard: 6, thorough: 10, deep: null }
              : { quick: 2, standard: 4, thorough: 7, deep: null };
          const questionCap = caps[level];
          const budget = {
            level,
            questionCap,
            asked,
            remaining:
              questionCap === null ? null : Math.max(0, questionCap - asked),
          };
          expect(request?.initialData).toEqual(initialData);
          expect(
            parsePetrinautUserMessageBody(request?.message.body ?? ""),
          ).toEqual({
            kind: "contextual",
            userText: "Four agents",
            diagnosticsContext: "",
            submissionContext: { interviewBudget: budget },
          });
          expect(
            readPetrinautSubmissionContext(
              parsePetrinautUserMessageBody(request?.message.body ?? ""),
            ).interviewBudget,
          ).toEqual(budget);
        }
      }
    }
  },
);

test.each([
  ["text sent during Voice", undefined, "voice", 4],
  ["queued Voice input sent after switching to text", "voice", "text", 6],
] as const)(
  "budgets %s by the panel's input mode, matching the estimate",
  async (_case, source, inputMode, questionCap) => {
    const send = vi.fn<FlueClient["send"]>(async () => {
      throw new FlueApiError(503, "test admission unavailable");
    });
    const tracker = new BrunchPanelConversationTracker();
    tracker.recordInputMode(inputMode);
    const transport = createBrunchPanelTransport(
      Promise.resolve({ send } as unknown as FlueClient),
      tracker,
      { interviewBudgetLevel: "standard", interviewRepliesAsked: 1 },
    );
    await expect(
      transport.sendMessages({
        trigger: "submit-message",
        chatId: "conversation",
        messageId: undefined,
        abortSignal: undefined,
        messages: [
          {
            id: "answer",
            role: "user",
            ...(source === undefined ? {} : { metadata: { source } }),
            parts: [{ type: "text", text: "Four agents" }],
          },
        ],
      }),
    ).rejects.toThrow();
    expect(
      parsePetrinautUserMessageBody(send.mock.lastCall?.[0].message.body ?? ""),
    ).toMatchObject({
      submissionContext: {
        interviewBudget: {
          level: "standard",
          questionCap,
          asked: 1,
          remaining: questionCap - 1,
        },
      },
    });
  },
);

test("publishes Stop immediately and supports unsubscribe", () => {
  const tracker = new BrunchPanelConversationTracker();
  const listener = vi.fn();
  const unsubscribedListener = vi.fn();
  tracker.subscribeToStopRequested(listener);
  const unsubscribe = tracker.subscribeToStopRequested(unsubscribedListener);
  unsubscribe();

  tracker.recordStopRequested();

  expect(listener).toHaveBeenCalledOnce();
  expect(unsubscribedListener).not.toHaveBeenCalled();
});

test("settles in-flight submissions before a durable abort can target them", async () => {
  const tracker = new BrunchPanelConversationTracker();
  let admit: (() => void) | undefined;
  void tracker.trackSubmission(
    new Promise<void>((resolve) => {
      admit = resolve;
    }),
  );
  let settled = false;
  void tracker.settleInFlightSubmissions().then(() => {
    settled = true;
  });

  await Promise.resolve();
  expect(settled).toBe(false);

  admit?.();
  await vi.waitFor(() => expect(settled).toBe(true));

  const rejected = tracker.trackSubmission(
    Promise.reject(new Error("rejected admission")),
  );
  await expect(rejected).rejects.toThrow("rejected admission");
  await expect(tracker.settleInFlightSubmissions()).resolves.toBeUndefined();
});

test("projects adapter names dynamically and untouched canonical names statically in the live stream", async () => {
  const admission: AgentSendResult = {
    streamUrl: "http://brunch.test/stream",
    offset: "offset-hidden",
    submissionId: "submission-hidden",
    uid: "uid-hidden",
  };
  const send = vi.fn<FlueClient["send"]>(async () => admission);
  const wait = vi.fn<FlueClient["wait"]>(async (_admission, options) => {
    await options?.onEvent?.({
      type: "message-started",
      conversationId: "conversation-stable",
      messageId: "assistant-hidden",
      submissionId: admission.submissionId,
      turnId: "turn-hidden",
      position: { batch: 1, index: 0 },
    });
    for (const [index, toolName] of [
      "getLatestNetDefinition",
      "readPetrinautDoc",
    ].entries()) {
      await options?.onEvent?.({
        type: "tool-input",
        conversationId: "conversation-stable",
        messageId: "assistant-hidden",
        toolCallId: `tool-${index}`,
        toolName,
        input: {},
        position: { batch: 1, index: index + 1 },
      });
    }
    await options?.onEvent?.({
      type: "message-completed",
      conversationId: "conversation-stable",
      messageId: "assistant-hidden",
      position: { batch: 1, index: 3 },
    });
    await options?.onEvent?.({
      type: "submission-settled",
      conversationId: "conversation-stable",
      submissionId: admission.submissionId,
      outcome: "completed",
      position: { batch: 1, index: 4 },
    });
  });
  const transport = createBrunchPanelTransport(
    Promise.resolve({ send, wait } as Pick<
      FlueClient,
      "send" | "wait"
    > as FlueClient),
    new BrunchPanelConversationTracker(),
    {
      adapter: createBrunchFlueAdapter({
        clientToolNames: canonicalPetrinautClientToolNames,
        dynamicClientToolNames: new Set(["getLatestNetDefinition"]),
      }),
    },
  );
  const stream = await transport.sendMessages({
    trigger: "submit-message",
    chatId: "conversation-stable",
    messageId: undefined,
    messages: [
      {
        id: "user-hidden",
        role: "user",
        parts: [{ type: "text", text: "Arrange and update the net." }],
      },
    ],
    abortSignal: undefined,
  });
  const chunks = [];
  const reader = stream.getReader();
  for (;;) {
    const result = await reader.read();
    if (result.done) break;
    chunks.push(result.value);
  }

  expect(chunks).toContainEqual(
    expect.objectContaining({
      type: "tool-input-available",
      toolName: "getLatestNetDefinition",
      dynamic: true,
    }),
  );
  expect(chunks).toContainEqual(
    expect.objectContaining({
      type: "tool-input-available",
      toolName: "readPetrinautDoc",
    }),
  );
  expect(chunks).not.toContainEqual(
    expect.objectContaining({
      toolName: "readPetrinautDoc",
      dynamic: true,
    }),
  );
});

test("reports each re-attach and the lost turn to the host, and still fails the stream", async () => {
  vi.useFakeTimers();
  const admission: AgentSendResult = {
    streamUrl: "http://brunch.test/stream",
    offset: "offset-hidden",
    submissionId: "submission-hidden",
    uid: "uid-hidden",
  };
  const refusal = new FetchError(
    410,
    "Refused.",
    undefined,
    {},
    admission.streamUrl,
  );
  const send = vi.fn<FlueClient["send"]>(async () => admission);
  const wait = vi.fn<FlueClient["wait"]>(async () => {
    throw refusal;
  });
  const onReattach = vi.fn();
  const onDisconnect = vi.fn();
  const transport = createBrunchPanelTransport(
    Promise.resolve({ send, wait } as Pick<
      FlueClient,
      "send" | "wait"
    > as FlueClient),
    new BrunchPanelConversationTracker(),
    { onReattach, onDisconnect },
  );

  const stream = await transport.sendMessages({
    trigger: "submit-message",
    chatId: "conversation-stable",
    messageId: undefined,
    messages: [
      {
        id: "user-hidden",
        role: "user",
        parts: [{ type: "text", text: "Lose the stream." }],
      },
    ],
    abortSignal: undefined,
  });
  const reading = (async () => {
    const reader = stream.getReader();
    for (;;) {
      if ((await reader.read()).done) return;
    }
  })();
  reading.catch(() => {});
  await vi.runAllTimersAsync();
  vi.useRealTimers();

  const failure = await reading.then(
    () => undefined,
    (error: unknown) => error,
  );
  expect(failure).toBeInstanceOf(FlueChatDisconnectError);
  expect(onReattach).toHaveBeenCalledTimes(3);
  expect(onDisconnect).toHaveBeenCalledExactlyOnceWith(failure);
});

test("refuses fixture traffic when the mounted Flue route is unavailable", async () => {
  const transport = createUnavailableBrunchPanelTransport(
    "Fixture route unavailable.",
  );

  await expect(
    transport.sendMessages({
      trigger: "submit-message",
      chatId: "conversation-stable",
      messageId: undefined,
      messages: [],
      abortSignal: undefined,
    }),
  ).rejects.toThrow("Fixture route unavailable.");
});

test("publishes a typed admission failure for the exact panel input", async () => {
  const send = vi.fn<FlueClient["send"]>(async () => {
    throw new FlueApiError(500, "");
  });
  const tracker = new BrunchPanelConversationTracker();
  const failureListener = vi.fn();
  tracker.subscribeToAdmissionFailure(
    { kind: "user", messageId: "voice-realtime:1:item-1:0" },
    failureListener,
  );
  const transport = createBrunchPanelTransport(
    Promise.resolve({ send } as Pick<FlueClient, "send"> as FlueClient),
    tracker,
  );

  const submission = transport.sendMessages({
    trigger: "submit-message",
    chatId: "conversation-stable",
    messageId: undefined,
    messages: [
      {
        id: "voice-realtime:1:item-1:0",
        role: "user",
        parts: [{ type: "text", text: "One Voice turn." }],
      },
    ],
    abortSignal: undefined,
  });

  await expect(submission).rejects.toMatchObject({
    failure: { kind: "ambiguous" },
    name: "FlueChatAdmissionError",
  });
  expect(failureListener).toHaveBeenCalledOnce();
  expect(failureListener).toHaveBeenCalledWith(
    expect.objectContaining({
      failure: { kind: "ambiguous" },
      name: "FlueChatAdmissionError",
    }),
  );
  expect(send).toHaveBeenCalledOnce();
});

test("host admission settles before response failure and an admitted identity never sends again", async () => {
  const admission = {
    submissionId: "host-submission",
    uid: "uid",
    offset: "offset",
    streamUrl: "http://brunch.test/stream",
  };
  const response = Promise.withResolvers<void>();
  const send = vi.fn<FlueClient["send"]>(async () => admission);
  const wait = vi.fn<FlueClient["wait"]>(() => response.promise);
  const tracker = new BrunchPanelConversationTracker();
  const chat = new Chat<PetrinautAiMessage>({
    transport: createBrunchPanelTransport(
      Promise.resolve({ send, wait } as unknown as FlueClient),
      tracker,
    ),
  });
  const submitText = vi.fn(submitThroughChat(chat));
  const input = { id: "host-message", text: "Results", preserveDraft: true };
  await expect(
    tracker.submitTextWithAdmission(submitText, input),
  ).resolves.toEqual({ kind: "message", messageId: "host-message" });
  expect(submitText).toHaveBeenCalledWith({ ...input, target: "message" });
  response.reject(new Error("Response failed"));
  await vi.waitFor(() => expect(chat.error?.message).toBe("Response failed"));
  await expect(
    tracker.submitTextWithAdmission(submitText, input),
  ).resolves.toEqual({ kind: "message", messageId: "host-message" });
  expect(send).toHaveBeenCalledOnce();
  expect(submitText).toHaveBeenCalledOnce();
});

test("an unrelated message or conversation cannot settle a host send", async () => {
  const ownAdmission = Promise.withResolvers<AgentSendResult>();
  const send = vi.fn<FlueClient["send"]>(() => ownAdmission.promise);
  const wait = vi.fn<FlueClient["wait"]>(async () => {});
  const tracker = new BrunchPanelConversationTracker();
  const chat = new Chat<PetrinautAiMessage>({
    transport: createBrunchPanelTransport(
      Promise.resolve({ send, wait } as unknown as FlueClient),
      tracker,
    ),
  });
  const settled = vi.fn();
  const submission = tracker
    .submitTextWithAdmission(submitThroughChat(chat), {
      id: "host",
      text: "Results",
    })
    .then(settled);
  await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
  const admission = {
    submissionId: "other",
    uid: "uid",
    offset: "offset",
    streamUrl: "http://brunch.test/stream",
  };
  tracker.recordAdmission({
    kind: "user",
    messageId: "wrong-message",
    admission,
  });
  new BrunchPanelConversationTracker().recordAdmission({
    kind: "user",
    messageId: "host",
    admission,
  });
  await Promise.resolve();
  expect(settled).not.toHaveBeenCalled();
  ownAdmission.resolve({ ...admission, submissionId: "own" });
  await submission;
  expect(settled).toHaveBeenCalledWith({ kind: "message", messageId: "host" });
});

test.each(["fulfilled", "rejected"] as const)(
  "a raw %s send without admission terminates and releases both listeners",
  async (outcome) => {
    const tracker = new BrunchPanelConversationTracker();
    const releases: ReturnType<typeof vi.fn>[] = [];
    // Observe the public unsubscribe contract without replacing either registry.
    const subscribeAdmission = tracker.subscribeToAdmission.bind(tracker);
    const subscribeFailure = tracker.subscribeToAdmissionFailure.bind(tracker);
    vi.spyOn(tracker, "subscribeToAdmission").mockImplementation(
      (target, listener) => {
        const release = vi.fn(subscribeAdmission(target, listener));
        releases.push(release);
        return release;
      },
    );
    vi.spyOn(tracker, "subscribeToAdmissionFailure").mockImplementation(
      (target, listener) => {
        const release = vi.fn(subscribeFailure(target, listener));
        releases.push(release);
        return release;
      },
    );
    const failure = new Error("Panel is busy");
    const submitText: PetrinautAiComposerSubmitText = async ({ id }) => {
      if (outcome === "rejected") throw failure;
      return { kind: "message", messageId: id ?? "missing" };
    };
    const submission = tracker.submitTextWithAdmission(submitText, {
      text: "Result",
    });
    if (outcome === "fulfilled") {
      await expect(submission).rejects.toMatchObject({
        name: "FlueChatAdmissionError",
        failure: { kind: "ambiguous" },
      });
    } else {
      await expect(submission).rejects.toBe(failure);
    }
    expect(releases).toHaveLength(2);
    for (const release of releases) expect(release).toHaveBeenCalledOnce();
  },
);
