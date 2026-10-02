import { expect, test } from "vitest";

import {
  decodeVoiceWords,
  encodeVoiceWords,
  pronunciationInstructions,
} from "./voice-words";

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
