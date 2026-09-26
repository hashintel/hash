import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { LiveBrunchBridge } from "./live-brunch-bridge";
import { VoiceMediationHistory } from "./voice-mediation-history";

import type { FlueConversationState } from "@flue/sdk";

beforeEach(() => {
  vi.spyOn(console, "debug").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const setup = (
  mediation?: ConstructorParameters<typeof LiveBrunchBridge>[0]["mediation"],
) => {
  const appendCommentary = vi.fn<
    ConstructorParameters<typeof LiveBrunchBridge>[0]["appendCommentary"]
  >(() => true);
  const appendInstructions = vi.fn<
    ConstructorParameters<typeof LiveBrunchBridge>[0]["appendInstructions"]
  >(() => true);
  const appendThinking = vi.fn<
    ConstructorParameters<typeof LiveBrunchBridge>[0]["appendThinking"]
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
    appendThinking,
    notice,
    submit,
    mediation,
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
    appendThinking,
    notice,
    submit,
    update,
  };
};

const workpieceRevision = (
  toolCallId: string,
  markdown: string,
  ordinal = 1,
): FlueConversationState["messages"][number] => ({
  id: `message-${toolCallId}`,
  role: "assistant",
  purpose: "assistant",
  display: "visible",
  parts: [
    {
      type: "dynamic-tool",
      toolName: "mutate_workpiece",
      toolCallId,
      state: "output-available",
      input: { markdown },
      output: { revisionId: toolCallId, sha256: "hash", ordinal },
    },
  ],
});

const ledgerSnapshot = (
  ...messages: FlueConversationState["messages"]
): FlueConversationState => ({
  conversationId: "conversation",
  settlements: [],
  messages,
});

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

test("a delayed superseded transcript may be admitted but never offered back as fresh speech", async () => {
  const fixture = setup();
  await fixture.bridge.accept({
    id: "old",
    text: "Old request",
    superseded: true,
  });
  fixture.bridge.responseStarted(started);
  fixture.bridge.responseCompleted({
    ...started,
    position: { batch: 2, index: 0 },
  });
  fixture.update({ segments: [segment()], settlements: completed });
  expect(fixture.submit).toHaveBeenCalledOnce();
  expect(fixture.appendCommentary).not.toHaveBeenCalled();
});

test("prepares a brief before admission and summarizes only a settled rendered answer", async () => {
  const history = new VoiceMediationHistory("test");
  const prepare = vi.fn(async () => ({
    decide: "two to eight",
    runs: "Still open",
  }));
  const summarize = vi.fn(
    async () => "The comparison is drafted. Run it from the card.",
  );
  const offered = vi.fn();
  const fixture = setup({ history, prepare, summarize, offered });
  await fixture.bridge.accept({ id: "one", text: "Um, compare two to eight" });
  expect(prepare).toHaveBeenCalledWith(
    "Um, compare two to eight",
    expect.any(AbortSignal),
  );
  expect(fixture.submit.mock.calls[0]?.[0].text).toContain(
    '"runs":"Still open"',
  );
  expect(fixture.submit.mock.calls[0]?.[0]).not.toHaveProperty(
    "text",
    "Um, compare two to eight",
  );
  expect(history.project([])[0]?.parts[0]).toEqual({
    type: "text",
    text: "Um, compare two to eight",
  });
  fixture.bridge.responseStarted(started);
  fixture.update({ status: "streaming", segments: [segment()] });
  expect(summarize).not.toHaveBeenCalled();
  fixture.bridge.responseCompleted({
    ...started,
    position: { batch: 2, index: 0 },
  });
  fixture.update({ segments: [segment()], settlements: completed });
  await vi.waitFor(() =>
    expect(fixture.appendCommentary).toHaveBeenCalledExactlyOnceWith(
      "The comparison is drafted. Run it from the card.",
      null,
    ),
  );
  expect(summarize).toHaveBeenCalledWith(
    segment().text,
    expect.any(AbortSignal),
  );
  expect(offered).toHaveBeenCalledWith("one");
});

test("brief stays streaming through extraction and transport, and becomes done only at admission", async () => {
  const brief = Promise.withResolvers<Record<string, string>>();
  const response = Promise.withResolvers<{
    kind: "message";
    messageId: string;
    submissionId: string;
  }>();
  const history = new VoiceMediationHistory("test");
  const fixture = setup({
    history,
    prepare: () => brief.promise,
    summarize: vi.fn(),
    offered: vi.fn(),
  });
  fixture.submit.mockImplementation(() => response.promise);
  const turn = fixture.bridge.accept({
    id: "one",
    text: "Compare two to eight agents",
  });
  expect(history.project([])[0]?.parts[1]).toEqual({
    type: "data-brief",
    data: { fields: {}, state: "streaming" },
  });
  expect(fixture.submit).not.toHaveBeenCalled();
  const fields = { decide: "two to eight agents", runs: "Still open" };
  brief.resolve(fields);
  await vi.waitFor(() => expect(fixture.submit).toHaveBeenCalledOnce());
  expect(history.project([])[0]?.parts[1]).toEqual({
    type: "data-brief",
    data: { fields, state: "streaming" },
  });
  fixture.submit.mock.calls[0]?.[0].onAdmission("root");
  expect(history.project([])[0]?.parts[1]).toEqual({
    type: "data-brief",
    data: { fields, state: "done" },
  });
  fixture.bridge.speechStarted();
  expect(history.project([])[0]?.parts[1]).toEqual({
    type: "data-brief",
    data: { fields, state: "done" },
  });
  response.resolve({ kind: "message", messageId: "one", submissionId: "root" });
  await turn;
});

test("speech cancels preparation and stale asynchronous wrap-ups without cancelling admitted Brunch work", async () => {
  let resolveBrief!: (fields: Record<string, string>) => void;
  let resolveSummary!: (text: string) => void;
  const history = new VoiceMediationHistory("test");
  const prepare = vi.fn(
    () =>
      new Promise<Record<string, string>>((resolve) => {
        resolveBrief = resolve;
      }),
  );
  const summarize = vi.fn(
    () =>
      new Promise<string>((resolve) => {
        resolveSummary = resolve;
      }),
  );
  const fixture = setup({ history, prepare, summarize, offered: vi.fn() });
  const first = fixture.bridge.accept({ id: "one", text: "First request" });
  fixture.bridge.speechStarted();
  expect(history.project([])).toEqual([]);
  resolveBrief({ goal: "First request" });
  await first;
  expect(history.project([])).toEqual([]);
  expect(fixture.submit).not.toHaveBeenCalled();
  prepare.mockResolvedValue({ goal: "Correction" });
  await fixture.bridge.accept({ id: "two", text: "Correction" });
  fixture.bridge.responseStarted(started);
  fixture.bridge.responseCompleted({
    ...started,
    position: { batch: 2, index: 0 },
  });
  fixture.update({ segments: [segment()], settlements: completed });
  expect(summarize).toHaveBeenCalledOnce();
  fixture.bridge.speechStarted();
  resolveSummary("Stale result.");
  await Promise.resolve();
  expect(fixture.appendCommentary).not.toHaveBeenCalled();
  expect(fixture.submit.mock.calls[0]?.[0]).toHaveProperty(
    "signal.aborted",
    false,
  );
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
    appendThinking: fixture.appendThinking,
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

test("offers one quiet coverage note per applied Ledger revision, before any spoken answer", async () => {
  const fixture = setup();
  expect(fixture.appendThinking).not.toHaveBeenCalled();

  const first = workpieceRevision(
    "rev-1",
    "# Workpiece\n\n## Operational account\n\n### Time, quantities, arrivals, and stochastic behavior\n\n50 calls per hour.\n\n### Policies, exceptions, practiced rules, and contextual regimes\n",
  );
  fixture.update({ snapshot: ledgerSnapshot(first) });
  expect(fixture.appendThinking).toHaveBeenCalledExactlyOnceWith(
    expect.stringContaining("Settled: Time, quantities, arrivals"),
    null,
  );
  // The same revision re-rendered does not re-enter session context.
  fixture.update({ snapshot: ledgerSnapshot(first), status: "streaming" });
  fixture.update({ snapshot: ledgerSnapshot(first) });
  expect(fixture.appendThinking).toHaveBeenCalledOnce();

  // Quiet context lands before commentary from the same update.
  const order: string[] = [];
  fixture.appendThinking.mockImplementation(() => {
    order.push("thinking");
    return true;
  });
  fixture.appendCommentary.mockImplementation(() => {
    order.push("commentary");
    return true;
  });
  await fixture.bridge.accept({ id: "one", text: "Callers hang up" });
  fixture.bridge.responseStarted(started);
  fixture.bridge.responseCompleted({
    ...started,
    position: { batch: 2, index: 0 },
  });
  const second = workpieceRevision(
    "rev-2",
    "# Workpiece\n\n## Operational account\n\n### Time, quantities, arrivals, and stochastic behavior\n\n50 calls per hour.\n\n### Policies, exceptions, practiced rules, and contextual regimes\n\nCallers abandon after about five minutes. **Assumed** until confirmed.\n",
    2,
  );
  fixture.update({
    segments: [segment()],
    settlements: completed,
    snapshot: { ...ledgerSnapshot(first, second), settlements: completed },
  });
  expect(order).toEqual(["thinking", "commentary"]);
  expect(fixture.appendThinking).toHaveBeenLastCalledWith(
    expect.stringContaining("marked open"),
    null,
  );
});

test("retries the coverage note only while the local send fails, and ignores refused or unbound revisions", () => {
  const fixture = setup();
  fixture.appendThinking.mockReturnValueOnce(false);
  const applied = workpieceRevision("rev-1", "### Goals\n\nLower wait.\n");
  fixture.update({ snapshot: ledgerSnapshot(applied) });
  fixture.update({ snapshot: ledgerSnapshot(applied) });
  expect(fixture.appendThinking).toHaveBeenCalledTimes(2);
  fixture.update({ snapshot: ledgerSnapshot(applied) });
  expect(fixture.appendThinking).toHaveBeenCalledTimes(2);

  const refused: FlueConversationState["messages"][number] = {
    ...workpieceRevision("rev-2", "### Goals\n\nSomething else.\n"),
    parts: [
      {
        type: "dynamic-tool",
        toolName: "mutate_workpiece",
        toolCallId: "rev-2",
        state: "output-available",
        input: { markdown: "### Goals\n\nSomething else.\n" },
        output: { disposition: "refused", applied: false },
      },
    ],
  };
  const unbound = workpieceRevision("rev-3", "### Goals\n\nUnbound.\n");
  fixture.update({
    snapshot: ledgerSnapshot(applied, refused, {
      ...unbound,
      parts: [
        {
          ...unbound.parts[0]!,
          output: { revisionId: "rev-1", sha256: "hash", ordinal: 3 },
        } as FlueConversationState["messages"][number]["parts"][number],
      ],
    }),
  });
  expect(fixture.appendThinking).toHaveBeenCalledTimes(2);
});

test("answers a whole-utterance playback command from the canvas without a Brunch turn", async () => {
  const fixture = setup();
  const playback = {
    play: vi.fn(async () => {}),
    pause: vi.fn(),
    stop: vi.fn(),
  };
  const bridge = new LiveBrunchBridge({
    appendCommentary: fixture.appendCommentary,
    appendInstructions: fixture.appendInstructions,
    appendThinking: fixture.appendThinking,
    notice: fixture.notice,
    submit: fixture.submit,
    playback,
  });
  // Playback does not wait for Brunch admission to be available.
  bridge.update({
    status: "ready",
    canAcceptVoiceInput: false,
    segments: [],
    settlements: [],
  });
  bridge.acceptDelegation("delegation-play");
  await bridge.accept({ id: "one", text: "Okay, play the simulation." });
  expect(playback.play).toHaveBeenCalledOnce();
  expect(fixture.submit).not.toHaveBeenCalled();
  expect(fixture.appendCommentary).toHaveBeenCalledExactlyOnceWith(
    "Playing.",
    "delegation-play",
  );
  expect(fixture.notice).not.toHaveBeenCalled();

  // A longer remark that mentions pausing is still a Brunch turn.
  bridge.update({
    status: "ready",
    canAcceptVoiceInput: true,
    segments: [],
    settlements: [],
  });
  await bridge.accept({
    id: "two",
    text: "Pause it there, the queue never gets that long in practice.",
  });
  expect(playback.pause).not.toHaveBeenCalled();
  expect(fixture.submit).toHaveBeenCalledOnce();
});

test("a playback control that fails is reported, never spoken as done", async () => {
  const fixture = setup();
  const playback = {
    play: vi.fn(async () => {
      throw new Error("No scenario selected");
    }),
    pause: vi.fn(),
    stop: vi.fn(),
  };
  const bridge = new LiveBrunchBridge({
    appendCommentary: fixture.appendCommentary,
    appendInstructions: fixture.appendInstructions,
    appendThinking: fixture.appendThinking,
    notice: fixture.notice,
    submit: fixture.submit,
    playback,
  });
  bridge.acceptDelegation("delegation-play");
  await bridge.accept({ id: "one", text: "Play" });
  expect(fixture.appendCommentary).not.toHaveBeenCalled();
  expect(fixture.appendInstructions).toHaveBeenCalledExactlyOnceWith(
    expect.stringContaining(
      "could not play the simulation: No scenario selected",
    ),
    "delegation-play",
  );
  expect(fixture.notice).toHaveBeenCalledWith(
    "The simulation could not play: No scenario selected",
  );

  // Without a delegation there is nothing to redirect; the notice stands alone.
  await bridge.accept({ id: "two", text: "Stop the simulation" });
  expect(playback.stop).toHaveBeenCalledOnce();
  expect(fixture.appendCommentary).toHaveBeenCalledExactlyOnceWith(
    "Stopped. The simulation is back at the start.",
    null,
  );
});

test("without canvas controls, a playback word is an ordinary Brunch turn", async () => {
  const fixture = setup();
  await fixture.bridge.accept({ id: "one", text: "Play" });
  expect(fixture.submit).toHaveBeenCalledOnce();
  expect(fixture.appendCommentary).not.toHaveBeenCalled();
});
