import { expect, test } from "vitest";

import { parseHashSaveInput, parseHashSaveOutcome } from "./save";

test("a save names the open document and nothing else", () => {
  expect(parseHashSaveInput({ documentId: "web~net" })).toEqual({
    documentId: "web~net",
  });
  expect(() => parseHashSaveInput({ documentId: "" })).toThrow(
    /Invalid length/u,
  );
  expect(() =>
    parseHashSaveInput({ documentId: "web~net", title: "Net" }),
  ).toThrow(/Invalid key/u);
});

test.each([
  {
    status: "saved",
    decisionTime: "2026-10-24T01:00:00.000Z",
    title: "Net",
    stillDirty: false,
  },
  { status: "saved", decisionTime: null, title: "Net", stillDirty: true },
  { status: "unconfirmed", error: "Failed to fetch" },
  { status: "not-started", reason: "The user declined this save." },
])("a save settles as $status", (outcome) => {
  expect(parseHashSaveOutcome(outcome)).toEqual(outcome);
});

test.each([
  { applied: false, reason: "An edit's refusal" },
  { saved: false, error: "Failed to fetch" },
  { status: "saved", title: "Net" },
  { status: "not-started" },
  null,
])("a save never settles as %j", (value) => {
  expect(() => parseHashSaveOutcome(value)).toThrow(/Invalid/u);
});
