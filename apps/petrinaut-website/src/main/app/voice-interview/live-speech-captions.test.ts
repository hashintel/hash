import { expect, test, vi } from "vitest";

import { LiveSpeechCaptions } from "./live-speech-captions";

test("anchors autonomous result speech at its injection boundary rather than the previous acknowledgement", () => {
  const caption = vi.fn();
  const captions = new LiveSpeechCaptions(caption);
  captions.input({ startMs: 100, endMs: 200 });
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

test("groups by provider time, preserves repeated words, and never uses append content as captions", () => {
  const caption = vi.fn();
  const captions = new LiveSpeechCaptions(caption);
  captions.speechStarted();
  captions.input({ startMs: 100, endMs: 300 });
  captions.output({ id: "first", startMs: 400, endMs: 500, text: "Yes, " });
  captions.begin("turn");
  captions.output({ id: "second", startMs: 500, endMs: 600, text: "yes." });
  captions.output({ id: "second", startMs: 500, endMs: 600, text: "yes." });
  captions.wrapUp("turn", 900);
  captions.output({
    id: "last",
    startMs: 1000,
    endMs: 1100,
    text: "Draft ready.",
  });
  // Arrives late but belongs before the result's context boundary.
  captions.output({ id: "late", startMs: 650, endMs: 700, text: " Checking." });
  expect(caption).toHaveBeenCalledWith("turn", "reply", {
    text: "Yes, yes. Checking.",
    state: "done",
  });
  expect(caption).toHaveBeenCalledWith("turn", "wrapUp", {
    text: "Draft ready.",
    state: "streaming",
  });
});

test("an interruption closes old groups and delayed fragments do not leak into the next turn", () => {
  const caption = vi.fn();
  const captions = new LiveSpeechCaptions(caption);
  captions.speechStarted();
  captions.input({ startMs: 100, endMs: 200 });
  captions.begin("old");
  captions.output({
    id: "old-reply",
    startMs: 300,
    endMs: 400,
    text: "Checking.",
  });
  captions.speechStarted();
  captions.input({ startMs: 1000, endMs: 1200 });
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
