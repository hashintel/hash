import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { LiveBrunchBridge } from "./live-brunch-bridge";

import type { UtteranceJudgment } from "../../../shared/live-utterance-judgment";
import type { FlueConversationState } from "@flue/sdk";
import type { MockInstance } from "vitest";

let diagnosticSpy: MockInstance<(...args: unknown[]) => void>;

beforeEach(() => {
  diagnosticSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const setup = (
  judge?: ConstructorParameters<typeof LiveBrunchBridge>[0]["judge"],
  options: Partial<ConstructorParameters<typeof LiveBrunchBridge>[0]> = {},
) => {
  const appendCommentary = vi.fn<
    ConstructorParameters<typeof LiveBrunchBridge>[0]["appendCommentary"]
  >(() => true);
  const appendInstructions = vi.fn<
    ConstructorParameters<typeof LiveBrunchBridge>[0]["appendInstructions"]
  >(() => true);
  const notice = vi.fn();
  const submit = vi.fn(
    async (
      input: Parameters<
        ConstructorParameters<typeof LiveBrunchBridge>[0]["submit"]
      >[0],
    ) => {
      input.onAdmission("root");
      return {
        kind: "message" as const,
        messageId: "user",
        submissionId: "root",
      };
    },
  );
  const bridge = new LiveBrunchBridge({
    appendCommentary,
    appendInstructions,
    notice,
    submit,
    judge,
    ...options,
  });
  const update = (
    overrides: Partial<Parameters<typeof bridge.update>[0]> = {},
  ) =>
    bridge.update({
      status: "ready",
      canAcceptVoiceInput: true,
      segments: [],
      settlements: [],
      ...overrides,
    });
  update();
  return {
    bridge,
    appendCommentary,
    appendInstructions,
    notice,
    submit,
    update,
  };
};

const segment = (
  text = "There are 7 reviewers, not 4. Is approval optional?",
) => ({
  id: text,
  contentHash: text,
  messageId: "answer",
  partId: "text:0",
  source: "assistant-text" as const,
  text,
  submissionIds: ["root"],
});
const completed = [{ submissionId: "root", outcome: "completed" as const }];
const started = {
  messageId: "answer",
  submissionId: "root",
  position: { batch: 1, index: 0 },
};

const judgmentRecords = () =>
  diagnosticSpy.mock.calls
    .map(
      ([line]) =>
        JSON.parse(
          String(line).replace("[Petrinaut Live trace] ", ""),
        ) as Record<string, unknown>,
    )
    .filter((record) => record.event === "judgment.result");

test("enforcement withholds once, ignores delegation, and recovers exact input once", async () => {
  vi.stubEnv("DEV", true);
  const withheldChanged = vi.fn();
  const judge = vi.fn(async () => ({
    contribution: "social_or_backchannel" as const,
    confidence: 0.8,
  }));
  const fixture = setup(judge, { enforce: true, withheldChanged });
  const input = { id: "one", text: "PRIVATE okay" };
  fixture.bridge.acceptDelegation("early");
  await fixture.bridge.accept(input);
  await fixture.bridge.accept(input);
  expect(fixture.submit).not.toHaveBeenCalled();
  expect(judge).toHaveBeenCalledOnce();
  expect(withheldChanged).toHaveBeenLastCalledWith([input]);
  fixture.bridge.acceptDelegation("late");
  expect(fixture.submit).not.toHaveBeenCalled();
  fixture.bridge.release(input.id);
  fixture.bridge.release(input.id);
  expect(fixture.submit).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining(input),
  );
  expect(withheldChanged).toHaveBeenLastCalledWith([]);
  expect(judgmentRecords()).toMatchObject([
    { mode: "enforce", applied: "withhold", confidence: 0.8 },
  ]);
  expect(JSON.stringify(diagnosticSpy.mock.calls)).not.toContain("PRIVATE");
});

test.each([
  { contribution: "interview_content" as const, confidence: 1 },
  { contribution: "control" as const, confidence: 0.799 },
  null,
])("enforcement submits content or uncertainty: %j", async (judgment) => {
  const fixture = setup(async () => judgment, { enforce: true });
  await fixture.bridge.accept({ id: "one", text: "original answer" });
  expect(fixture.submit).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ id: "one", text: "original answer" }),
  );
});

test("enforcement preserves input order across judgments and busy admission", async () => {
  const first = Promise.withResolvers<UtteranceJudgment | null>();
  const second = Promise.withResolvers<UtteranceJudgment | null>();
  const judge = vi
    .fn()
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise);
  const fixture = setup(judge, { enforce: true });
  fixture.update({ canAcceptVoiceInput: false });
  void fixture.bridge.accept({ id: "one", text: "first" });
  void fixture.bridge.accept({ id: "two", text: "second" });
  second.resolve(null);
  await Promise.resolve();
  fixture.update();
  expect(fixture.submit).not.toHaveBeenCalled();
  first.resolve(null);
  await first.promise;
  await Promise.resolve();
  await Promise.resolve();
  expect(fixture.submit.mock.calls.map(([input]) => input.id)).toEqual([
    "one",
    "two",
  ]);
});

test("enforcement waits for admission, not an older response, before draining the next input", async () => {
  const fixture = setup(async () => null, { enforce: true });
  const firstResponse = Promise.withResolvers<void>();
  const secondResponse = Promise.withResolvers<void>();
  fixture.submit.mockImplementationOnce(async (input) => {
    await firstResponse.promise;
    return { kind: "message", messageId: input.id, submissionId: "first" };
  });
  fixture.submit.mockImplementationOnce(async (input) => {
    await secondResponse.promise;
    return { kind: "message", messageId: input.id, submissionId: "second" };
  });
  await fixture.bridge.accept({ id: "one", text: "Four reviewers" });
  await fixture.bridge.accept({ id: "two", text: "Seven, not four" });
  await fixture.bridge.accept({ id: "three", text: "Approval is optional" });
  expect(fixture.submit).toHaveBeenCalledTimes(1);
  fixture.submit.mock.calls[0]![0].onAdmission("first");
  await Promise.resolve();
  expect(fixture.submit).toHaveBeenCalledTimes(2);
  firstResponse.resolve();
  await firstResponse.promise;
  await Promise.resolve();
  expect(fixture.submit).toHaveBeenCalledTimes(2);
  fixture.submit.mock.calls[1]![0].onAdmission("second");
  await Promise.resolve();
  expect(fixture.submit.mock.calls.map(([input]) => input.id)).toEqual([
    "one",
    "two",
    "three",
  ]);
  secondResponse.resolve();
  await secondResponse.promise;
  fixture.bridge.stop();
});

test("enforcement relays admitted Brunch prose without assigning a delegation", async () => {
  const fixture = setup(async () => null, { enforce: true });
  await fixture.bridge.accept({ id: "one", text: "Four reviewers" });
  fixture.bridge.acceptDelegation("unmatched");
  fixture.bridge.responseStarted(started);
  fixture.bridge.responseCompleted({
    ...started,
    position: { batch: 2, index: 0 },
  });
  fixture.update({ segments: [segment()], settlements: completed });
  expect(fixture.appendCommentary).toHaveBeenCalledExactlyOnceWith(
    segment().text,
    null,
  );
  fixture.bridge.stop();
});

test("enforcement fails open at one second and ignores a late withholding result", async () => {
  vi.useFakeTimers();
  try {
    const pending = Promise.withResolvers<UtteranceJudgment | null>();
    const judge = vi.fn<
      NonNullable<ConstructorParameters<typeof LiveBrunchBridge>[0]["judge"]>
    >(() => pending.promise);
    const fixture = setup(judge, { enforce: true });
    void fixture.bridge.accept({ id: "one", text: "answer" });
    await vi.advanceTimersByTimeAsync(999);
    expect(fixture.submit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(fixture.submit).toHaveBeenCalledOnce();
    expect(judge.mock.calls[0]?.[1].aborted).toBe(true);
    pending.resolve({ contribution: "control", confidence: 1 });
    await vi.advanceTimersByTimeAsync(1);
    fixture.bridge.release("one");
    expect(fixture.submit).toHaveBeenCalledOnce();
    fixture.bridge.stop();
  } finally {
    vi.useRealTimers();
  }
});

test("stopping enforcement clears recovery and cancels pending input", async () => {
  const pending = Promise.withResolvers<UtteranceJudgment | null>();
  const withheldChanged = vi.fn();
  const judge = vi
    .fn()
    .mockResolvedValueOnce({ contribution: "control", confidence: 1 })
    .mockReturnValueOnce(pending.promise);
  const fixture = setup(judge, { enforce: true, withheldChanged });
  await fixture.bridge.accept({ id: "held", text: "hang on" });
  void fixture.bridge.accept({ id: "pending", text: "answer" });
  fixture.bridge.stop();
  fixture.bridge.release("held");
  pending.resolve(null);
  await pending.promise;
  expect(fixture.submit).not.toHaveBeenCalled();
  expect(withheldChanged).toHaveBeenLastCalledWith([]);
  expect(judge.mock.calls[1]?.[1].aborted).toBe(true);
});

test("stopping a response cancels gated work but permits a fresh voice turn", async () => {
  const pending = Promise.withResolvers<UtteranceJudgment | null>();
  const judge = vi
    .fn()
    .mockResolvedValueOnce(null)
    .mockReturnValueOnce(pending.promise)
    .mockResolvedValueOnce(null);
  const fixture = setup(judge, { enforce: true });
  fixture.update({ canAcceptVoiceInput: false });
  await fixture.bridge.accept({ id: "queued", text: "old queued input" });
  void fixture.bridge.accept({ id: "pending", text: "old pending judgment" });
  fixture.bridge.stopResponse();
  expect(judge.mock.calls[1]?.[1].aborted).toBe(true);
  fixture.update({ stopped: true });
  pending.resolve(null);
  await pending.promise;
  expect(fixture.submit).not.toHaveBeenCalled();
  await fixture.bridge.accept({ id: "fresh", text: "new answer" });
  expect(fixture.submit).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ id: "fresh", text: "new answer" }),
  );
  fixture.bridge.stop();
});

test("log mode does not wait for judgments or introduce new admission drops", async () => {
  vi.stubEnv("DEV", true);
  const pending = Promise.withResolvers<UtteranceJudgment | null>();
  const judge = vi.fn(() => pending.promise);
  const fixture = setup(judge);
  await fixture.bridge.accept({ id: "one", text: "PRIVATE ONE" });
  await fixture.bridge.accept({ id: "two", text: "PRIVATE TWO" });
  expect(fixture.submit).toHaveBeenCalledTimes(2);
  expect(judge).toHaveBeenCalledTimes(2);
  expect(judgmentRecords()).toEqual([]);
  fixture.bridge.acceptDelegation("later");
  pending.resolve({ contribution: "social_or_backchannel", confidence: 0.93 });
  await vi.waitFor(() => expect(judgmentRecords()).toHaveLength(2));
  expect(judgmentRecords()).toEqual([
    expect.objectContaining({
      inputId: "one",
      delegationId: null,
      contribution: "social_or_backchannel",
      confidence: 0.93,
      decision: "withhold",
      applied: "submit",
      mode: "log",
    }),
    expect.objectContaining({
      inputId: "two",
      delegationId: "later",
      decision: "submit",
      applied: "submit",
    }),
  ]);
  expect(judgmentRecords()[0]?.latencyMs).toEqual(expect.any(Number));
  expect(JSON.stringify(diagnosticSpy.mock.calls)).not.toContain("PRIVATE");
  expect(fixture.submit).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({ id: "one", text: "PRIVATE ONE" }),
  );
  expect(fixture.notice).not.toHaveBeenCalledWith(
    expect.stringContaining("not retained"),
  );
});

test.each([
  ["interview_content", 0.99, "submit"],
  ["relay_request", 0.79, "submit"],
  ["relay_request", 0.8, "withhold"],
] as const)(
  "logs the provisional %s decision at %s but always submits",
  async (contribution, confidence, decision) => {
    vi.stubEnv("DEV", true);
    const fixture = setup(vi.fn(async () => ({ contribution, confidence })));
    await fixture.bridge.accept({ id: "one", text: "PRIVATE" });
    expect(fixture.submit).toHaveBeenCalledOnce();
    expect(judgmentRecords()).toEqual([
      expect.objectContaining({ decision, applied: "submit" }),
    ]);
  },
);

test.each(["null", "throw"])(
  "judge %s cannot affect submission or leak error text",
  async (failure) => {
    vi.stubEnv("DEV", true);
    const fixture = setup(
      vi.fn(async () => {
        if (failure === "throw") throw new Error("PRIVATE ERROR");
        return null;
      }),
    );
    await fixture.bridge.accept({ id: "one", text: "PRIVATE" });
    expect(fixture.submit).toHaveBeenCalledOnce();
    expect(judgmentRecords()).toEqual([
      expect.objectContaining({
        judgment: false,
        contribution: null,
        confidence: null,
        decision: "submit",
        applied: "submit",
      }),
    ]);
    expect(JSON.stringify(diagnosticSpy.mock.calls)).not.toContain("PRIVATE");
  },
);

test("judges only eligible inputs, once per input id", async () => {
  const judge = vi.fn(async () => null);
  const fixture = setup(judge);
  await fixture.bridge.accept({ id: "one", text: "PRIVATE" });
  await fixture.bridge.accept({ id: "one", text: "PRIVATE" });
  await fixture.bridge.accept({ id: "empty", text: " " });
  await fixture.bridge.accept({ id: "oversize", text: "x".repeat(32_001) });
  fixture.update({ canAcceptVoiceInput: false });
  await fixture.bridge.accept({ id: "unavailable", text: "PRIVATE" });
  expect(judge).toHaveBeenCalledOnce();
});

test.each([true, false])(
  "uses only successfully offered Brunch context (accepted=%s)",
  async (accepted) => {
    const judge = vi.fn(async () => null);
    const fixture = setup(judge);
    fixture.appendCommentary.mockReturnValue(accepted);
    await fixture.bridge.accept({ id: "one", text: "PRIVATE FIRST" });
    fixture.bridge.responseStarted(started);
    fixture.bridge.responseCompleted({
      ...started,
      position: { batch: 2, index: 0 },
    });
    fixture.update({
      segments: [segment("PRIVATE RELAY")],
      settlements: completed,
    });
    expect(fixture.appendCommentary).toHaveBeenCalledWith(
      "PRIVATE RELAY",
      null,
    );
    await fixture.bridge.accept({ id: "two", text: "PRIVATE SECOND" });
    expect(judge).toHaveBeenLastCalledWith(
      {
        transcript: "PRIVATE SECOND",
        relayedBrunchText: accepted ? "PRIVATE RELAY" : null,
      },
      expect.any(AbortSignal),
    );
  },
);

test("stop aborts an outstanding judgment without resubmission", async () => {
  vi.stubEnv("DEV", true);
  const pending = Promise.withResolvers<UtteranceJudgment | null>();
  const judge = vi.fn(() => pending.promise);
  const fixture = setup(judge);
  await fixture.bridge.accept({ id: "one", text: "PRIVATE" });
  fixture.bridge.stop();
  expect(judge).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ aborted: true }),
  );
  pending.resolve(null);
  await vi.waitFor(() => expect(judgmentRecords()).toHaveLength(1));
  expect(judgmentRecords()[0]).toMatchObject({
    afterStop: true,
    judgment: false,
  });
  expect(fixture.submit).toHaveBeenCalledOnce();
});

test("trace distinguishes ungated admission, later delegation matching, settlement and dropped speech", async () => {
  vi.stubEnv("DEV", true);
  const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
  const fixture = setup();
  await fixture.bridge.accept({ id: "first-input", text: "PRIVATE INPUT" });
  fixture.bridge.acceptDelegation("late-delegation");
  fixture.bridge.responseStarted(started);
  fixture.update({ status: "streaming" });
  fixture.bridge.responseCompleted({
    ...started,
    position: { batch: 2, index: 0 },
  });
  fixture.update({
    segments: [segment("PRIVATE ANSWER")],
    settlements: completed,
  });
  fixture.update({ canAcceptVoiceInput: false });
  await fixture.bridge.accept({ id: "dropped-input", text: "PRIVATE DROPPED" });
  const records = debug.mock.calls.map(
    ([line]) =>
      JSON.parse(String(line).replace("[Petrinaut Live trace] ", "")) as Record<
        string,
        unknown
      >,
  );
  expect(records).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        event: "brunch.submit",
        inputId: "first-input",
        delegationId: null,
      }),
      expect.objectContaining({
        event: "brunch.admitted",
        inputId: "first-input",
        submissionId: "root",
      }),
      expect.objectContaining({
        event: "delegation.matched",
        inputId: "first-input",
        delegationId: "late-delegation",
      }),
      expect.objectContaining({
        event: "brunch.offer",
        inputId: "first-input",
        submissionId: "root",
        delegationId: "late-delegation",
      }),
      expect.objectContaining({
        event: "input.dropped",
        inputId: "dropped-input",
        admissionUnavailable: true,
        waitingForComposer: false,
        oversized: false,
      }),
    ]),
  );
  expect(JSON.stringify(records)).not.toContain("PRIVATE");
  expect(fixture.submit).toHaveBeenCalledOnce();
  expect(fixture.appendCommentary).toHaveBeenCalledExactlyOnceWith(
    "PRIVATE ANSWER",
    "late-delegation",
  );
});

test("offers one frozen correlated answer only after complete settlement, never streamed or historical prose", async () => {
  const fixture = setup();
  fixture.update({ segments: [segment("Old answer")] });
  await fixture.bridge.accept({ id: "one", text: "Seven, not four" });
  fixture.bridge.responseStarted(started);
  fixture.update({ status: "streaming", segments: [segment()] });
  fixture.bridge.responseCompleted({
    ...started,
    position: { batch: 2, index: 0 },
  });
  fixture.update({
    status: "streaming",
    segments: [segment()],
    settlements: completed,
  });
  expect(fixture.appendCommentary).not.toHaveBeenCalled();
  fixture.update({ segments: [segment()], settlements: [] });
  expect(fixture.appendCommentary).not.toHaveBeenCalled();
  fixture.update({ segments: [segment()], settlements: completed });
  fixture.update({ segments: [segment()], settlements: completed });
  expect(fixture.appendCommentary).toHaveBeenCalledExactlyOnceWith(
    segment().text,
    null,
  );
});

test("offers a completed correlated answer across a ready-to-ready transition", async () => {
  const fixture = setup();
  await fixture.bridge.accept({ id: "one", text: "Seven, not four" });
  fixture.bridge.responseStarted(started);
  fixture.bridge.responseCompleted({
    ...started,
    position: { batch: 2, index: 0 },
  });
  fixture.update({ segments: [segment()], settlements: completed });
  expect(fixture.appendCommentary).toHaveBeenCalledExactlyOnceWith(
    segment().text,
    null,
  );
});

test("waits for observed prose rendered after ready settlement", async () => {
  const fixture = setup();
  await fixture.bridge.accept({ id: "one", text: "Seven, not four" });
  fixture.bridge.responseStarted(started);
  fixture.update({ status: "streaming" });
  fixture.bridge.responseCompleted({
    ...started,
    position: { batch: 2, index: 0 },
  });
  const snapshot: FlueConversationState = {
    conversationId: "conversation",
    settlements: completed,
    messages: [
      {
        id: "answer",
        role: "assistant",
        purpose: "assistant",
        display: "visible",
        submissionId: "root",
        parts: [{ type: "text", state: "done", text: segment().text }],
      },
    ],
  };

  fixture.update({ settlements: completed, snapshot });
  expect(fixture.appendCommentary).not.toHaveBeenCalled();
  expect(fixture.notice).not.toHaveBeenCalledWith(
    expect.stringContaining("without a spoken answer"),
  );

  fixture.update({ segments: [segment()], settlements: completed, snapshot });
  expect(fixture.appendCommentary).toHaveBeenCalledExactlyOnceWith(
    segment().text,
    null,
  );
});

test("a finalized snapshot confirms an observed response is textless", async () => {
  const fixture = setup();
  await fixture.bridge.accept({ id: "one", text: "Seven, not four" });
  fixture.bridge.responseStarted(started);
  fixture.update({ status: "streaming" });
  fixture.bridge.responseCompleted({
    ...started,
    position: { batch: 2, index: 0 },
  });

  fixture.update({
    settlements: completed,
    snapshot: {
      conversationId: "conversation",
      settlements: completed,
      messages: [
        {
          id: "answer",
          role: "assistant",
          purpose: "assistant",
          display: "visible",
          submissionId: "root",
          parts: [],
        },
      ],
    },
  });

  expect(fixture.notice).toHaveBeenLastCalledWith(
    "Brunch settled without a spoken answer. Check the conversation.",
  );
  expect(fixture.appendCommentary).not.toHaveBeenCalled();
});

test("completion retries settlement against already rendered prose", async () => {
  const fixture = setup();
  await fixture.bridge.accept({ id: "one", text: "Seven, not four" });
  fixture.bridge.responseStarted(started);
  fixture.update({ status: "streaming" });
  fixture.update({ segments: [segment()], settlements: completed });
  expect(fixture.appendCommentary).not.toHaveBeenCalled();

  fixture.bridge.responseCompleted({
    ...started,
    position: { batch: 2, index: 0 },
  });
  expect(fixture.appendCommentary).toHaveBeenCalledExactlyOnceWith(
    segment().text,
    null,
  );
});

test("a stale completion cannot finish a newer response and a duplicate start cannot reopen it", async () => {
  const fixture = setup();
  await fixture.bridge.accept({ id: "one", text: "Seven, not four" });
  fixture.update({ status: "streaming" });
  fixture.bridge.responseStarted(started);
  const newer = { ...started, position: { batch: 3, index: 2 } };
  fixture.bridge.responseStarted(newer);
  fixture.bridge.responseCompleted({
    ...started,
    position: { batch: 3, index: 1 },
  });
  fixture.update({ segments: [segment()], settlements: completed });
  expect(fixture.appendCommentary).not.toHaveBeenCalled();
  fixture.bridge.responseCompleted({
    ...started,
    position: { batch: 3, index: 3 },
  });
  fixture.bridge.responseStarted(newer);
  fixture.update({ segments: [segment()], settlements: completed });
  expect(fixture.appendCommentary).toHaveBeenCalledExactlyOnceWith(
    segment().text,
    null,
  );
});

test("Stop aborts pending admission and its late resolution cannot produce commentary or a new notice", async () => {
  const fixture = setup();
  let release = () => {};
  let signal: AbortSignal | undefined;
  const bridge = new LiveBrunchBridge({
    appendCommentary: fixture.appendCommentary,
    appendInstructions: fixture.appendInstructions,
    notice: fixture.notice,
    submit: async (input) => {
      signal = input.signal;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      input.onAdmission("root");
      return { kind: "message", messageId: "user", submissionId: "root" };
    },
  });
  bridge.update({
    status: "ready",
    canAcceptVoiceInput: true,
    segments: [],
    settlements: [],
  });
  const pending = bridge.accept({ id: "one", text: "First" });
  bridge.stop();
  expect(signal?.aborted).toBe(true);
  fixture.notice.mockClear();
  release();
  await pending;
  expect(fixture.notice).not.toHaveBeenCalled();
  expect(fixture.appendCommentary).not.toHaveBeenCalled();
});

test.each(["failed", "aborted", "completed"] as const)(
  "textless continuation settlement %s cannot be skipped",
  async (outcome) => {
    const fixture = setup();
    await fixture.bridge.accept({ id: "one", text: "Please explain" });
    fixture.bridge.responseStarted(started);
    fixture.bridge.responseCompleted({
      ...started,
      position: { batch: 2, index: 0 },
    });
    fixture.update({
      status: "streaming",
      segments: [segment()],
      settlements: completed,
    });
    const continuation = {
      ...started,
      submissionId: "continuation",
      position: { batch: 3, index: 0 },
    };
    fixture.bridge.responseStarted(continuation);
    fixture.bridge.responseCompleted({
      ...continuation,
      position: { batch: 4, index: 0 },
    });
    fixture.update({ segments: [segment()], settlements: completed });
    expect(fixture.appendCommentary).not.toHaveBeenCalled();
    fixture.update({
      segments: [segment()],
      settlements: [...completed, { submissionId: "continuation", outcome }],
    });
    expect(fixture.appendCommentary).toHaveBeenCalledTimes(
      outcome === "completed" ? 1 : 0,
    );
  },
);

test("duplicates, empty input and one waiting composer submission never create another admission", async () => {
  const fixture = setup();
  let release = () => {};
  fixture.submit.mockImplementationOnce(async () => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return { kind: "message", messageId: "user", submissionId: "root" };
  });
  const pending = fixture.bridge.accept({ id: "one", text: "First" });
  await fixture.bridge.accept({ id: "one", text: "First" });
  await fixture.bridge.accept({ id: "empty", text: "  " });
  await fixture.bridge.accept({ id: "two", text: "Follow-up" });
  expect(fixture.submit).toHaveBeenCalledOnce();
  expect(fixture.notice).toHaveBeenLastCalledWith(
    expect.stringContaining("not retained"),
  );
  release();
  await pending;
  await fixture.bridge.accept({ id: "three", text: "First" });
  expect(fixture.submit).toHaveBeenCalledTimes(2);
});

test("empty finalized input resolves its delegation before a later turn", async () => {
  const fixture = setup();
  fixture.bridge.acceptDelegation("empty-delegation");
  await fixture.bridge.accept({ id: "empty", text: "  " });
  await fixture.bridge.accept({ id: "next", text: "Continue" });
  fixture.update({ status: "streaming" });
  fixture.bridge.responseStarted(started);
  fixture.bridge.responseCompleted({
    ...started,
    position: { batch: 2, index: 0 },
  });
  fixture.update({ segments: [segment()], settlements: completed });
  expect(fixture.appendInstructions).toHaveBeenCalledExactlyOnceWith(
    expect.stringContaining("No usable speech"),
    "empty-delegation",
  );
  expect(fixture.appendCommentary).toHaveBeenCalledExactlyOnceWith(
    segment().text,
    null,
  );
});

test("uncertain admission is visible and never automatically replayed", async () => {
  const fixture = setup();
  fixture.submit.mockRejectedValueOnce(new Error("Unknown admission"));
  await fixture.bridge.accept({ id: "one", text: "First" });
  await fixture.bridge.accept({ id: "one", text: "First" });
  expect(fixture.submit).toHaveBeenCalledOnce();
  expect(fixture.notice).toHaveBeenLastCalledWith(
    expect.stringContaining("Check canonical history"),
  );
});

test("a response failure after confirmed admission does not report uncertain admission or replay input", async () => {
  const fixture = setup();
  fixture.submit.mockImplementationOnce(async (input) => {
    input.onAdmission("root");
    throw new Error("401 invalid x-api-key");
  });
  await fixture.bridge.accept({ id: "one", text: "First" });
  await fixture.bridge.accept({ id: "one", text: "First" });
  expect(fixture.submit).toHaveBeenCalledOnce();
  expect(fixture.appendCommentary).not.toHaveBeenCalled();
  expect(fixture.notice).toHaveBeenLastCalledWith(
    "Your message was admitted, but its response could not be confirmed. Check canonical history; no automatic retry was made.",
  );
});

test("admission frees the existing waiting-input slot, but finishing an earlier turn cannot free a newer wait", async () => {
  const fixture = setup();
  let finishFirst = () => {};
  let admitCorrection = () => {};
  let finishCorrection = () => {};
  fixture.submit.mockImplementationOnce(async (input) => {
    input.onAdmission("first");
    await new Promise<void>((resolve) => {
      finishFirst = resolve;
    });
    return { kind: "message", messageId: "one", submissionId: "first" };
  });
  fixture.submit.mockImplementationOnce(async (input) => {
    admitCorrection = () => input.onAdmission("correction");
    await new Promise<void>((resolve) => {
      finishCorrection = resolve;
    });
    return { kind: "message", messageId: "two", submissionId: "correction" };
  });
  const first = fixture.bridge.accept({ id: "one", text: "Four reviewers" });
  fixture.update({ status: "streaming", canAcceptVoiceInput: true });
  const correction = fixture.bridge.accept({
    id: "two",
    text: "Seven, not four",
  });
  expect(fixture.submit).toHaveBeenCalledTimes(2);

  finishFirst();
  await first;
  await fixture.bridge.accept({ id: "three", text: "Another pending input" });
  expect(fixture.submit).toHaveBeenCalledTimes(2);
  expect(fixture.notice).toHaveBeenLastCalledWith(
    expect.stringContaining("not retained"),
  );

  admitCorrection();
  await fixture.bridge.accept({ id: "four", text: "Approval is optional" });
  expect(fixture.submit).toHaveBeenCalledTimes(3);
  finishCorrection();
  await correction;
});

test.each(["completed", "failed", "aborted"] as const)(
  "follows the answering submission and waits for its %s settlement and textless continuation",
  async (outcome) => {
    const fixture = setup();
    await fixture.bridge.accept({ id: "one", text: "Explain the result" });
    fixture.update({ status: "streaming" });
    const answer = { ...started, submissionId: "answering" };
    fixture.bridge.responseStarted(answer);
    fixture.bridge.responseCompleted({
      ...answer,
      position: { batch: 2, index: 0 },
    });
    const continuation = {
      ...answer,
      submissionId: "continuation",
      position: { batch: 3, index: 0 },
    };
    fixture.bridge.responseStarted(continuation);
    fixture.bridge.responseCompleted({
      ...continuation,
      position: { batch: 4, index: 0 },
    });
    const segments = [
      { ...segment(), submissionIds: ["answering", "continuation"] },
    ];
    const rootSettlement = {
      submissionId: "root",
      outcome: "completed" as const,
      answeredBySubmissionId: "answering",
    };
    fixture.update({ segments, settlements: [rootSettlement] });
    expect(fixture.appendCommentary).not.toHaveBeenCalled();
    expect(fixture.notice).not.toHaveBeenCalledWith(
      expect.stringContaining("without a spoken answer"),
    );
    fixture.update({
      segments,
      settlements: [
        rootSettlement,
        { submissionId: "answering", outcome: "completed" },
      ],
    });
    expect(fixture.appendCommentary).not.toHaveBeenCalled();
    const settlements = [
      rootSettlement,
      { submissionId: "answering", outcome: "completed" as const },
      { submissionId: "continuation", outcome },
    ];
    fixture.update({ segments, settlements });
    fixture.update({ segments, settlements });
    expect(fixture.appendCommentary.mock.calls).toEqual(
      outcome === "completed" ? [[segment().text, null]] : [],
    );
  },
);

test("two inputs answered by one submission offer its canonical prose only once", async () => {
  const fixture = setup();
  fixture.bridge.acceptDelegation("first-delegation");
  await fixture.bridge.accept({ id: "one", text: "First question" });
  fixture.submit.mockImplementationOnce(async (input) => {
    input.onAdmission("second");
    return { kind: "message", messageId: "two", submissionId: "second" };
  });
  fixture.bridge.acceptDelegation("second-delegation");
  await fixture.bridge.accept({ id: "two", text: "Clarification" });
  fixture.update({ status: "streaming" });
  const answer = { ...started, submissionId: "answering" };
  fixture.bridge.responseStarted(answer);
  fixture.bridge.responseCompleted({
    ...answer,
    position: { batch: 2, index: 0 },
  });
  fixture.update({
    segments: [{ ...segment(), submissionIds: ["answering"] }],
    settlements: [
      {
        submissionId: "root",
        outcome: "completed",
        answeredBySubmissionId: "answering",
      },
      {
        submissionId: "second",
        outcome: "completed",
        answeredBySubmissionId: "answering",
      },
      { submissionId: "answering", outcome: "completed" },
    ],
  });
  expect(fixture.appendCommentary).toHaveBeenCalledExactlyOnceWith(
    segment().text,
    "first-delegation",
  );
  expect(fixture.appendInstructions).toHaveBeenCalledExactlyOnceWith(
    expect.stringContaining("already delivered"),
    "second-delegation",
  );
  expect(fixture.notice).not.toHaveBeenCalledWith(
    expect.stringContaining("without a spoken answer"),
  );
});

test.each([
  "deliver",
  "stop",
  "historical",
  "historical-render",
  "failed",
  "aborted",
] as const)(
  "snapshot-only answered-by source: %s, never a stale or partial snapshot",
  async (mode) => {
    const fixture = setup();
    const prose = segment();
    const settlements = [
      {
        submissionId: "root",
        outcome: "completed" as const,
        answeredBySubmissionId: "answering",
      },
      { submissionId: "answering", outcome: "completed" as const },
    ];
    const snapshot: FlueConversationState = {
      conversationId: "conversation",
      settlements,
      messages: [
        {
          id: "answer",
          role: "assistant",
          purpose: "assistant",
          display: "visible",
          submissionId: "answering",
          parts: [{ type: "text", state: "done", text: prose.text }],
        },
      ],
    };
    const segments = [{ ...prose, submissionIds: undefined }];
    if (mode === "historical") fixture.update({ segments, snapshot });
    if (mode === "historical-render") fixture.update({ segments });
    await fixture.bridge.accept({ id: "input", text: "Seven, not four" });
    fixture.update({ status: "streaming" });
    // Settlement can arrive before the snapshot/render. Do not discard the turn.
    fixture.update({ settlements });
    fixture.update({
      settlements,
      segments,
      snapshot: { ...snapshot, settlements: [settlements[0]!] },
    });
    fixture.update({
      settlements,
      segments,
      snapshot: {
        ...snapshot,
        messages: [{ ...snapshot.messages[0]!, submissionId: "root" }],
      },
    });
    expect(fixture.appendCommentary).not.toHaveBeenCalled();
    fixture.update({
      settlements,
      segments,
      snapshot: {
        ...snapshot,
        messages: [
          {
            ...snapshot.messages[0]!,
            parts: [{ type: "text", state: "streaming", text: prose.text }],
          },
        ],
      },
    });
    fixture.update({ settlements, segments: [], snapshot });
    expect(fixture.appendCommentary).not.toHaveBeenCalled();
    if (mode === "stop") fixture.bridge.stop();
    if (mode === "failed" || mode === "aborted") {
      fixture.update({
        segments,
        snapshot,
        settlements: [
          settlements[0]!,
          { submissionId: "answering", outcome: mode },
        ],
      });
    }
    fixture.update({ settlements, segments, snapshot });
    fixture.update({ settlements, segments, snapshot });
    expect(fixture.appendCommentary.mock.calls).toEqual(
      mode === "deliver" ? [[prose.text, null]] : [],
    );
  },
);

test("a finalized textless unobserved answer cannot fall through to an observed response", async () => {
  const fixture = setup();
  fixture.bridge.acceptDelegation("delegation");
  await fixture.bridge.accept({ id: "input", text: "Explain the result" });
  fixture.update({ status: "streaming" });
  fixture.bridge.responseStarted(started);
  fixture.bridge.responseCompleted({
    ...started,
    position: { batch: 2, index: 0 },
  });
  const settlements = [
    {
      submissionId: "root",
      outcome: "completed" as const,
      answeredBySubmissionId: "answering",
    },
    { submissionId: "answering", outcome: "completed" as const },
  ];
  const textlessAnswer = {
    id: "answering-message",
    role: "assistant" as const,
    purpose: "assistant" as const,
    display: "visible" as const,
    submissionId: "answering",
    parts: [],
  };

  fixture.update({
    settlements,
    snapshot: {
      conversationId: "conversation",
      settlements,
      messages: [textlessAnswer],
    },
  });
  fixture.update({
    settlements,
    segments: [segment("Unrelated observed response")],
    snapshot: {
      conversationId: "conversation",
      settlements,
      messages: [
        textlessAnswer,
        {
          id: "answer",
          role: "assistant",
          purpose: "assistant",
          display: "visible",
          submissionId: "root",
          parts: [
            {
              type: "text",
              state: "done",
              text: "Unrelated observed response",
            },
          ],
        },
      ],
    },
  });

  expect(fixture.notice).toHaveBeenLastCalledWith(
    "Brunch settled without a spoken answer. Check the conversation.",
  );
  expect(fixture.appendInstructions).toHaveBeenCalledExactlyOnceWith(
    expect.stringContaining("Ask the person to continue"),
    "delegation",
  );
  expect(fixture.appendCommentary).not.toHaveBeenCalled();
});

test("Stop withdraws only unsubmitted input and suppresses late settlements and later input", async () => {
  const fixture = setup();
  await fixture.bridge.accept({ id: "one", text: "First" });
  const signal = vi.mocked(fixture.submit).mock.calls[0]?.[0];
  fixture.bridge.stop();
  fixture.bridge.responseStarted(started);
  fixture.bridge.responseCompleted({
    ...started,
    position: { batch: 2, index: 0 },
  });
  fixture.update({ segments: [segment()], settlements: completed });
  await fixture.bridge.accept({ id: "late", text: "Late" });
  expect(signal).toBeDefined();
  expect(fixture.appendCommentary).not.toHaveBeenCalled();
  expect(fixture.submit).toHaveBeenCalledOnce();
});

test("response-only Stop resolves attached and unclaimed delegations before a later utterance", async () => {
  const fixture = setup();
  fixture.bridge.acceptDelegation("attached");
  await fixture.bridge.accept({ id: "one", text: "First" });
  fixture.bridge.acceptDelegation("unclaimed");

  fixture.bridge.stopResponse();

  expect(fixture.appendInstructions.mock.calls).toEqual([
    [
      expect.stringContaining(
        "Ask the person to continue. Do not claim the work completed",
      ),
      "attached",
    ],
    [
      expect.stringContaining(
        "Ask the person to continue. Do not claim the work completed",
      ),
      "unclaimed",
    ],
  ]);

  fixture.submit.mockImplementationOnce(async (input) => {
    input.onAdmission("second");
    return {
      kind: "message",
      messageId: "second-input",
      submissionId: "second",
    };
  });
  await fixture.bridge.accept({ id: "two", text: "Continue" });
  const secondResponse = {
    ...started,
    messageId: "second-answer",
    submissionId: "second",
  };
  fixture.bridge.responseStarted(secondResponse);
  fixture.bridge.update({
    status: "streaming",
    canAcceptVoiceInput: true,
    segments: [],
    settlements: [],
  });
  fixture.bridge.responseCompleted({
    ...secondResponse,
    position: { batch: 2, index: 0 },
  });
  fixture.update({
    segments: [
      {
        ...segment("Continue with the next question."),
        messageId: "second-answer",
        submissionIds: ["second"],
      },
    ],
    settlements: [{ submissionId: "second", outcome: "completed" }],
  });
  expect(fixture.appendCommentary).toHaveBeenCalledExactlyOnceWith(
    "Continue with the next question.",
    null,
  );
});

test("a locally stopped or failed turn cannot turn earlier successful prose into success speech", async () => {
  const fixture = setup();
  await fixture.bridge.accept({ id: "one", text: "First" });
  fixture.bridge.responseStarted(started);
  fixture.bridge.responseCompleted({
    ...started,
    position: { batch: 2, index: 0 },
  });
  fixture.update({ status: "streaming", segments: [segment()] });
  fixture.update({
    stopped: true,
    segments: [segment()],
    settlements: completed,
  });
  fixture.update({ segments: [segment()], settlements: completed });
  expect(fixture.appendCommentary).not.toHaveBeenCalled();
});

test("repeated stopped snapshots retain a later turn", async () => {
  const fixture = setup();
  await fixture.bridge.accept({ id: "one", text: "First" });
  fixture.update({ stopped: true });
  await fixture.bridge.accept({ id: "two", text: "Second" });
  fixture.update({ stopped: true });
  fixture.bridge.responseStarted(started);
  fixture.update({ status: "streaming" });
  fixture.bridge.responseCompleted({
    ...started,
    position: { batch: 2, index: 0 },
  });
  fixture.update({ segments: [segment()], settlements: completed });
  expect(fixture.submit).toHaveBeenCalledTimes(2);
  expect(fixture.appendCommentary).toHaveBeenCalledExactlyOnceWith(
    segment().text,
    null,
  );
});

test("entering error interrupts pending work once and suppresses its late result", async () => {
  const fixture = setup();
  let release = () => {};
  fixture.submit.mockImplementationOnce(async (input) => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    input.onAdmission("root");
    return { kind: "message", messageId: "user", submissionId: "root" };
  });
  fixture.bridge.acceptDelegation("pending");
  const pending = fixture.bridge.accept({ id: "one", text: "First" });
  fixture.bridge.acceptDelegation("unclaimed");

  fixture.update({ status: "error" });
  expect(fixture.appendInstructions.mock.calls).toEqual([
    [expect.stringContaining("Ask the person to continue"), "pending"],
    [expect.stringContaining("Ask the person to continue"), "unclaimed"],
  ]);
  fixture.update({ status: "error" });
  expect(fixture.appendInstructions).toHaveBeenCalledTimes(2);

  release();
  await pending;
  fixture.bridge.responseStarted(started);
  fixture.bridge.responseCompleted({
    ...started,
    position: { batch: 2, index: 0 },
  });
  fixture.update({ segments: [segment()], settlements: completed });
  expect(fixture.appendCommentary).not.toHaveBeenCalled();
  expect(fixture.appendInstructions).toHaveBeenCalledTimes(2);
  expect(fixture.submit).toHaveBeenCalledOnce();
});

test("repeated error snapshots retain a pending recovery turn until ready settlement", async () => {
  const fixture = setup();
  fixture.bridge.acceptDelegation("original");
  await fixture.bridge.accept({ id: "one", text: "First" });
  fixture.update({ status: "error" });
  expect(fixture.appendInstructions).toHaveBeenCalledExactlyOnceWith(
    expect.stringContaining("Ask the person to continue"),
    "original",
  );
  fixture.appendInstructions.mockClear();

  let release = () => {};
  fixture.submit.mockImplementationOnce(async (input) => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    input.onAdmission("recovery");
    return { kind: "message", messageId: "two", submissionId: "recovery" };
  });
  fixture.bridge.acceptDelegation("recovery-delegation");
  const recovery = fixture.bridge.accept({ id: "two", text: "Try again" });
  fixture.update({ status: "error" });
  fixture.update({ status: "error" });
  expect(fixture.appendInstructions).not.toHaveBeenCalled();

  release();
  await recovery;
  const response = {
    ...started,
    messageId: "recovery-answer",
    submissionId: "recovery",
  };
  fixture.bridge.responseStarted(response);
  fixture.bridge.responseCompleted({
    ...response,
    position: { batch: 2, index: 0 },
  });
  const chat = {
    segments: [
      {
        ...segment("Recovery answer"),
        messageId: "recovery-answer",
        submissionIds: ["recovery"],
      },
    ],
    settlements: [{ submissionId: "recovery", outcome: "completed" as const }],
  };
  fixture.update({ ...chat, status: "error" });
  expect(fixture.appendInstructions).not.toHaveBeenCalled();
  expect(fixture.appendCommentary).not.toHaveBeenCalled();
  fixture.update(chat);
  fixture.update(chat);
  expect(fixture.appendCommentary).toHaveBeenCalledExactlyOnceWith(
    "Recovery answer",
    "recovery-delegation",
  );
  expect(fixture.submit).toHaveBeenCalledTimes(2);

  fixture.bridge.acceptDelegation("next");
  await fixture.bridge.accept({ id: "three", text: "Next question" });
  fixture.update({ status: "error" });
  expect(fixture.appendInstructions).toHaveBeenCalledExactlyOnceWith(
    expect.stringContaining("Ask the person to continue"),
    "next",
  );
});

test("a locally refused long commentary is offered intact once without truncation or replay", async () => {
  const fixture = setup();
  fixture.appendCommentary.mockReturnValue(false);
  fixture.bridge.acceptDelegation("long-answer");
  await fixture.bridge.accept({ id: "one", text: "First" });
  fixture.bridge.responseStarted(started);
  fixture.bridge.responseCompleted({
    ...started,
    position: { batch: 2, index: 0 },
  });
  fixture.update({ status: "streaming" });
  const prose = segment("Seven, not four. ".repeat(100));
  fixture.update({ segments: [prose], settlements: completed });
  fixture.update({ segments: [prose], settlements: completed });
  expect(fixture.appendCommentary).toHaveBeenCalledExactlyOnceWith(
    prose.text,
    "long-answer",
  );
  expect(fixture.appendInstructions).not.toHaveBeenCalled();
});

test.each(["before", "after"] as const)(
  "claims the most recent unclaimed delegation %s admission without admitting new work",
  async (timing) => {
    const fixture = setup();
    if (timing === "before") {
      fixture.bridge.acceptDelegation("older");
      fixture.bridge.acceptDelegation("newer");
    }
    expect(fixture.submit).not.toHaveBeenCalled();
    await fixture.bridge.accept({ id: "first", text: "Seven reviewers" });
    fixture.submit.mockImplementationOnce(async (input) => {
      input.onAdmission("second");
      return {
        kind: "message",
        messageId: "second-input",
        submissionId: "second",
      };
    });
    await fixture.bridge.accept({
      id: "second-input",
      text: "Approval is optional",
    });
    if (timing === "after") {
      fixture.bridge.acceptDelegation("newer");
      fixture.bridge.acceptDelegation("older");
    }
    expect(fixture.submit).toHaveBeenCalledTimes(2);
    expect(fixture.appendCommentary).not.toHaveBeenCalled();
    fixture.update({ status: "streaming" });
    for (const response of [
      started,
      { ...started, messageId: "second-answer", submissionId: "second" },
    ]) {
      fixture.bridge.responseStarted(response);
      fixture.bridge.responseCompleted({
        ...response,
        position: { batch: 2, index: 0 },
      });
    }
    const chat = {
      segments: [
        segment(),
        {
          ...segment("Approval is optional."),
          messageId: "second-answer",
          submissionIds: ["second"],
        },
      ],
      settlements: [
        ...completed,
        { submissionId: "second", outcome: "completed" as const },
      ],
    };
    fixture.update(chat);
    fixture.update(chat);
    expect(fixture.appendCommentary.mock.calls).toEqual([
      [segment().text, timing === "before" ? "newer" : "older"],
      ["Approval is optional.", timing === "before" ? "older" : "newer"],
    ]);
    expect(fixture.appendInstructions).not.toHaveBeenCalled();
  },
);

test("dropped input resolves only its claimed delegation, once, without changing the waiting-input policy", async () => {
  const fixture = setup();
  fixture.bridge.acceptDelegation("waiting");
  let release = () => {};
  fixture.submit.mockImplementationOnce(async () => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return { kind: "message", messageId: "first", submissionId: "root" };
  });
  const pending = fixture.bridge.accept({ id: "first", text: "First" });
  fixture.bridge.acceptDelegation("dropped");
  await fixture.bridge.accept({ id: "second", text: "Second" });
  await fixture.bridge.accept({ id: "second", text: "Second" });
  expect(fixture.appendInstructions).toHaveBeenCalledExactlyOnceWith(
    "The backend could not take that request now. Ask the person to continue. Do not claim the work completed or was cancelled.",
    "dropped",
  );
  expect(fixture.submit).toHaveBeenCalledOnce();
  expect(fixture.appendCommentary).not.toHaveBeenCalled();
  release();
  await pending;
  fixture.bridge.stop();
});

test.each([
  "admission",
  "response",
  "failed",
  "failed-without-busy",
  "textless",
  "chat-error",
  "stop",
] as const)(
  "%s resolves an attached delegation without premature commentary or replay",
  async (failure) => {
    const fixture = setup();
    fixture.bridge.acceptDelegation("request");
    if (failure === "admission")
      fixture.submit.mockRejectedValueOnce(new Error("Unknown"));
    if (failure === "response")
      fixture.submit.mockImplementationOnce(async (input) => {
        input.onAdmission("root");
        throw new Error("Response failed");
      });
    await fixture.bridge.accept({ id: "one", text: "Describe the process" });
    if (failure !== "failed-without-busy")
      fixture.update({ status: "streaming" });
    expect(fixture.appendCommentary).not.toHaveBeenCalled();
    if (failure === "stop") fixture.bridge.stop();
    if (failure === "chat-error") fixture.update({ status: "error" });
    const settlements = [
      {
        submissionId: "root",
        outcome:
          failure === "failed" || failure === "failed-without-busy"
            ? ("failed" as const)
            : ("completed" as const),
      },
    ];
    fixture.update({ settlements });
    fixture.update({ settlements });
    await fixture.bridge.accept({ id: "one", text: "Describe the process" });
    expect(fixture.appendInstructions.mock.calls).toEqual(
      failure === "stop"
        ? []
        : [
            [
              "The backend could not take that request now. Ask the person to continue. Do not claim the work completed or was cancelled.",
              "request",
            ],
          ],
    );
    expect(fixture.appendCommentary).not.toHaveBeenCalled();
    expect(fixture.submit).toHaveBeenCalledOnce();
  },
);

test("textless and dropped inputs without delegations do not inject session-wide instructions", async () => {
  const fixture = setup();
  await fixture.bridge.accept({ id: "one", text: "First" });
  fixture.update({ status: "streaming" });
  fixture.update({ settlements: completed, canAcceptVoiceInput: false });
  await fixture.bridge.accept({ id: "two", text: "Dropped" });
  expect(fixture.appendInstructions).not.toHaveBeenCalled();
  expect(fixture.appendCommentary).not.toHaveBeenCalled();
});
