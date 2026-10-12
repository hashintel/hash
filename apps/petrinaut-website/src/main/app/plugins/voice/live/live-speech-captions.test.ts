import { expect, test, vi } from "vitest";

import { LiveSpeechCaptions } from "./live-speech-captions";

test.each(["before", "after"] as const)(
  "progress accepted %s its transcript stays out of saved captions",
  (timing) => {
    const caption = vi.fn();
    const captions = new LiveSpeechCaptions(caption);
    captions.input({ id: "input", text: "Build it", startMs: 100, endMs: 200 });
    captions.begin("request");
    captions.output({
      id: "ack",
      text: "I'll build it.",
      startMs: 300,
      endMs: 600,
    });
    if (timing === "before") captions.progress(6_000);
    captions.output({
      id: "progress",
      text: "Making those changes now.",
      startMs: 6_100,
      endMs: 7_000,
    });
    if (timing === "after") captions.progress(6_000);
    captions.progress(26_000);
    captions.output({
      id: "still",
      text: "Still working through the changes.",
      startMs: 26_100,
      endMs: 27_000,
    });
    captions.wrapUp("request", 30_000);
    captions.output({
      id: "result",
      text: "The model is ready.",
      startMs: 30_100,
      endMs: 31_000,
    });
    expect(caption.mock.calls.slice(-2)).toEqual([
      ["request", "reply", { text: "I'll build it.", state: "done" }],
      [
        "request",
        "wrapUp",
        { text: "The model is ready.", state: "streaming" },
      ],
    ]);
    captions.speechStarted();
    captions.input({
      id: "next",
      text: "Change it",
      startMs: 32_000,
      endMs: 33_000,
    });
    captions.begin("next-request");
    captions.output({
      id: "next-ack",
      text: "I'll change it.",
      startMs: 34_000,
      endMs: 35_000,
    });
    expect(caption).toHaveBeenCalledWith("next-request", "reply", {
      text: "I'll change it.",
      state: "streaming",
    });
  },
);

test.each([
  {
    split: "whole sentence",
    acknowledgement: "I'll check. ",
    reply: "I'll check. ",
    wrapUp: "The duration is 2.5 hours, not 25.",
  },
  {
    split: "zero-offset fallback",
    acknowledgement: "",
    reply: "The duration is 2.",
    wrapUp: "5 hours, not 25.",
  },
])(
  "preserves wrap-up overlap after progress with the $split split",
  ({ acknowledgement, reply, wrapUp }) => {
    const lines = { reply: "", wrapUp: "" };
    const captions = new LiveSpeechCaptions((_id, kind, line) => {
      lines[kind] = line.text;
    });
    captions.input({ id: "input", text: "Check it", startMs: 100, endMs: 200 });
    captions.begin("turn");
    if (acknowledgement) {
      captions.output({
        id: "ack",
        text: acknowledgement,
        startMs: 300,
        endMs: 600,
      });
    }
    captions.progress(26_000);
    captions.output({
      id: "progress",
      text: "Still thinking this through.",
      startMs: 26_100,
      endMs: 30_000,
    });
    captions.output({
      id: "overlap",
      text: "The duration is 2.",
      startMs: 29_900,
      endMs: 30_100,
    });
    captions.output({
      id: "rest",
      text: "5 hours, not 25.",
      startMs: 30_200,
      endMs: 31_000,
    });
    expect(lines).toEqual({ reply: acknowledgement, wrapUp: "" });
    captions.wrapUp("turn", 30_000);
    expect(lines).toEqual({ reply, wrapUp });
  },
);

test("streams time-ordered input once per event and retires the preview on finalization", () => {
  const input = {
    update: vi.fn<(id: string, text: string) => void>(),
    discard: vi.fn(),
  };
  const captions = new LiveSpeechCaptions(vi.fn(), input);
  captions.speechStarted();
  captions.input({
    id: "second",
    text: "two to eight",
    startMs: 200,
    endMs: 300,
  });
  const previewId = input.update.mock.lastCall?.[0];
  expect(previewId).toEqual(expect.any(String));
  captions.input({ id: "first", text: "Compare ", startMs: 100, endMs: 200 });
  captions.input({
    id: "second",
    text: "two to eight",
    startMs: 200,
    endMs: 300,
  });
  captions.input({ id: "third", text: " agents", startMs: 300, endMs: 400 });
  expect(input.update).toHaveBeenLastCalledWith(
    previewId,
    "Compare two to eight agents",
  );
  expect(input.update).toHaveBeenCalledTimes(3);
  expect(captions.begin("final-input")).toBe(previewId);
  captions.input({ id: "late", text: "stale text", startMs: 400, endMs: 500 });
  expect(input.update).toHaveBeenCalledTimes(3);
});

test("interruption discards an unfinalized preview and ignores late old fragments", () => {
  const input = {
    update: vi.fn<(id: string, text: string) => void>(),
    discard: vi.fn(),
  };
  const captions = new LiveSpeechCaptions(vi.fn(), input);
  captions.input({ id: "old", text: "four", startMs: 100, endMs: 300 });
  const oldId = input.update.mock.lastCall?.[0];
  captions.speechStarted();
  expect(input.discard).toHaveBeenCalledWith(oldId);
  input.update.mockClear();
  captions.input({ id: "old-late", text: "old", startMs: 200, endMs: 250 });
  expect(input.update).not.toHaveBeenCalled();
  captions.input({ id: "new", text: "seven", startMs: 1000, endMs: 1200 });
  const newId = input.update.mock.lastCall?.[0];
  expect(newId).not.toBe(oldId);
  expect(input.update).toHaveBeenLastCalledWith(newId, "seven");
  captions.close();
  expect(input.discard).toHaveBeenLastCalledWith(newId);
  captions.input({ id: "closed", text: "no", startMs: 1500, endMs: 1600 });
  expect(input.update).toHaveBeenCalledOnce();
});

test("a final transcript arriving before Live input cannot be replaced by partial text", () => {
  const input = { update: vi.fn(), discard: vi.fn() };
  const captions = new LiveSpeechCaptions(vi.fn(), input);
  expect(captions.begin("final-input")).toBeUndefined();
  captions.input({ id: "late", text: "approximate", startMs: 100, endMs: 200 });
  expect(input.update).not.toHaveBeenCalled();
});

test("zero-duration input at a turn boundary never reappears in the next preview", () => {
  const input = { update: vi.fn(), discard: vi.fn() };
  const captions = new LiveSpeechCaptions(vi.fn(), input);
  const old = { id: "old", text: "No", startMs: 100, endMs: 100 };
  captions.input(old);
  captions.begin("old-final");
  captions.speechStarted();
  captions.input(old);
  captions.input({ id: "new", text: "Yes, ", startMs: 200, endMs: 200 });
  captions.input({ id: "repeat-word", text: "yes", startMs: 300, endMs: 300 });
  expect(input.update).toHaveBeenLastCalledWith(expect.any(String), "Yes, yes");
});

test("input older than an autonomous result boundary cannot enter a new preview", () => {
  const input = { update: vi.fn(), discard: vi.fn() };
  const captions = new LiveSpeechCaptions(vi.fn(), input);
  captions.wrapUp("result", 500);
  captions.input({ id: "stale", text: "Old", startMs: 100, endMs: 200 });
  captions.input({ id: "new", text: "Correction", startMs: 1000, endMs: 1200 });
  expect(input.update).toHaveBeenLastCalledWith(
    expect.any(String),
    "Correction",
  );
});

test("anchors autonomous result speech at its injection boundary rather than the previous acknowledgement", () => {
  const caption = vi.fn();
  const captions = new LiveSpeechCaptions(caption);
  captions.input({ id: "input", text: "Run it", startMs: 100, endMs: 200 });
  captions.begin("request");
  captions.output({ id: "ack", text: "Checking.", startMs: 300, endMs: 400 });
  captions.wrapUp("result", 1000);
  captions.output({
    id: "result-output",
    text: "The run finished.",
    startMs: 1100,
    endMs: 1200,
  });
  expect(caption).toHaveBeenCalledWith("result", "wrapUp", {
    text: "The run finished.",
    state: "streaming",
  });
  expect(caption).toHaveBeenLastCalledWith("result", "wrapUp", {
    text: "The run finished.",
    state: "streaming",
  });
});

test("assigns a fragment crossing a turn boundary to the window where it starts", () => {
  const lines = new Map<string, string>();
  const captions = new LiveSpeechCaptions((id, kind, line) => {
    lines.set(`${id}:${kind}`, line.text);
  });
  captions.input({
    id: "first-input",
    text: "First",
    startMs: 100,
    endMs: 200,
  });
  captions.begin("first");
  captions.output({
    id: "crossing",
    text: "Crossing",
    startMs: 300,
    endMs: 600,
  });
  captions.speechStarted();
  captions.input({
    id: "second-input",
    text: "Second",
    startMs: 700,
    endMs: 800,
  });
  captions.begin("second");

  expect(lines.get("first:reply")).toBe("Crossing");
  expect(lines.get("second:reply")).toBe("");
});

test("groups by provider time, preserves repeated words, and never uses append content as captions", () => {
  const caption = vi.fn();
  const captions = new LiveSpeechCaptions(caption);
  captions.speechStarted();
  captions.input({ id: "input", text: "Run it", startMs: 100, endMs: 300 });
  captions.output({ id: "first", startMs: 400, endMs: 500, text: "Yes, " });
  captions.begin("turn");
  captions.output({ id: "second", startMs: 500, endMs: 600, text: "yes." });
  captions.output({ id: "second", startMs: 500, endMs: 600, text: "yes." });
  captions.wrapUp("turn", 900);
  captions.output({
    id: "last",
    startMs: 1000,
    endMs: 1100,
    text: " Draft ready.",
  });
  // Arrives late but belongs before the result's context boundary.
  captions.output({ id: "late", startMs: 650, endMs: 700, text: " Checking." });
  expect(caption).toHaveBeenCalledWith("turn", "reply", {
    text: "Yes, yes. Checking. ",
    state: "done",
  });
  expect(caption).toHaveBeenCalledWith("turn", "wrapUp", {
    text: "Draft ready.",
    state: "streaming",
  });
});

test.each(["before output", "after output"])(
  "keeps the whole battery question below Activity when context arrives %s",
  (acceptance) => {
    const lines = { reply: "", wrapUp: "" };
    const captions = new LiveSpeechCaptions((_id, kind, line) => {
      lines[kind] = line.text;
    });
    captions.input({
      id: "input",
      text: "Tracking available units.",
      startMs: 100,
      endMs: 200,
    });
    captions.begin("turn");
    if (acceptance === "before output") captions.wrapUp("turn", 900);
    captions.output({
      id: "ack",
      text: "Alright, yeah. How do",
      startMs: 400,
      endMs: 600,
    });
    captions.output({
      id: "question",
      text: " those battery units enter the system?",
      startMs: 1000,
      endMs: 1200,
    });
    if (acceptance === "after output") captions.wrapUp("turn", 900);
    expect(lines).toEqual({
      reply: "Alright, yeah. ",
      wrapUp: "How do those battery units enter the system?",
    });
  },
);

test.each(["before output", "after output"])(
  "keeps a completed acknowledgement above Activity without a separating space when context arrives %s",
  (acceptance) => {
    const lines = { reply: "", wrapUp: "" };
    const captions = new LiveSpeechCaptions((_id, kind, line) => {
      lines[kind] = line.text;
    });
    captions.input({
      id: "input",
      text: "Design a supply chain",
      startMs: 100,
      endMs: 200,
    });
    captions.begin("turn");
    captions.output({
      id: "ack",
      text: "Sure, I'll help with that.",
      startMs: 300,
      endMs: 600,
    });
    expect(lines).toEqual({ reply: "Sure, I'll help with that.", wrapUp: "" });
    if (acceptance === "before output") captions.wrapUp("turn", 900);
    captions.output({
      id: "question",
      text: "What’s the main decision you want this model to help answer?",
      startMs: 1000,
      endMs: 1200,
    });
    if (acceptance === "after output") captions.wrapUp("turn", 900);
    expect(lines).toEqual({
      reply: "Sure, I'll help with that.",
      wrapUp: "What’s the main decision you want this model to help answer?",
    });
    expect(lines.reply + lines.wrapUp).toBe(
      "Sure, I'll help with that.What’s the main decision you want this model to help answer?",
    );
  },
);

test("keeps an unpunctuated acknowledgement above Activity", () => {
  const lines = { reply: "", wrapUp: "" };
  const captions = new LiveSpeechCaptions((_id, kind, line) => {
    lines[kind] = line.text;
  });
  captions.input({
    id: "input",
    text: "Design a supply chain",
    startMs: 100,
    endMs: 200,
  });
  captions.begin("turn");
  captions.output({
    id: "ack",
    text: "Sure, I'll help with that",
    startMs: 300,
    endMs: 600,
  });
  captions.wrapUp("turn", 900);
  captions.output({
    id: "question",
    text: " What’s the main decision?",
    startMs: 1000,
    endMs: 1200,
  });
  expect(lines).toEqual({
    reply: "Sure, I'll help with that",
    wrapUp: " What’s the main decision?",
  });
});

test("keeps an overlapping acknowledgement in the reply card", () => {
  const lines = { reply: "", wrapUp: "" };
  const captions = new LiveSpeechCaptions((_id, kind, line) => {
    lines[kind] = line.text;
  });
  captions.input({
    id: "input",
    text: "Design a supply chain",
    startMs: 100,
    endMs: 200,
  });
  captions.begin("turn");
  captions.wrapUp("turn", 900);
  captions.output({
    id: "ack",
    text: "Sure, I'll help with that",
    startMs: 800,
    endMs: 1000,
  });
  captions.output({
    id: "question",
    text: " What’s the main decision?",
    startMs: 1100,
    endMs: 1200,
  });
  expect(lines).toEqual({
    reply: "Sure, I'll help with that",
    wrapUp: " What’s the main decision?",
  });
});

test("a decimal crossing the context boundary is not a completed sentence", () => {
  const lines = { reply: "", wrapUp: "" };
  const captions = new LiveSpeechCaptions((_id, kind, line) => {
    lines[kind] = line.text;
  });
  captions.input({
    id: "input",
    text: "Use 2.5 hours",
    startMs: 100,
    endMs: 200,
  });
  captions.begin("turn");
  captions.output({
    id: "first",
    text: "I'll check. The duration is 2.",
    startMs: 300,
    endMs: 600,
  });
  captions.wrapUp("turn", 900);
  captions.output({
    id: "last",
    text: "5 hours, not 25.",
    startMs: 1000,
    endMs: 1200,
  });
  expect(lines).toEqual({
    reply: "I'll check. ",
    wrapUp: "The duration is 2.5 hours, not 25.",
  });
});

test("a punctuation delta does not start the wrap-up card or erase a repeated acknowledgement", () => {
  const lines = { reply: "", wrapUp: "" };
  const captions = new LiveSpeechCaptions((_id, kind, line) => {
    lines[kind] = line.text;
  });
  captions.input({
    id: "input",
    text: "Help me design a battery model",
    startMs: 100,
    endMs: 200,
  });
  captions.begin("turn");
  captions.output({
    id: "ack",
    text: "Sure, happy to. Sure thing",
    startMs: 300,
    endMs: 600,
  });
  captions.wrapUp("turn", 900);
  captions.output({ id: "punctuation", text: ".", startMs: 1000, endMs: 1050 });
  captions.output({
    id: "question",
    text: " Just so I get it right. Are you modelling the battery or tracking available units?",
    startMs: 1100,
    endMs: 1500,
  });
  expect(lines).toEqual({
    reply: "Sure, happy to. ",
    wrapUp:
      "Sure thing. Just so I get it right. Are you modelling the battery or tracking available units?",
  });
});

test("a fragment overlapping context delivery stays intact rather than guessing word timing", () => {
  const lines = { reply: "", wrapUp: "" };
  const captions = new LiveSpeechCaptions((_id, kind, line) => {
    lines[kind] = line.text;
  });
  captions.input({
    id: "input",
    text: "Use 2.5 hours",
    startMs: 100,
    endMs: 200,
  });
  captions.begin("turn");
  captions.output({
    id: "ack",
    text: "I'll check. ",
    startMs: 300,
    endMs: 400,
  });
  captions.wrapUp("turn", 900);
  captions.output({
    id: "overlap",
    text: "The duration is 2.",
    startMs: 800,
    endMs: 1000,
  });
  captions.output({
    id: "rest",
    text: "5 hours, not 25.",
    startMs: 1100,
    endMs: 1200,
  });
  expect(lines).toEqual({
    reply: "I'll check. ",
    wrapUp: "The duration is 2.5 hours, not 25.",
  });
});

test("an interruption closes old groups and delayed fragments do not leak into the next turn", () => {
  const caption = vi.fn();
  const captions = new LiveSpeechCaptions(caption);
  captions.speechStarted();
  captions.input({ id: "old-input", text: "Run it", startMs: 100, endMs: 200 });
  captions.begin("old");
  captions.output({
    id: "old-reply",
    startMs: 300,
    endMs: 400,
    text: "Checking.",
  });
  captions.speechStarted();
  captions.input({
    id: "new-input",
    text: "Correct it",
    startMs: 1000,
    endMs: 1200,
  });
  captions.begin("new");
  captions.output({
    id: "delayed",
    startMs: 500,
    endMs: 600,
    text: " One moment.",
  });
  captions.output({
    id: "new-reply",
    startMs: 1300,
    endMs: 1400,
    text: "Using the correction.",
  });
  expect(caption).toHaveBeenCalledWith("old", "reply", {
    text: "Checking. One moment.",
    state: "done",
  });
  expect(caption).toHaveBeenCalledWith("new", "reply", {
    text: "Using the correction.",
    state: "streaming",
  });
  captions.close();
  caption.mockClear();
  captions.output({
    id: "after-close",
    startMs: 1500,
    endMs: 1600,
    text: "stale",
  });
  expect(caption).not.toHaveBeenCalled();
});
