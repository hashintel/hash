import { expect, test, vi } from "vitest";

import { LiveSpeechCaptions } from "./live-speech-captions";

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
