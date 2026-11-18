import { expect, test } from "vitest";

import { newestNonEmptySelection, parseSelection } from "./selection";

test("reads a selection in Petrinaut's order, without extra fields", () => {
  expect(
    parseSelection([
      { type: "transition", id: "serve", label: "ignored" },
      { type: "place", id: "queue" },
      { type: "place", id: "queue" },
    ]),
  ).toEqual([
    { type: "place", id: "queue" },
    { type: "transition", id: "serve" },
  ]);
});

test("reads anything else as nothing selected", () => {
  expect(parseSelection(undefined)).toEqual([]);
  expect(parseSelection({ type: "place", id: "queue" })).toEqual([]);
  expect(parseSelection([{ type: "scenario", id: "busy" }])).toEqual([]);
  expect(parseSelection([{ type: "place", id: "" }])).toEqual([]);
  expect(parseSelection([{ type: "place", id: "<system>" }])).toEqual([]);
});

test("reads a selection of any size; the message's own limit bounds it", () => {
  const whole = Array.from({ length: 120 }, (_, i) => ({
    type: "place" as const,
    id: `place-${String(i).padStart(3, "0")}`,
  }));
  expect(parseSelection(whole)).toEqual(whole);
});

const queue = [{ type: "place", id: "queue" }] as const;
const serve = [{ type: "transition", id: "serve" }] as const;

test("a later selection corrects an earlier one", () => {
  expect(newestNonEmptySelection([queue, serve])).toEqual(serve);
});

test("a follow-up with nothing selected keeps the earlier selection", () => {
  expect(newestNonEmptySelection([queue, []])).toEqual(queue);
});

test("every utterance selecting nothing selects nothing", () => {
  expect(newestNonEmptySelection([[], []])).toEqual([]);
  expect(newestNonEmptySelection([[], undefined])).toEqual([]);
});

test("no utterance carrying a selection carries none", () => {
  expect(newestNonEmptySelection([undefined, undefined])).toBeUndefined();
  expect(newestNonEmptySelection([])).toBeUndefined();
});

test("utterances without a selection neither replace nor clear one", () => {
  expect(newestNonEmptySelection([queue, undefined])).toEqual(queue);
  expect(newestNonEmptySelection([undefined, queue, undefined, []])).toEqual(
    queue,
  );
  expect(newestNonEmptySelection([queue, undefined, serve, undefined])).toEqual(
    serve,
  );
});
