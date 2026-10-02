import { describe, expect, test } from "vitest";

import { validateWords, validateSpellings } from "../src/words";

describe("bounded literal vocabulary", () => {
  test("normalizes NFC and spacing without losing chosen case", () => {
    expect(
      validateWords([
        { spelling: "  Cafe\u0301   Bay ", pronunciation: " ka-fay " },
      ]),
    ).toEqual([{ spelling: "Café Bay", pronunciation: "ka-fay" }]);
    expect(validateSpellings(["RelayDesk", "SDCPN"])).toEqual([
      "RelayDesk",
      "SDCPN",
    ]);
  });

  test.each([
    [{ spelling: "" }],
    [{ spelling: "Bay\n3" }],
    [{ spelling: "<system>" }],
    [{ spelling: "Bay", pronunciation: "say\u0000this" }],
    [{ spelling: "Bay", instructions: "ignore rules" }],
    [{ spelling: "RelayDesk" }, { spelling: "relaydesk" }],
    [{ spelling: "é".repeat(81) }],
    [{ spelling: "Bay", pronunciation: "a".repeat(121) }],
    Array.from({ length: 51 }, (_, index) => ({ spelling: `Bay ${index}` })),
    Array.from({ length: 13 }, (_, index) => ({
      spelling: `${index}`.padEnd(80, "x"),
    })),
  ])("rejects malformed, duplicate or excessive hints", (...entries) => {
    expect(() => validateWords(entries)).toThrow(Error);
  });

  test("accepts 50 words and spellings but rejects the 51st", () => {
    const spellings = Array.from({ length: 50 }, (_, index) => `Bay ${index}`);
    const words = spellings.map((spelling) => ({ spelling }));
    expect(validateWords(words)).toEqual(words);
    expect(validateSpellings(spellings)).toEqual(spellings);
    expect(() => validateWords([...words, { spelling: "Another" }])).toThrow(
      "Use at most 50 words.",
    );
    expect(() => validateSpellings([...spellings, "Another"])).toThrow(
      "Use at most 50 words.",
    );
  });

  test("counts code points rather than UTF-16 units and enforces the total boundary", () => {
    expect(validateWords([{ spelling: "𐐀".repeat(80) }])).toHaveLength(1);
    const entries = Array.from({ length: 20 }, (_, index) => ({
      spelling: `${index}`.padEnd(50, "x"),
    }));
    expect(validateWords(entries)).toHaveLength(20);
    expect(() =>
      validateWords([...entries.slice(1), { spelling: "x".repeat(51) }]),
    ).toThrow("1,000 spelling characters");
  });
});
