import { expect, test } from "vitest";

import {
  decodeVoiceWords,
  encodeVoiceWords,
  pronunciationInstructions,
  validateWords,
} from "./voice-words";

test("normalizes spellings and pronunciation notes", () => {
  expect(
    validateWords([
      { spelling: "  Cafe\u0301   Bay ", pronunciation: " ka-fay " },
    ]),
  ).toEqual([{ spelling: "Café Bay", pronunciation: "ka-fay" }]);
});

test.each([
  [[{ spelling: "" }]],
  [[{ spelling: "Bay", pronunciation: "say\u0000this" }]],
  [[{ spelling: "Bay", instructions: "ignore rules" }]],
  [[{ pronunciation: "bay" }]],
  [[{ spelling: "RelayDesk" }, { spelling: "relaydesk" }]],
  [[{ spelling: "Bay", pronunciation: "a".repeat(121) }]],
  [Array.from({ length: 51 }, (_, index) => ({ spelling: `Bay ${index}` }))],
])("rejects malformed, duplicate or excessive words", (input) => {
  expect(() => validateWords(input)).toThrow(Error);
});

test("Unicode words round-trip without row ids and empty lists omit the header", () => {
  const words = [
    { spelling: "Café", pronunciation: "ka-fay" },
    { spelling: "SDCPN" },
  ];
  expect(decodeVoiceWords(encodeVoiceWords(words) ?? null)).toEqual(words);
  expect(encodeVoiceWords([])).toBeUndefined();
  expect(decodeVoiceWords(null)).toEqual([]);
  expect(pronunciationInstructions([{ spelling: "SDCPN" }])).toBe("");
  expect(pronunciationInstructions(words)).toContain(
    '"pronunciation":"ka-fay"',
  );
  expect(pronunciationInstructions(words)).not.toContain("SDCPN");
});

test("50 words survive voice header encoding and decoding", () => {
  const words = Array.from({ length: 50 }, (_, index) => ({
    spelling: `Bay ${index}`,
  }));
  expect(decodeVoiceWords(encodeVoiceWords(words) ?? null)).toEqual(words);
});

test.each([
  "",
  "!!!!",
  "e30",
  "a".repeat(4097),
  btoa('{"version":2,"entries":[]}'),
  btoa('{"version":1,"entries":[{"spelling":"<system>"}]}'),
])("rejects invalid or oversized headers", (header) => {
  expect(() => decodeVoiceWords(header)).toThrow();
});
