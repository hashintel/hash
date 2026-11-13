import { expect, test } from "vitest";

import { mergeSelections, parseSelection } from "./selection";

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

test("merges selections into every element any of them named", () => {
  expect(mergeSelections([undefined, undefined])).toBeUndefined();
  expect(
    mergeSelections([
      [{ type: "place", id: "queue" }],
      undefined,
      [
        { type: "transition", id: "serve" },
        { type: "place", id: "queue" },
      ],
    ]),
  ).toEqual([
    { type: "place", id: "queue" },
    { type: "transition", id: "serve" },
  ]);
  expect(mergeSelections([[], undefined])).toEqual([]);
});
