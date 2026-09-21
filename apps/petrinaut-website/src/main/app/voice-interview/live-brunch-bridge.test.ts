import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { prepareVoiceBrief } from "../../../shared/voice-mediation";
import { LiveBrunchBridge } from "./live-brunch-bridge";
import { VoiceMediationHistory } from "./voice-mediation-history";

import type { UtteranceJudgment } from "../../../shared/live-utterance-judgment";
import type { FlueConversationState } from "@flue/sdk";

beforeEach(() => {
  vi.spyOn(console, "debug").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const setup = (
  mediation: ConstructorParameters<typeof LiveBrunchBridge>[0]["mediation"] = {
    history: new VoiceMediationHistory("test-default"),
    prepare: async () => ({}),
    summarize: async (text) => text.slice(0, 600),
    offered: vi.fn(),
  },
  judge?: ConstructorParameters<typeof LiveBrunchBridge>[0]["judge"],
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
    appendThinking,
    notice,
    speechPending,
    submit,
    judge,
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
    mediation,
    appendCommentary,
    appendInstructions,
    appendThinking,
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
  vi
    .mocked(console.debug)
    .mock.calls.map(
      ([line]) =>
        JSON.parse(
          String(line).replace("[Petrinaut Live trace] ", ""),
        ) as Record<string, unknown>,
    )
    .filter((record) => record.event === "judgment.result");

test("log mode does not wait for judgments or introduce new admission drops", async () => {
  vi.stubEnv("DEV", true);
  const pending = Promise.withResolvers<UtteranceJudgment | null>();
  const judge = vi.fn(() => pending.promise);
  const fixture = setup(undefined, judge);
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
      latencyMs: expect.any(Number),
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
  expect(JSON.stringify(vi.mocked(console.debug).mock.calls)).not.toContain(
    "PRIVATE",
  );
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
    const fixture = setup(undefined, vi.fn(async () => ({ contribution, confidence })));
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
      undefined,
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
    expect(JSON.stringify(vi.mocked(console.debug).mock.calls)).not.toContain(
      "PRIVATE",
    );
  },
);

test("judges only eligible inputs, once per input id", async () => {
  const judge = vi.fn(async () => null);
  const fixture = setup(undefined, judge);
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
    const fixture = setup(undefined, judge);
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
  const fixture = setup(undefined, judge);
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


test("a delayed superseded transcript may be admitted but never offered back as fresh speech", async () => {
  const fixture = setup();
  await fixture.bridge.accept({
    id: "old",
    text: "Old request",
    superseded: true,
    startedDuringOutput: false,
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

test("a correction evicts the stale superseded turn but keeps its own Live delegation", async () => {
  const fixture = setup();
  fixture.submit.mockImplementationOnce(() => new Promise(() => {}));
  void fixture.bridge.accept({
    id: "old",
    text: "Old request",
    superseded: true,
    startedDuringOutput: false,
  });
  await vi.waitFor(() => expect(fixture.submit).toHaveBeenCalledOnce());
  fixture.bridge.acceptDelegation("delegation");
  await fixture.bridge.accept(speech("correction", "Correction"));
  fixture.bridge.responseStarted(started);
  fixture.bridge.responseCompleted({
    ...started,
    position: { batch: 2, index: 0 },
  });
  fixture.update({ segments: [segment()], settlements: completed });

  expect(fixture.submit).toHaveBeenCalledTimes(2);
  await vi.waitFor(() =>
    expect(fixture.appendCommentary).toHaveBeenCalledExactlyOnceWith(
      segment().text,
      "delegation",
    ),
  );
});

test("empty speech does not evict a superseded turn that is still preparing", async () => {
  const brief = Promise.withResolvers<Record<string, string>>();
  const fixture = setup({
    history: new VoiceMediationHistory("test"),
    prepare: () => brief.promise,
    summarize: vi.fn(),
    offered: vi.fn(),
  });
  const stale = fixture.bridge.accept({
    id: "old",
    text: "Old request",
    superseded: true,
    startedDuringOutput: false,
  });
  await fixture.bridge.accept(speech("blip", " . "));
  brief.resolve({});
  await stale;

  expect(fixture.submit).toHaveBeenCalledOnce();
  expect(fixture.submit.mock.calls[0]?.[0].id).toBe("old");
});

test("prepares a brief before admission and summarizes only a settled rendered answer", async () => {
  const history = new VoiceMediationHistory("test");
  const prepare = vi.fn(async () => ({
    decide: "two to eight",
    stillOpen: "runs",
  }));
  const summarize = vi.fn(
    async () => "The comparison is drafted. Run it from the card.",
  );
  const offered = vi.fn();
  const fixture = setup({ history, prepare, summarize, offered });
  await fixture.bridge.accept(speech("one", "Um, compare two to eight"));
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
  await fixture.bridge.accept(speech("one", "Compare two to eight"));
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
    await fixture.bridge.accept({
      id: "follow-up",
      text,
      startedDuringOutput: false,
    });
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
  const turn = fixture.bridge.accept(
    speech("one", "Compare two to eight agents"),
  );
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

test("keeps a dropped utterance's words visible so they can be sent from the composer", async () => {
  const history = new VoiceMediationHistory("test");
  const brief = Promise.withResolvers<Record<string, string>>();
  const fixture = setup({
    history,
    prepare: () => brief.promise,
    summarize: vi.fn(),
    offered: vi.fn(),
  });
  const first = fixture.bridge.accept(speech("first", "Compare staffing"));
  await fixture.bridge.accept(speech("second", "Also check the queue"));

  expect(fixture.notice).toHaveBeenCalledWith(
    expect.stringContaining("not retained"),
  );
  expect(
    history.project([]).find((message) => message.id === "second")?.parts,
  ).toEqual([{ type: "text", text: "Also check the queue" }]);
  expect(history.project([]).map((message) => message.id)).toEqual([
    "first",
    "second",
  ]);
  brief.resolve({});
  await first;
});

test("keeps a dropped utterance's words in the conversation switched to", async () => {
  const brief = Promise.withResolvers<Record<string, string>>();
  const original = new VoiceMediationHistory("original");
  const switched = new VoiceMediationHistory("switched");
  let current = original;
  const fixture = setup({
    get history() {
      return current;
    },
    prepare: () => brief.promise,
    summarize: vi.fn(),
    offered: vi.fn(),
  });
  const first = fixture.bridge.accept(speech("first", "Compare staffing"));
  current = switched;
  const messages = [
    {
      id: "switched-answer",
      role: "assistant" as const,
      parts: [{ type: "text" as const, text: "Earlier answer" }],
    },
  ];
  fixture.update({ messages });
  await fixture.bridge.accept(speech("second", "Also check the queue"));

  expect(switched.project(messages).map((message) => message.id)).toEqual([
    "switched-answer",
    "second",
  ]);
  expect(
    switched.project(messages).find((message) => message.id === "second")
      ?.parts,
  ).toEqual([{ type: "text", text: "Also check the queue" }]);
  brief.resolve({});
  await first;
});

test("keeps words that speech cancels before submission in the conversation switched to", async () => {
  const brief = Promise.withResolvers<Record<string, string>>();
  const original = new VoiceMediationHistory("original");
  const switched = new VoiceMediationHistory("switched");
  let current = original;
  const fixture = setup({
    get history() {
      return current;
    },
    prepare: () => brief.promise,
    summarize: vi.fn(),
    offered: vi.fn(),
  });
  const first = fixture.bridge.accept(speech("first", "Compare staffing"));
  current = switched;
  const messages = [
    {
      id: "switched-answer",
      role: "assistant" as const,
      parts: [{ type: "text" as const, text: "Earlier answer" }],
    },
  ];
  fixture.update({ messages });
  fixture.bridge.speechStarted();
  brief.resolve({});
  await first;

  expect(fixture.submit).not.toHaveBeenCalled();
  expect(original.project([])).toEqual([]);
  expect(switched.project(messages)).toEqual([
    messages[0],
    {
      id: "first",
      role: "user",
      metadata: { source: "voice" },
      parts: [{ type: "text", text: "Compare staffing" }],
    },
  ]);
});

test("drops a superseded transcript quietly when another turn holds the composer", async () => {
  const history = new VoiceMediationHistory("test");
  const brief = Promise.withResolvers<Record<string, string>>();
  const fixture = setup({
    history,
    prepare: () => brief.promise,
    summarize: vi.fn(),
    offered: vi.fn(),
  });
  const current = fixture.bridge.accept(speech("current", "Correction"));
  fixture.notice.mockClear();
  await fixture.bridge.accept({
    id: "stale",
    text: "Old request",
    superseded: true,
    startedDuringOutput: false,
  });

  expect(fixture.notice).not.toHaveBeenCalled();
  expect(history.project([]).map((message) => message.id)).toEqual(["current"]);
  brief.resolve({});
  await current;
});

test("does not admit a turn prepared in a conversation that was switched away from", async () => {
  const brief = Promise.withResolvers<Record<string, string>>();
  const original = new VoiceMediationHistory("original");
  const switched = new VoiceMediationHistory("switched");
  let current = original;
  const fixture = setup({
    get history() {
      return current;
    },
    prepare: () => brief.promise,
    summarize: vi.fn(),
    offered: vi.fn(),
  });
  fixture.bridge.acceptDelegation("delegation");
  const turn = fixture.bridge.accept(
    speech("one", "Compare two to eight agents"),
  );
  current = switched;
  brief.resolve({ decide: "two to eight agents" });
  await turn;

  expect(fixture.submit).not.toHaveBeenCalled();
  expect(original.project([])).toEqual([]);
  expect(switched.project([])).toEqual([
    {
      id: "one",
      role: "user",
      metadata: { source: "voice" },
      parts: [{ type: "text", text: "Compare two to eight agents" }],
    },
  ]);
  expect(fixture.notice).toHaveBeenLastCalledWith(
    expect.stringContaining("the conversation changed"),
  );
  expect(fixture.appendInstructions).toHaveBeenCalledWith(
    expect.stringContaining("not submitted because the conversation changed"),
    "delegation",
  );

  await fixture.bridge.accept(speech("two", "Then check the queue"));
  expect(fixture.submit).toHaveBeenCalledOnce();
});

test("stops waiting on an admitted turn once its conversation is switched away from", async () => {
  const original = new VoiceMediationHistory("original");
  const switched = new VoiceMediationHistory("switched");
  let current = original;
  const fixture = setup({
    get history() {
      return current;
    },
    prepare: async () => ({}),
    summarize: vi.fn(async (text: string) => text),
    offered: vi.fn(),
  });
  fixture.bridge.acceptDelegation("delegation");
  await fixture.bridge.accept(speech("one", "Compare two to eight"));
  current = switched;
  fixture.update({ messages: [] });

  expect(fixture.appendInstructions).toHaveBeenCalledWith(
    expect.stringContaining("answer stays in the original conversation"),
    "delegation",
  );
  fixture.bridge.responseStarted(started);
  fixture.bridge.responseCompleted({
    ...started,
    position: { batch: 2, index: 0 },
  });
  fixture.update({ segments: [segment()], settlements: completed });
  await Promise.resolve();
  expect(fixture.mediation.summarize).not.toHaveBeenCalled();
  expect(fixture.appendCommentary).not.toHaveBeenCalled();
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
  const first = fixture.bridge.accept(speech("one", "First request"));
  fixture.bridge.speechStarted();
  expect(history.project([])).toMatchObject([
    {
      id: "one",
      role: "user",
      parts: [{ type: "text", text: "First request" }],
    },
  ]);
  resolveBrief({ goal: "First request" });
  await first;
  expect(history.project([])).toHaveLength(1);
  expect(fixture.submit).not.toHaveBeenCalled();
  prepare.mockResolvedValue({ goal: "Correction" });
  await fixture.bridge.accept(speech("two", "Correction"));
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

test("speech that cancels unsent words says they were not sent", async () => {
  const brief = Promise.withResolvers<Record<string, string>>();
  const fixture = setup({
    history: new VoiceMediationHistory("test"),
    prepare: () => brief.promise,
    summarize: vi.fn(),
    offered: vi.fn(),
  });
  const first = fixture.bridge.accept(speech("one", "First request"));
  fixture.notice.mockClear();
  fixture.bridge.speechStarted();
  brief.resolve({});
  await first;

  expect(fixture.submit).not.toHaveBeenCalled();
  expect(fixture.notice).toHaveBeenCalledExactlyOnceWith(
    expect.stringContaining("was not sent"),
  );
});

test("speech after a submission leaves the notice alone", async () => {
  const fixture = setup();
  fixture.submit.mockImplementationOnce(() => new Promise(() => {}));
  void fixture.bridge.accept(speech("one", "First request"));
  await vi.waitFor(() => expect(fixture.submit).toHaveBeenCalledOnce());
  fixture.notice.mockClear();
  fixture.bridge.speechStarted();

  expect(fixture.notice).not.toHaveBeenCalled();
});

test("speech during a spoken summary closes that summary's Live delegation", async () => {
  const summary = Promise.withResolvers<string>();
  const fixture = setup({
    history: new VoiceMediationHistory("test"),
    prepare: vi.fn(async () => ({})),
    summarize: () => summary.promise,
    offered: vi.fn(),
  });
  fixture.bridge.acceptDelegation("summary-delegation");
  await fixture.bridge.accept(speech("one", "Compare staffing"));
  fixture.bridge.responseStarted(started);
  fixture.bridge.responseCompleted({
    ...started,
    position: { batch: 2, index: 0 },
  });
  fixture.update({ segments: [segment()], settlements: completed });

  fixture.bridge.speechStarted();
  expect(fixture.appendInstructions).toHaveBeenCalledExactlyOnceWith(
    expect.stringContaining("started speaking again"),
    "summary-delegation",
  );

  summary.resolve("Stale result.");
  await Promise.resolve();
  fixture.bridge.speechStarted();
  expect(fixture.appendCommentary).not.toHaveBeenCalled();
  expect(fixture.appendInstructions).toHaveBeenCalledOnce();
});

test.each([
  ["Stop", "stopped the response before its spoken summary"],
  ["a chat error", "spoken summary was cancelled by a conversation error"],
])(
  "%s during a spoken summary closes that summary's Live delegation",
  async (interruption, instruction) => {
    const summary = Promise.withResolvers<string>();
    const fixture = setup({
      history: new VoiceMediationHistory("test"),
      prepare: vi.fn(async () => ({})),
      summarize: () => summary.promise,
      offered: vi.fn(),
    });
    fixture.bridge.acceptDelegation("summary-delegation");
    await fixture.bridge.accept(speech("one", "Compare staffing"));
    fixture.bridge.responseStarted(started);
    fixture.bridge.responseCompleted({
      ...started,
      position: { batch: 2, index: 0 },
    });
    fixture.update({ segments: [segment()], settlements: completed });

    if (interruption === "Stop") fixture.bridge.stopResponse();
    else
      fixture.update({
        status: "error",
        segments: [segment()],
        settlements: completed,
      });
    expect(fixture.appendInstructions).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining(instruction),
      "summary-delegation",
    );

    summary.resolve("Stale result.");
    await Promise.resolve();
    fixture.bridge.speechStarted();
    expect(fixture.appendCommentary).not.toHaveBeenCalled();
    expect(fixture.appendInstructions).toHaveBeenCalledOnce();
  },
);

test("Stop withdraws words whose brief is still preparing", async () => {
  const history = new VoiceMediationHistory("test");
  const brief = Promise.withResolvers<Record<string, string>>();
  const fixture = setup({
    history,
    prepare: () => brief.promise,
    summarize: vi.fn(),
    offered: vi.fn(),
  });
  const acceptance = fixture.bridge.accept(speech("one", "First request"));

  fixture.bridge.stopResponse();
  brief.resolve({ goal: "First request" });
  await acceptance;

  expect(history.project([])).toEqual([]);
});

test("records failed preparation and submits only the raw utterance", async () => {
  const history = new VoiceMediationHistory("test");
  const fixture = setup({
    history,
    prepare: vi.fn(async () => {
      throw new Error("Mediation unavailable");
    }),
    summarize: vi.fn(),
    offered: vi.fn(),
  });
  await fixture.bridge.accept(speech("one", "Compare two to eight"));

  expect(fixture.submit).toHaveBeenCalledOnce();
  expect(fixture.submit.mock.calls[0]?.[0].text).toBe("Compare two to eight");
  expect(
    history.project([
      { id: "one", role: "user", parts: [{ type: "text", text: "Brief" }] },
    ])[0]?.parts[1],
  ).toEqual({
    type: "data-brief",
    data: { fields: {}, state: "done", preparationFailed: true },
  });
  expect(fixture.notice).not.toHaveBeenCalledWith(expect.any(String));
});

test("does not submit a brief that speech cancelled while it failed", async () => {
  const fixture = setup({
    history: new VoiceMediationHistory("test"),
    prepare: (_transcript, signal) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason));
      }),
    summarize: vi.fn(),
    offered: vi.fn(),
  });
  const first = fixture.bridge.accept(speech("one", "First request"));
  fixture.bridge.speechStarted();
  await first;

  expect(fixture.submit).not.toHaveBeenCalled();
});

test("speech keeps a submitted turn's composer slot until Brunch admits it", async () => {
  const history = new VoiceMediationHistory("test");
  const prepare = vi.fn(async () => ({}));
  const fixture = setup({
    history,
    prepare,
    summarize: vi.fn(),
    offered: vi.fn(),
  });
  fixture.submit.mockImplementationOnce(() => new Promise(() => {}));
  void fixture.bridge.accept(speech("one", "First request"));
  await vi.waitFor(() => expect(fixture.submit).toHaveBeenCalledOnce());

  fixture.bridge.speechStarted();
  await fixture.bridge.accept(speech("two", "Thanks"));

  expect(
    history.project([]).filter((message) => message.id === "one"),
  ).toHaveLength(0);
  expect(prepare).toHaveBeenCalledOnce();
  expect(fixture.submit).toHaveBeenCalledOnce();
  expect(fixture.notice).toHaveBeenLastCalledWith(
    expect.stringContaining("Wait for the pending input"),
  );
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
  await vi.waitFor(() =>
    expect(fixture.appendCommentary).toHaveBeenCalledExactlyOnceWith(
      segment().text,
      null,
    ),
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
  await vi.waitFor(() =>
    expect(fixture.appendCommentary).toHaveBeenCalledExactlyOnceWith(
      segment().text,
      null,
    ),
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
  await vi.waitFor(() =>
    expect(fixture.appendCommentary).toHaveBeenCalledExactlyOnceWith(
      segment().text,
      null,
    ),
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
  await vi.waitFor(() =>
    expect(fixture.appendCommentary).toHaveBeenCalledExactlyOnceWith(
      segment().text,
      null,
    ),
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
  await vi.waitFor(() =>
    expect(fixture.appendCommentary).toHaveBeenCalledExactlyOnceWith(
      segment().text,
      null,
    ),
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
    mediation: fixture.mediation,
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
  await vi.waitFor(() => expect(signal).toBeDefined());
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
    await vi.waitFor(() =>
      expect(fixture.appendCommentary).toHaveBeenCalledTimes(
        outcome === "completed" ? 1 : 0,
      ),
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
  await vi.waitFor(() =>
    expect(fixture.appendCommentary).toHaveBeenCalledExactlyOnceWith(
      segment().text,
      null,
    ),
  );
});

const wrapUp = (fixture: ReturnType<typeof setup>) => {
  fixture.bridge.responseStarted(started);
  fixture.bridge.responseCompleted({
    ...started,
    position: { batch: 2, index: 0 },
  });
  fixture.update({ segments: [segment()], settlements: completed });
};

test("a delegation that arrives just before its speech starts is kept for that speech", async () => {
  const fixture = setup();
  fixture.bridge.acceptDelegation("delegation");
  fixture.bridge.speechStarted();
  await fixture.bridge.accept(speech("one", "Seven reviewers"));
  wrapUp(fixture);

  expect(fixture.appendInstructions).not.toHaveBeenCalled();
  await vi.waitFor(() =>
    expect(fixture.appendCommentary).toHaveBeenCalledExactlyOnceWith(
      segment().text,
      "delegation",
    ),
  );
});

test("speech start closes older unclaimed delegations and keeps the newest", async () => {
  const fixture = setup();
  fixture.bridge.acceptDelegation("older");
  fixture.bridge.acceptDelegation("newer");
  fixture.bridge.speechStarted();

  expect(fixture.appendInstructions).toHaveBeenCalledExactlyOnceWith(
    expect.stringContaining("No request admission was confirmed"),
    "older",
  );
  await fixture.bridge.accept(speech("one", "Seven reviewers"));
  wrapUp(fixture);
  await vi.waitFor(() =>
    expect(fixture.appendCommentary).toHaveBeenCalledExactlyOnceWith(
      segment().text,
      "newer",
    ),
  );
});

test.each(["speech", "stop"] as const)(
  "%s drops a submitted turn and closes its delegation only while the session runs",
  async (cause) => {
    const fixture = setup();
    await fixture.bridge.accept(speech("one", "Seven reviewers"));
    fixture.bridge.acceptDelegation("delegation");
    if (cause === "speech") fixture.bridge.speechStarted();
    else fixture.bridge.stop();
    wrapUp(fixture);

    expect(fixture.appendCommentary).not.toHaveBeenCalled();
    if (cause === "speech")
      expect(fixture.appendInstructions).toHaveBeenCalledExactlyOnceWith(
        expect.stringContaining("started speaking again"),
        "delegation",
      );
    else expect(fixture.appendInstructions).not.toHaveBeenCalled();
  },
);

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
  expect(fixture.submit.mock.calls[0]?.[0].id).toBe("quiet");
  expect(fixture.submit.mock.calls[0]?.[0].text).toContain(
    '"utterance":"Yes."',
  );
  expect(fixture.submit.mock.calls[1]?.[0].id).toBe("correction");
  expect(fixture.submit.mock.calls[1]?.[0].text).toContain(
    '"utterance":"Seven reviewers, not four."',
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
    { inputId: "echo", reason: "echo" },
    { inputId: "short-echo", reason: "echo" },
    { inputId: "short-echo", reason: "doubtful-short-during-output" },
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
  await vi.waitFor(() => expect(fixture.submit).toHaveBeenCalledOnce());
  fixture.update({ status: "streaming", canAcceptVoiceInput: true });
  const correction = fixture.bridge.accept(speech("two", "Seven, not four"));
  await vi.waitFor(() => expect(fixture.submit).toHaveBeenCalledTimes(2));

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
    await vi.waitFor(() =>
      expect(fixture.appendCommentary.mock.calls).toEqual(
        outcome === "completed" ? [[segment().text, null]] : [],
      ),
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
  await vi.waitFor(() =>
    expect(fixture.appendCommentary).toHaveBeenCalledExactlyOnceWith(
      segment().text,
      "first-delegation",
    ),
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
    await vi.waitFor(() =>
      expect(fixture.appendCommentary.mock.calls).toEqual(
        mode === "deliver" ? [[prose.text, null]] : [],
      ),
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
    expect.stringContaining("finished without a spoken answer"),
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

test.each(["button", "snapshot", "aborted"] as const)(
  "%s preserves interrupted partial-answer context and resumes only through one new admission",
  async (stopKind) => {
    const fixture = setup();
    fixture.bridge.acceptDelegation("original-delegation");
    await fixture.bridge.accept(
      speech("original", "Build a supply chain with defaults"),
    );
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
    await fixture.bridge.accept(speech("resume-input", "Continue"));
    await fixture.bridge.accept(speech("resume-input", "Continue"));
    expect(fixture.submit).toHaveBeenCalledTimes(2);
    expect(fixture.submit.mock.calls[1]?.[0].text).toContain(
      JSON.stringify({ utterance: "Continue", excerpts: {} }),
    );
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
    await vi.waitFor(() =>
      expect(fixture.appendCommentary).toHaveBeenCalledExactlyOnceWith(
        result.text,
        "resume-delegation",
      ),
    );
  },
);

test("clips interrupted request and answer context to one Live append", async () => {
  const fixture = setup();
  const request = `request-start ${"request ".repeat(800)}request-end`;
  const partial = `answer-start ${"answer ".repeat(800)}answer-end`;
  await fixture.bridge.accept({
    id: "original",
    text: request,
    startedDuringOutput: false,
  });
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
  await fixture.bridge.accept(speech("one", "First"));
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
  await vi.waitFor(() =>
    expect(fixture.appendCommentary).toHaveBeenCalledExactlyOnceWith(
      "Continue with the next question.",
      null,
    ),
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
  await vi.waitFor(() =>
    expect(fixture.appendCommentary).toHaveBeenCalledExactlyOnceWith(
      segment().text,
      null,
    ),
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
  await vi.waitFor(() => expect(fixture.submit).toHaveBeenCalledOnce());
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
  await fixture.bridge.accept(speech("one", "First"));
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
  const recovery = fixture.bridge.accept(speech("two", "Try again"));
  await vi.waitFor(() => expect(fixture.submit).toHaveBeenCalledTimes(2));
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
  await vi.waitFor(() =>
    expect(fixture.appendCommentary).toHaveBeenCalledExactlyOnceWith(
      "Recovery answer",
      "recovery-delegation",
    ),
  );
  expect(fixture.submit).toHaveBeenCalledTimes(2);

  fixture.bridge.acceptDelegation("next");
  await fixture.bridge.accept(speech("three", "Next question"));
  fixture.update({ status: "error" });
  expect(fixture.appendInstructions).toHaveBeenCalledExactlyOnceWith(
    expect.stringContaining(
      "request was admitted, but its response could not be confirmed",
    ),
    "next",
  );
});

test("a long answer is mediated instead of falling back to full prose", async () => {
  const summary = "Seven, not four.";
  const fixture = setup({
    history: new VoiceMediationHistory("test"),
    prepare: async () => ({}),
    summarize: async () => summary,
    offered: vi.fn(),
  });
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
  await vi.waitFor(() =>
    expect(fixture.appendCommentary).toHaveBeenCalledExactlyOnceWith(
      summary,
      "long-answer",
    ),
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
    await vi.waitFor(() =>
      expect(fixture.appendCommentary.mock.calls).toEqual([
        [segment().text, timing === "before" ? "newer" : "older"],
        ["Approval is optional.", timing === "before" ? "older" : "newer"],
      ]),
    );
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
  await fixture.bridge.accept(speech("one", "First"));
  fixture.update({ status: "streaming" });
  fixture.update({ settlements: completed, canAcceptVoiceInput: false });
  await fixture.bridge.accept(speech("two", "Dropped"));
  expect(fixture.appendInstructions).not.toHaveBeenCalled();
  expect(fixture.appendCommentary).not.toHaveBeenCalled();
});
