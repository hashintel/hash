import { expect, test, vi } from "vitest";

import { LiveBrunchBridge } from "./live-brunch-bridge";

import type { FlueConversationState } from "@flue/sdk";

const setup = () => {
  const appendCommentary = vi.fn(() => true);
  const notice = vi.fn();
  const submit = vi.fn(async (input: { onAdmission: (id: string) => void }) => {
    input.onAdmission("root");
    return {
      kind: "message" as const,
      messageId: "user",
      submissionId: "root",
    };
  });
  const bridge = new LiveBrunchBridge({ appendCommentary, notice, submit });
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
  return { bridge, appendCommentary, notice, submit, update };
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
  );
});

test("Stop aborts pending admission and its late resolution cannot produce commentary or a new notice", async () => {
  const fixture = setup();
  let release = () => {};
  let signal: AbortSignal | undefined;
  const bridge = new LiveBrunchBridge({
    appendCommentary: fixture.appendCommentary,
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
      outcome === "completed" ? [[segment().text]] : [],
    );
  },
);

test("two inputs answered by one submission offer its canonical prose only once", async () => {
  const fixture = setup();
  await fixture.bridge.accept({ id: "one", text: "First question" });
  fixture.submit.mockImplementationOnce(async (input) => {
    input.onAdmission("second");
    return { kind: "message", messageId: "two", submissionId: "second" };
  });
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
      mode === "deliver" ? [[prose.text]] : [],
    );
  },
);

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

test("an oversized or unaccepted commentary remains on screen without truncation or replay", async () => {
  const fixture = setup();
  fixture.appendCommentary.mockReturnValue(false);
  await fixture.bridge.accept({ id: "one", text: "First" });
  fixture.bridge.responseStarted(started);
  fixture.bridge.responseCompleted({
    ...started,
    position: { batch: 2, index: 0 },
  });
  fixture.update({ status: "streaming" });
  fixture.update({ segments: [segment()], settlements: completed });
  fixture.update({ segments: [segment()], settlements: completed });
  expect(fixture.appendCommentary).toHaveBeenCalledOnce();
  expect(fixture.notice).toHaveBeenLastCalledWith(
    expect.stringContaining("Read the full answer"),
  );
});
