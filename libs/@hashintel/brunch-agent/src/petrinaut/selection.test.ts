import { expect, test } from "vitest";

import { parseSelection, petrinautSelectionLimits } from "./selection";

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
  expect(
    parseSelection([
      { type: "place", id: "x".repeat(petrinautSelectionLimits.idLength + 1) },
    ]),
  ).toEqual([]);
  expect(
    parseSelection(
      Array.from({ length: petrinautSelectionLimits.count + 1 }, (_, i) => ({
        type: "place",
        id: `place-${i}`,
      })),
    ),
  ).toEqual([]);
});
