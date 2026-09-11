import { createHash } from "node:crypto";

import { expect, test } from "vitest";

import { lookupWorkpieceLocators } from "../src/update-workpiece";

test("returns literal duplicate and overlapping UTF-16 occurrences without normalization", () => {
  const markdown = "# Same\r\n😀 aaa\r\n# Same\r\n😀 aaa";
  const result = lookupWorkpieceLocators(markdown, [
    "# Same",
    "😀",
    "aa",
    "\r\n",
    "missing",
  ]);
  expect(result.sha256).toBe(
    createHash("sha256").update(markdown).digest("hex"),
  );
  expect(result.utf16Length).toBe(markdown.length);
  expect(result.queries[0]?.occurrences).toEqual([
    { start: 0, end: 6 },
    { start: 16, end: 22 },
  ]);
  expect(result.queries[1]?.occurrences).toEqual([
    { start: 8, end: 10 },
    { start: 24, end: 26 },
  ]);
  expect(result.queries[2]?.occurrences).toEqual([
    { start: 11, end: 13 },
    { start: 12, end: 14 },
    { start: 27, end: 29 },
    { start: 28, end: 30 },
  ]);
  expect(result.queries[3]?.matchedCount).toBe(3);
  expect(result.queries[4]).toMatchObject({
    occurrences: [],
    matchedCount: 0,
    omittedCount: 0,
  });
  expect(
    lookupWorkpieceLocators("e\u0301", ["é"]).queries[0]?.matchedCount,
  ).toBe(0);
});

test("discloses omitted matches instead of implying a unique or complete subset", () => {
  const result = lookupWorkpieceLocators("x".repeat(100), ["x"]);
  expect(result.queries[0]?.occurrences).toHaveLength(32);
  expect(result.queries[0]?.matchedCount).toBe(100);
  expect(result.queries[0]?.omittedCount).toBe(68);
});

test("rejects empty lookup text and bounds candidate, query count and query length", () => {
  expect(() => lookupWorkpieceLocators("# Candidate", [""])).toThrow(
    /length|empty/iu,
  );
  expect(() =>
    lookupWorkpieceLocators(
      "# Candidate",
      Array.from({ length: 17 }, () => "x"),
    ),
  ).toThrow(/length/iu);
  expect(() =>
    lookupWorkpieceLocators("# Candidate", ["x".repeat(4097)]),
  ).toThrow(/length/iu);
  expect(() => lookupWorkpieceLocators("x".repeat(262145), ["x"])).toThrow(
    /ceiling/iu,
  );
});
