import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { prepareVoiceBrief } from "../../../shared/voice-mediation";
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
  const appendThinking = vi.fn<(text: string, delegationId: null) => boolean>(
    () => true,
  );
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
    '"utterance":"Um, compare two to eight"',
  );
  expect(fixture.submit.mock.calls[0]?.[0].text).toContain(
    '"excerpts":{"decide":"two to eight"}',
  );
  expect(fixture.submit.mock.calls[0]?.[0].text).not.toContain("Still open");
  expect(
    history.project([
      { id: "one", role: "user", parts: [{ type: "text", text: "Brief" }] },
    ])[0]?.parts[0],
  ).toEqual({
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

test("tells Live about the limitation when a settled answer's spoken summary fails", async () => {
  const fixture = setup({
    history: new VoiceMediationHistory("test"),
    prepare: async () => ({}),
    summarize: vi.fn(async () => {
      throw new Error("Unavailable");
    }),
    offered: vi.fn(),
  });
  await fixture.bridge.accept({ id: "one", text: "Compare two to eight" });
  fixture.bridge.acceptDelegation("delegation");
  fixture.bridge.responseStarted(started);
  fixture.bridge.responseCompleted({
    ...started,
    position: { batch: 2, index: 0 },
  });
  fixture.update({ segments: [segment()], settlements: completed });

  await vi.waitFor(() =>
    expect(fixture.appendInstructions).toHaveBeenCalledWith(
      expect.stringContaining("spoken summary could not be prepared"),
      "delegation",
    ),
  );
  expect(fixture.appendCommentary).not.toHaveBeenCalled();
});

test.each([
  "Continue.",
  "The first one.",
  "Just do something, default to something, yeah.",
])(
  "admits the exact follow-up even when extraction has no facts: %s",
  async (text) => {
    const fixture = setup({
      history: new VoiceMediationHistory("test"),
      prepare: async (transcript) =>
        prepareVoiceBrief(transcript, { kind: "modelling" }),
      summarize: vi.fn(),
      offered: vi.fn(),
    });
    await fixture.bridge.accept({ id: "follow-up", text });
    expect(fixture.submit).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        id: "follow-up",
        admissionTarget: { kind: "user", messageId: "follow-up" },
      }),
    );
    expect(fixture.submit.mock.calls[0]?.[0].text).toContain(
      JSON.stringify({ utterance: text, excerpts: {} }),
    );
    expect(fixture.submit.mock.calls[0]?.[0].text).not.toContain("Still open");
  },
);

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
  const admitted = [
    {
      id: "one",
      role: "user" as const,
      parts: [{ type: "text" as const, text: "Brief" }],
    },
  ];
  expect(history.project(admitted)[0]?.parts[1]).toEqual({
    type: "data-brief",
    data: { fields, state: "done" },
  });
  fixture.bridge.speechStarted();
  expect(history.project(admitted)[0]?.parts[1]).toEqual({
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
    expect.stringContaining("finished without a spoken answer"),
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

test.each(["button", "snapshot", "aborted"] as const)(
  "%s preserves interrupted partial-answer context and resumes only through one new admission",
  async (stopKind) => {
    const fixture = setup();
    fixture.bridge.acceptDelegation("original-delegation");
    await fixture.bridge.accept({
      id: "original",
      text: "Build a supply chain with defaults",
    });
    fixture.bridge.responseStarted(started);
    const partial = "Orders arrive, queue, then a handler starts picking. Next";
    const messages = [
      {
        id: "unrelated",
        role: "assistant" as const,
        parts: [
          {
            type: "text" as const,
            text: "Unrelated private answer",
            state: "streaming" as const,
          },
        ],
      },
      {
        id: "answer",
        role: "assistant" as const,
        parts: [
          {
            type: "reasoning" as const,
            text: "Hidden reasoning",
            state: "streaming" as const,
          },
          { type: "text" as const, text: partial, state: "streaming" as const },
        ],
      },
    ];
    fixture.update({ status: "streaming", messages });
    if (stopKind === "button") fixture.bridge.stopResponse();
    else if (stopKind === "snapshot")
      fixture.update({ stopped: true, messages });
    else
      fixture.update({
        messages,
        settlements: [{ submissionId: "root", outcome: "aborted" }],
      });

    expect(fixture.appendThinking).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining(partial),
      null,
    );
    const note = fixture.appendThinking.mock.calls[0]?.[0];
    expect(note).toContain("Build a supply chain with defaults");
    expect(note).toContain('"answerMessageIds":["answer"]');
    expect(note).toContain("not a completed answer");
    expect(note).not.toContain("Hidden reasoning");
    expect(note).not.toContain("Unrelated private answer");
    expect(fixture.appendInstructions).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining("The assistant response was interrupted"),
      "original-delegation",
    );
    expect(fixture.appendCommentary).not.toHaveBeenCalled();
    expect(fixture.submit).toHaveBeenCalledOnce();

    // Neither late completion nor a cancelled tool continuation resurrects the old turn.
    const continuation = {
      ...started,
      submissionId: "cancelled-tool-continuation",
      position: { batch: 3, index: 0 },
    };
    fixture.bridge.responseStarted(continuation);
    fixture.bridge.responseCompleted({
      ...continuation,
      position: { batch: 4, index: 0 },
    });
    fixture.update({
      segments: [segment("Stale success")],
      settlements: completed,
    });
    expect(fixture.appendCommentary).not.toHaveBeenCalled();
    expect(fixture.submit).toHaveBeenCalledOnce();
    expect(fixture.appendThinking).toHaveBeenCalledOnce();

    fixture.bridge.speechStarted();
    fixture.bridge.acceptDelegation("resume-delegation");
    fixture.submit.mockImplementationOnce(async (input) => {
      input.onAdmission("resume");
      return {
        kind: "message",
        messageId: "resume-input",
        submissionId: "resume",
      };
    });
    await fixture.bridge.accept({ id: "resume-input", text: "Continue" });
    await fixture.bridge.accept({ id: "resume-input", text: "Continue" });
    expect(fixture.submit).toHaveBeenCalledTimes(2);
    expect(fixture.submit.mock.calls[1]?.[0].text).toBe("Continue");
    const resumed = {
      ...started,
      messageId: "resumed-answer",
      submissionId: "resume",
    };
    fixture.bridge.responseStarted(resumed);
    fixture.bridge.responseCompleted({
      ...resumed,
      position: { batch: 2, index: 0 },
    });
    const result = {
      ...segment("Next, completed orders release the handler."),
      messageId: "resumed-answer",
      submissionIds: ["resume"],
    };
    fixture.update({
      segments: [segment("Stale success"), result],
      settlements: [
        ...completed,
        { submissionId: "resume", outcome: "completed" },
      ],
    });
    expect(fixture.appendCommentary).toHaveBeenCalledExactlyOnceWith(
      result.text,
      "resume-delegation",
    );
  },
);

test("clips interrupted request and answer context to one Live append", async () => {
  const fixture = setup();
  const request = `request-start ${"request ".repeat(800)}request-end`;
  const partial = `answer-start ${"answer ".repeat(800)}answer-end`;
  await fixture.bridge.accept({ id: "original", text: request });
  fixture.bridge.responseStarted(started);
  fixture.update({
    status: "streaming",
    messages: [
      {
        id: "answer",
        role: "assistant",
        parts: [{ type: "text", text: partial, state: "streaming" }],
      },
    ],
  });

  fixture.bridge.stopResponse();

  const note = fixture.appendThinking.mock.calls[0]?.[0];
  expect(note).toBeDefined();
  expect(note!.length).toBeLessThanOrEqual(1_400);
  expect(note).toContain("request-end");
  expect(note).toContain("answer-end");
});

test("response-only Stop resolves attached and unclaimed delegations before a later utterance", async () => {
  const fixture = setup();
  fixture.bridge.acceptDelegation("attached");
  await fixture.bridge.accept({ id: "one", text: "First" });
  fixture.bridge.acceptDelegation("unclaimed");

  fixture.bridge.stopResponse();

  expect(fixture.appendInstructions.mock.calls).toEqual([
    [
      expect.stringContaining("The assistant response was interrupted"),
      "attached",
    ],
    [
      expect.stringContaining("No request admission was confirmed"),
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
    [expect.stringContaining("Request admission is unconfirmed"), "pending"],
    [
      expect.stringContaining("No request admission was confirmed"),
      "unclaimed",
    ],
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
    expect.stringContaining(
      "request was admitted, but its response could not be confirmed",
    ),
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
    expect.stringContaining(
      "request was admitted, but its response could not be confirmed",
    ),
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
    expect.stringContaining("The request was not submitted"),
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
    const expectedStatus = {
      admission: "Request admission is unconfirmed",
      response: "request was admitted, but its response could not be confirmed",
      failed: "The response failed",
      "failed-without-busy": "The response failed",
      textless: "finished without a spoken answer",
      "chat-error":
        "request was admitted, but its response could not be confirmed",
      stop: "",
    }[failure];
    expect(fixture.appendInstructions.mock.calls).toEqual(
      failure === "stop"
        ? []
        : [[expect.stringContaining(expectedStatus), "request"]],
    );
    expect(fixture.appendThinking).not.toHaveBeenCalled();
    expect(
      fixture.appendInstructions.mock.calls.flat().join(" "),
    ).not.toContain("Ask the person to continue");
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
