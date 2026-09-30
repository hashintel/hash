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
  const speechPending = vi.fn(() => true);
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
    speechPending,
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
    speechPending,
    submit,
    update,
  };
};

const traceRecords = (calls: readonly (readonly unknown[])[], event: string) =>
  calls
    .map(
      ([line]) =>
        JSON.parse(
          String(line).replace("[Petrinaut Live trace] ", ""),
        ) as Record<string, unknown>,
    )
    .filter((record) => record.event === event);

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
/** Speech that started while Live was quiet. */
const speech = (id: string, text: string) => ({
  id,
  text,
  startedDuringOutput: false,
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

test("enforcement withholds once and a later delegation cannot submit it", async () => {
  vi.stubEnv("DEV", true);
  const judge = vi.fn(async () => ({
    contribution: "social_or_backchannel" as const,
    confidence: 0.8,
  }));
  const fixture = setup(judge, { enforce: true });
  const input = speech("one", "PRIVATE okay");
  fixture.bridge.acceptDelegation("early");
  await fixture.bridge.accept(input);
  await fixture.bridge.accept(input);
  expect(fixture.submit).not.toHaveBeenCalled();
  expect(judge).toHaveBeenCalledOnce();
  fixture.bridge.acceptDelegation("late");
  expect(fixture.submit).not.toHaveBeenCalled();
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
  await fixture.bridge.accept(speech("one", "original answer"));
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
  void fixture.bridge.accept(speech("one", "first"));
  void fixture.bridge.accept(speech("two", "second"));
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
  await fixture.bridge.accept(speech("one", "Four reviewers"));
  await fixture.bridge.accept(speech("two", "Seven, not four"));
  await fixture.bridge.accept(speech("three", "Approval is optional"));
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

test("enforcement offers admitted Brunch prose on the delegation that arrived during judgment", async () => {
  const pending = Promise.withResolvers<UtteranceJudgment | null>();
  const fixture = setup(() => pending.promise, { enforce: true });
  await fixture.bridge.accept(speech("one", "Four reviewers"));
  fixture.bridge.acceptDelegation("delegation");
  expect(fixture.submit).not.toHaveBeenCalled();
  pending.resolve(null);
  await pending.promise;
  await Promise.resolve();
  expect(fixture.submit).toHaveBeenCalledOnce();
  fixture.bridge.responseStarted(started);
  fixture.bridge.responseCompleted({
    ...started,
    position: { batch: 2, index: 0 },
  });
  fixture.update({ segments: [segment()], settlements: completed });
  expect(fixture.appendCommentary).toHaveBeenCalledExactlyOnceWith(
    segment().text,
    "delegation",
  );
  expect(fixture.appendInstructions).not.toHaveBeenCalled();
  fixture.bridge.stop();
});

test.each([
  ["empty", speech("skipped", ".")],
  [
    "short-during-output",
    { id: "skipped", text: "Yes", startedDuringOutput: true },
  ],
])(
  "enforcement never judges input the %s stage skips",
  async (_stage, input) => {
    const judge = vi.fn(async () => null);
    const fixture = setup(judge, { enforce: true });
    await fixture.bridge.accept(input);
    expect(judge).not.toHaveBeenCalled();
    expect(fixture.submit).not.toHaveBeenCalled();
    await fixture.bridge.accept(speech("answer", "Seven reviewers"));
    expect(judge).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ transcript: "Seven reviewers" }),
      expect.any(AbortSignal),
    );
    fixture.bridge.stop();
  },
);

test.each([
  ["control", "leave"],
  ["relay_request", "leave"],
  ["social_or_backchannel", "decline"],
  ["restates_assistant", "decline"],
  ["no_content", "decline"],
] as const)(
  "enforcement withholding %s input applies delegation policy %s",
  async (contribution, policy) => {
    vi.stubEnv("DEV", true);
    const pending = Promise.withResolvers<UtteranceJudgment | null>();
    const judge = vi
      .fn()
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValue(null);
    const fixture = setup(judge, { enforce: true });
    await fixture.bridge.accept(speech("held", "PRIVATE incidental"));
    fixture.bridge.acceptDelegation("delegation");
    pending.resolve({ contribution, confidence: 0.9 });
    await pending.promise;
    await Promise.resolve();
    expect(fixture.submit).not.toHaveBeenCalled();
    expect(fixture.appendInstructions.mock.calls).toEqual(
      policy === "decline"
        ? [[expect.stringContaining("not sent to the backend"), "delegation"]]
        : [],
    );
    expect(traceRecords(diagnosticSpy.mock.calls, "input.withheld")).toEqual([
      expect.objectContaining({
        inputId: "held",
        delegationId: "delegation",
        delegation: policy,
      }),
    ]);

    // A released delegation is never reused for later speech or closed later.
    await fixture.bridge.accept(speech("answer", "Seven reviewers"));
    await Promise.resolve();
    expect(fixture.submit).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ id: "answer" }),
    );
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
    fixture.bridge.stopResponse();
    fixture.bridge.stop();
    expect(fixture.appendInstructions).toHaveBeenCalledTimes(
      policy === "decline" ? 1 : 0,
    );
    expect(JSON.stringify(diagnosticSpy.mock.calls)).not.toContain("PRIVATE");
  },
);

test.each([
  ["control", "leave"],
  ["no_content", "decline"],
] as const)(
  "a delegation arriving after %s input is withheld applies policy %s",
  async (contribution, policy) => {
    vi.stubEnv("DEV", true);
    const judge = vi
      .fn()
      .mockResolvedValueOnce({ contribution, confidence: 0.9 })
      .mockResolvedValue(null);
    const fixture = setup(judge, { enforce: true });
    fixture.speechPending.mockReturnValue(false);
    await fixture.bridge.accept(speech("held", "PRIVATE incidental"));
    await Promise.resolve();
    fixture.bridge.acceptDelegation("late");
    expect(fixture.appendInstructions.mock.calls).toEqual(
      policy === "decline"
        ? [[expect.stringContaining("not sent to the backend"), "late"]]
        : [],
    );
    expect(
      traceRecords(diagnosticSpy.mock.calls, "delegation.matched"),
    ).toEqual([
      expect.objectContaining({
        inputId: "held",
        delegationId: "late",
        delegation: policy,
      }),
    ]);

    // The delegation is neither deferred nor reused by later speech.
    await fixture.bridge.accept(speech("answer", "Seven reviewers"));
    await Promise.resolve();
    expect(fixture.submit).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ id: "answer" }),
    );
    fixture.bridge.stop();
    expect(fixture.appendInstructions).toHaveBeenCalledTimes(
      policy === "decline" ? 1 : 0,
    );
    expect(JSON.stringify(diagnosticSpy.mock.calls)).not.toContain("PRIVATE");
  },
);

test("a newer input takes late delegations over from a withheld one", async () => {
  vi.stubEnv("DEV", true);
  const judge = vi
    .fn()
    .mockResolvedValueOnce({ contribution: "no_content", confidence: 0.9 })
    .mockResolvedValue(null);
  const fixture = setup(judge, { enforce: true });
  await fixture.bridge.accept(speech("held", "um"));
  await fixture.bridge.accept(speech("answer", "Seven reviewers"));
  fixture.bridge.acceptDelegation("delegation");
  expect(fixture.appendInstructions).not.toHaveBeenCalled();
  expect(traceRecords(diagnosticSpy.mock.calls, "delegation.matched")).toEqual([
    expect.objectContaining({ inputId: "answer", delegationId: "delegation" }),
  ]);
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
    void fixture.bridge.accept(speech("one", "answer"));
    await vi.advanceTimersByTimeAsync(999);
    expect(fixture.submit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(fixture.submit).toHaveBeenCalledOnce();
    expect(judge.mock.calls[0]?.[1].aborted).toBe(true);
    pending.resolve({ contribution: "control", confidence: 1 });
    await vi.advanceTimersByTimeAsync(1);
    expect(fixture.submit).toHaveBeenCalledOnce();
    fixture.bridge.stop();
  } finally {
    vi.useRealTimers();
  }
});

test("stopping enforcement cancels pending input", async () => {
  const pending = Promise.withResolvers<UtteranceJudgment | null>();
  const judge = vi
    .fn()
    .mockResolvedValueOnce({ contribution: "control", confidence: 1 })
    .mockReturnValueOnce(pending.promise);
  const fixture = setup(judge, { enforce: true });
  await fixture.bridge.accept(speech("held", "hang on"));
  void fixture.bridge.accept(speech("pending", "answer"));
  fixture.bridge.stop();
  pending.resolve(null);
  await pending.promise;
  expect(fixture.submit).not.toHaveBeenCalled();
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
  await fixture.bridge.accept(speech("queued", "old queued input"));
  void fixture.bridge.accept(speech("pending", "old pending judgment"));
  fixture.bridge.stopResponse();
  expect(judge.mock.calls[1]?.[1].aborted).toBe(true);
  fixture.update({ stopped: true });
  pending.resolve(null);
  await pending.promise;
  expect(fixture.submit).not.toHaveBeenCalled();
  await fixture.bridge.accept(speech("fresh", "new answer"));
  expect(fixture.submit).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ id: "fresh", text: "new answer" }),
  );
  fixture.bridge.stop();
});

test.each([
  [
    "error",
    (fixture: ReturnType<typeof setup>) => fixture.update({ status: "error" }),
  ],
  [
    "stopped",
    (fixture: ReturnType<typeof setup>) => fixture.bridge.stopResponse(),
  ],
  ["ended", (fixture: ReturnType<typeof setup>) => fixture.bridge.stop()],
] as const)(
  "enforcement traces each gated input discarded as %s without text",
  async (reason, interrupt) => {
    vi.stubEnv("DEV", true);
    const pending = Promise.withResolvers<UtteranceJudgment | null>();
    const judge = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ contribution: "control", confidence: 1 })
      .mockReturnValueOnce(pending.promise);
    const fixture = setup(judge, { enforce: true });
    fixture.update({ canAcceptVoiceInput: false });
    await fixture.bridge.accept(speech("cleared", "PRIVATE cleared answer"));
    await fixture.bridge.accept(speech("held", "PRIVATE hang on"));
    void fixture.bridge.accept(speech("pending", "PRIVATE pending answer"));
    interrupt(fixture);
    pending.resolve(null);
    await pending.promise;
    expect(fixture.submit).not.toHaveBeenCalled();
    expect(traceRecords(diagnosticSpy.mock.calls, "input.dropped")).toEqual([
      expect.objectContaining({
        inputId: "cleared",
        reason,
        decision: "submit",
      }),
      expect.objectContaining({
        inputId: "pending",
        reason,
        decision: "pending",
      }),
    ]);
    expect(JSON.stringify(diagnosticSpy.mock.calls)).not.toContain("PRIVATE");
    fixture.bridge.stop();
  },
);

test("log mode does not wait for judgments or introduce new admission drops", async () => {
  vi.stubEnv("DEV", true);
  const pending = Promise.withResolvers<UtteranceJudgment | null>();
  const judge = vi.fn(() => pending.promise);
  const fixture = setup(judge);
  await fixture.bridge.accept(speech("one", "PRIVATE ONE"));
  await fixture.bridge.accept(speech("two", "PRIVATE TWO"));
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
      decision: "withhold",
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
    await fixture.bridge.accept(speech("one", "PRIVATE"));
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
    await fixture.bridge.accept(speech("one", "PRIVATE"));
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
  await fixture.bridge.accept(speech("one", "PRIVATE"));
  await fixture.bridge.accept(speech("one", "PRIVATE"));
  await fixture.bridge.accept(speech("empty", " "));
  await fixture.bridge.accept(speech("oversize", "x".repeat(32_001)));
  fixture.update({ canAcceptVoiceInput: false });
  await fixture.bridge.accept(speech("unavailable", "PRIVATE"));
  expect(judge).toHaveBeenCalledOnce();
});

test.each([true, false])(
  "uses only successfully offered Brunch context (accepted=%s)",
  async (accepted) => {
    const judge = vi.fn(async () => null);
    const fixture = setup(judge);
    fixture.appendCommentary.mockReturnValue(accepted);
    await fixture.bridge.accept(speech("one", "PRIVATE FIRST"));
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
    await fixture.bridge.accept(speech("two", "PRIVATE SECOND"));
    expect(judge).toHaveBeenLastCalledWith(
      {
        transcript: "PRIVATE SECOND",
        offeredBrunchText: accepted ? "PRIVATE RELAY" : null,
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
  await fixture.bridge.accept(speech("one", "PRIVATE"));
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
  await fixture.bridge.accept(speech("first-input", "PRIVATE INPUT"));
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
  await fixture.bridge.accept(speech("dropped-input", "PRIVATE DROPPED"));
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
  await fixture.bridge.accept(speech("one", "Seven, not four"));
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
  await fixture.bridge.accept(speech("one", "Seven, not four"));
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
  await fixture.bridge.accept(speech("one", "Seven, not four"));
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
  await fixture.bridge.accept(speech("one", "Seven, not four"));
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
  await fixture.bridge.accept(speech("one", "Seven, not four"));
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
  await fixture.bridge.accept(speech("one", "Seven, not four"));
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
    speechPending: fixture.speechPending,
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
  const pending = bridge.accept(speech("one", "First"));
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
    await fixture.bridge.accept(speech("one", "Please explain"));
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
  const pending = fixture.bridge.accept(speech("one", "First"));
  await fixture.bridge.accept(speech("one", "First"));
  await fixture.bridge.accept(speech("empty", "  "));
  await fixture.bridge.accept(speech("two", "Follow-up"));
  expect(fixture.submit).toHaveBeenCalledOnce();
  expect(fixture.notice).toHaveBeenLastCalledWith(
    expect.stringContaining("not retained"),
  );
  release();
  await pending;
  await fixture.bridge.accept(speech("three", "First"));
  expect(fixture.submit).toHaveBeenCalledTimes(2);
});

test("empty finalized input resolves its delegation before a later turn", async () => {
  const fixture = setup();
  fixture.bridge.acceptDelegation("empty-delegation");
  await fixture.bridge.accept(speech("empty", "  "));
  await fixture.bridge.accept(speech("next", "Continue"));
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

test("punctuation-only finalized input is ignored like empty input", async () => {
  vi.stubEnv("DEV", true);
  const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
  const fixture = setup();
  fixture.bridge.acceptDelegation("punctuation-delegation");
  await fixture.bridge.accept(speech("punctuation", " . "));
  expect(fixture.submit).not.toHaveBeenCalled();
  expect(fixture.appendInstructions).toHaveBeenCalledExactlyOnceWith(
    expect.stringContaining("No usable speech"),
    "punctuation-delegation",
  );
  expect(debug).toHaveBeenCalledWith(
    expect.stringContaining('"reason":"empty"'),
  );
});

test("input of up to three words that started while Live was audible is not sent to Brunch", async () => {
  vi.stubEnv("DEV", true);
  const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
  const fixture = setup();
  await fixture.bridge.accept({
    id: "one-word",
    text: "Kristof.",
    startedDuringOutput: true,
  });
  await fixture.bridge.accept({
    id: "two-words",
    text: "Got it.",
    startedDuringOutput: true,
  });
  await fixture.bridge.accept({
    id: "three-words",
    text: "That sounds good.",
    startedDuringOutput: true,
  });
  await fixture.bridge.accept({
    id: "contraction",
    text: "I’ll be back.",
    startedDuringOutput: true,
  });
  await fixture.bridge.accept({
    id: "ascii-contraction",
    text: "I'll be back.",
    startedDuringOutput: true,
  });
  expect(fixture.submit).not.toHaveBeenCalled();
  expect(fixture.notice).not.toHaveBeenCalled();
  expect(fixture.appendInstructions).not.toHaveBeenCalled();
  const ignored = debug.mock.calls
    .map(
      ([line]) =>
        JSON.parse(
          String(line).replace("[Petrinaut Live trace] ", ""),
        ) as Record<string, unknown>,
    )
    .filter((record) => record.event === "input.ignored");
  expect(ignored).toEqual([
    expect.objectContaining({
      inputId: "one-word",
      reason: "short-during-output",
    }),
    expect.objectContaining({
      inputId: "two-words",
      reason: "short-during-output",
    }),
    expect.objectContaining({
      inputId: "three-words",
      reason: "short-during-output",
    }),
    expect.objectContaining({
      inputId: "contraction",
      reason: "short-during-output",
    }),
    expect.objectContaining({
      inputId: "ascii-contraction",
      reason: "short-during-output",
    }),
  ]);
  expect(JSON.stringify(debug.mock.calls)).not.toContain("Kristof");
});

test("short input while Live was quiet and four words during Live speech still reach Brunch", async () => {
  const fixture = setup();
  await fixture.bridge.accept({
    id: "quiet",
    text: "Yes.",
    startedDuringOutput: false,
  });
  await fixture.bridge.accept({
    id: "correction",
    text: "Seven reviewers, not four.",
    startedDuringOutput: true,
  });
  expect(fixture.submit).toHaveBeenCalledTimes(2);
  expect(fixture.submit).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({ id: "quiet", text: "Yes." }),
  );
  expect(fixture.submit).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({
      id: "correction",
      text: "Seven reviewers, not four.",
    }),
  );
  expect(
    fixture.submit.mock.calls.some(([input]) => "startedDuringOutput" in input),
  ).toBe(false);
});

test("a pending delegation neither exempts a short input during Live speech nor is used up by it", async () => {
  vi.stubEnv("DEV", true);
  const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
  const fixture = setup();
  fixture.bridge.acceptDelegation("pending");
  await fixture.bridge.accept({
    id: "echo",
    text: "Yes.",
    startedDuringOutput: true,
  });
  expect(fixture.submit).not.toHaveBeenCalled();
  expect(fixture.appendInstructions).not.toHaveBeenCalled();
  await fixture.bridge.accept({
    id: "answer",
    text: "Seven reviewers, not four.",
    startedDuringOutput: false,
  });
  expect(fixture.submit).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ id: "answer" }),
  );
  expect(debug).toHaveBeenCalledWith(
    expect.stringContaining(
      '"event":"brunch.submit","inputId":"answer","delegationId":"pending"',
    ),
  );
});

test("an input repeating Live's overlapping words is traced by the echo stage in shadow and handled as before", async () => {
  vi.stubEnv("DEV", true);
  const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
  const fixture = setup();
  fixture.bridge.acceptDelegation("pending");
  await fixture.bridge.accept({
    id: "echo",
    text: "PRIVATE how many staff work the morning shift",
    startedDuringOutput: true,
    liveOutputText:
      "PRIVATE how many staff work the morning shift on weekdays?",
  });
  await fixture.bridge.accept({
    id: "short-echo",
    text: "Okay.",
    startedDuringOutput: true,
    liveOutputText: "Okay, seven.",
  });
  await fixture.bridge.accept({
    id: "answer",
    text: "Seven.",
    startedDuringOutput: false,
    liveOutputText: "How many?",
  });

  expect(fixture.submit).toHaveBeenCalledTimes(2);
  expect(fixture.submit).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({ id: "echo" }),
  );
  expect(fixture.submit).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({ id: "answer" }),
  );
  expect(
    fixture.submit.mock.calls.some(([input]) => "liveOutputText" in input),
  ).toBe(false);
  const records = debug.mock.calls.map(
    ([line]) =>
      JSON.parse(String(line).replace("[Petrinaut Live trace] ", "")) as Record<
        string,
        unknown
      >,
  );
  expect(
    records.filter((record) => record.event === "filter.shadow"),
  ).toMatchObject([
    { inputId: "echo", stage: "echo", reason: "echo" },
    { inputId: "short-echo", stage: "echo", reason: "echo" },
    {
      inputId: "short-echo",
      stage: "doubtful-short-during-output",
      reason: "doubtful-short-during-output",
    },
  ]);
  expect(
    records.filter((record) => record.event === "input.ignored"),
  ).toMatchObject([{ inputId: "short-echo", reason: "short-during-output" }]);
  expect(debug).toHaveBeenCalledWith(
    expect.stringContaining(
      '"event":"brunch.submit","inputId":"echo","delegationId":"pending"',
    ),
  );
  const traced = JSON.stringify(debug.mock.calls);
  expect(traced).not.toContain("PRIVATE");
  expect(traced).not.toContain("Okay");
});

test("a delegation arriving before transcription reports speech is deferred without shifting the next answer", async () => {
  vi.stubEnv("DEV", true);
  const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
  const fixture = setup();
  fixture.speechPending.mockReturnValue(false);

  fixture.bridge.acceptDelegation("raced-delegation");

  expect(fixture.appendInstructions).not.toHaveBeenCalled();
  fixture.speechPending.mockReturnValue(true);
  await fixture.bridge.accept({
    id: "answer",
    text: "Seven reviewers.",
    startedDuringOutput: false,
  });
  fixture.speechPending.mockReturnValue(false);
  expect(fixture.submit).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ id: "answer" }),
  );
  expect(debug).toHaveBeenCalledWith(
    expect.stringContaining(
      '"event":"brunch.submit","inputId":"answer","delegationId":null',
    ),
  );
  const deferred = traceRecords(debug.mock.calls, "delegation.deferred");
  expect(deferred).toMatchObject([
    {
      delegationId: "raced-delegation",
      reason: "speech-order-unknown",
    },
  ]);
  expect(Object.keys(deferred[0] ?? {}).sort()).toEqual([
    "at",
    "delegationId",
    "event",
    "reason",
  ]);
  expect(traceRecords(debug.mock.calls, "delegation.closed")).toEqual([]);
});

test.each(["stop", "teardown"] as const)(
  "%s closes a deferred delegation without answering it",
  (mode) => {
    vi.stubEnv("DEV", true);
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    const fixture = setup();
    fixture.speechPending.mockReturnValue(false);
    fixture.bridge.acceptDelegation("raced-delegation");

    if (mode === "stop") fixture.bridge.stopResponse();
    else fixture.bridge.stop();
    fixture.bridge.stop();

    expect(fixture.appendInstructions).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining("Do not respond"),
      "raced-delegation",
    );
    expect(traceRecords(debug.mock.calls, "delegation.closed")).toMatchObject([
      { delegationId: "raced-delegation", reason: "deferred" },
    ]);
  },
);

test("a delegation that arrived while its phantom was transcribed is closed when the phantom is skipped", async () => {
  vi.stubEnv("DEV", true);
  const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
  const fixture = setup();
  fixture.bridge.acceptDelegation("phantom-delegation");
  expect(fixture.appendInstructions).not.toHaveBeenCalled();
  fixture.speechPending.mockReturnValue(false);
  await fixture.bridge.accept({
    id: "phantom",
    text: "Okay.",
    startedDuringOutput: true,
  });
  expect(fixture.appendInstructions).toHaveBeenCalledExactlyOnceWith(
    expect.stringContaining("Do not respond"),
    "phantom-delegation",
  );
  await fixture.bridge.accept({
    id: "answer",
    text: "Seven reviewers.",
    startedDuringOutput: false,
  });
  expect(debug).toHaveBeenCalledWith(
    expect.stringContaining(
      '"event":"brunch.submit","inputId":"answer","delegationId":null',
    ),
  );
});

test("an answer claims the newest delegation, and older ones close once no speech awaits", async () => {
  vi.stubEnv("DEV", true);
  const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
  const fixture = setup();
  fixture.bridge.acceptDelegation("older");
  fixture.bridge.acceptDelegation("newer");
  fixture.speechPending.mockReturnValue(false);
  await fixture.bridge.accept({
    id: "answer",
    text: "Seven reviewers.",
    startedDuringOutput: false,
  });
  expect(debug).toHaveBeenCalledWith(
    expect.stringContaining(
      '"event":"brunch.submit","inputId":"answer","delegationId":"newer"',
    ),
  );
  expect(fixture.appendInstructions).toHaveBeenCalledExactlyOnceWith(
    expect.stringContaining("Do not respond"),
    "older",
  );
  expect(traceRecords(debug.mock.calls, "delegation.closed")).toMatchObject([
    { delegationId: "older", reason: "no-pending-speech" },
  ]);
});

test("a turn waiting for its delegation still takes one that arrives when no speech is pending", async () => {
  vi.stubEnv("DEV", true);
  const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
  const fixture = setup();
  fixture.speechPending.mockReturnValue(false);
  await fixture.bridge.accept({
    id: "answer",
    text: "Seven reviewers.",
    startedDuringOutput: false,
  });
  fixture.bridge.acceptDelegation("late");
  expect(fixture.appendInstructions).not.toHaveBeenCalled();
  expect(traceRecords(debug.mock.calls, "delegation.matched")).toMatchObject([
    { delegationId: "late", inputId: "answer" },
  ]);
  expect(traceRecords(debug.mock.calls, "delegation.closed")).toEqual([]);
});

test("uncertain admission is visible and never automatically replayed", async () => {
  const fixture = setup();
  fixture.submit.mockRejectedValueOnce(new Error("Unknown admission"));
  await fixture.bridge.accept(speech("one", "First"));
  await fixture.bridge.accept(speech("one", "First"));
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
  await fixture.bridge.accept(speech("one", "First"));
  await fixture.bridge.accept(speech("one", "First"));
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
  const first = fixture.bridge.accept(speech("one", "Four reviewers"));
  fixture.update({ status: "streaming", canAcceptVoiceInput: true });
  const correction = fixture.bridge.accept(speech("two", "Seven, not four"));
  expect(fixture.submit).toHaveBeenCalledTimes(2);

  finishFirst();
  await first;
  await fixture.bridge.accept(speech("three", "Another pending input"));
  expect(fixture.submit).toHaveBeenCalledTimes(2);
  expect(fixture.notice).toHaveBeenLastCalledWith(
    expect.stringContaining("not retained"),
  );

  admitCorrection();
  await fixture.bridge.accept(speech("four", "Approval is optional"));
  expect(fixture.submit).toHaveBeenCalledTimes(3);
  finishCorrection();
  await correction;
});

test.each(["completed", "failed", "aborted"] as const)(
  "follows the answering submission and waits for its %s settlement and textless continuation",
  async (outcome) => {
    const fixture = setup();
    await fixture.bridge.accept(speech("one", "Explain the result"));
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
  await fixture.bridge.accept(speech("one", "First question"));
  fixture.submit.mockImplementationOnce(async (input) => {
    input.onAdmission("second");
    return { kind: "message", messageId: "two", submissionId: "second" };
  });
  fixture.bridge.acceptDelegation("second-delegation");
  await fixture.bridge.accept(speech("two", "Clarification"));
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
    await fixture.bridge.accept(speech("input", "Seven, not four"));
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
  await fixture.bridge.accept(speech("input", "Explain the result"));
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
  await fixture.bridge.accept(speech("one", "First"));
  const signal = vi.mocked(fixture.submit).mock.calls[0]?.[0];
  fixture.bridge.stop();
  fixture.bridge.responseStarted(started);
  fixture.bridge.responseCompleted({
    ...started,
    position: { batch: 2, index: 0 },
  });
  fixture.update({ segments: [segment()], settlements: completed });
  await fixture.bridge.accept(speech("late", "Late"));
  expect(signal).toBeDefined();
  expect(fixture.appendCommentary).not.toHaveBeenCalled();
  expect(fixture.submit).toHaveBeenCalledOnce();
});

test("response-only Stop resolves attached and unclaimed delegations before a later utterance", async () => {
  const fixture = setup();
  fixture.bridge.acceptDelegation("attached");
  await fixture.bridge.accept(speech("one", "First"));
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
  await fixture.bridge.accept(speech("two", "Continue"));
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
  await fixture.bridge.accept(speech("one", "First"));
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
  await fixture.bridge.accept(speech("one", "First"));
  fixture.update({ stopped: true });
  await fixture.bridge.accept(speech("two", "Second"));
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
  const pending = fixture.bridge.accept(speech("one", "First"));
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
  await fixture.bridge.accept(speech("one", "First"));
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
  const recovery = fixture.bridge.accept(speech("two", "Try again"));
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
  await fixture.bridge.accept(speech("three", "Next question"));
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
  await fixture.bridge.accept(speech("one", "First"));
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
    await fixture.bridge.accept(speech("first", "Seven reviewers"));
    fixture.submit.mockImplementationOnce(async (input) => {
      input.onAdmission("second");
      return {
        kind: "message",
        messageId: "second-input",
        submissionId: "second",
      };
    });
    await fixture.bridge.accept(speech("second-input", "Approval is optional"));
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
  const pending = fixture.bridge.accept(speech("first", "First"));
  fixture.bridge.acceptDelegation("dropped");
  await fixture.bridge.accept(speech("second", "Second"));
  await fixture.bridge.accept(speech("second", "Second"));
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
    await fixture.bridge.accept(speech("one", "Describe the process"));
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
    await fixture.bridge.accept(speech("one", "Describe the process"));
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
  await fixture.bridge.accept(speech("one", "First"));
  fixture.update({ status: "streaming" });
  fixture.update({ settlements: completed, canAcceptVoiceInput: false });
  await fixture.bridge.accept(speech("two", "Dropped"));
  expect(fixture.appendInstructions).not.toHaveBeenCalled();
  expect(fixture.appendCommentary).not.toHaveBeenCalled();
});
