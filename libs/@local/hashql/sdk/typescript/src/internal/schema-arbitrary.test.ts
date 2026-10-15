import { Result, Schema, pipe } from "effect";
import { describe, expect, test } from "vitest";

import { exactly } from "./schema-arbitrary.js";

const generatePattern = (): string => "[a-z]+";
const cases = [
  { name: "direct_default", schema: exactly("[a-z]+") },
  { name: "direct_hint", schema: exactly("[a-z]+", generatePattern) },
  { name: "pipe_default", schema: pipe("[a-z]+", exactly()) },
  { name: "pipe_hint", schema: pipe("[a-z]+", exactly(generatePattern)) },
];

describe("exact_pattern", () => {
  test.each(cases)("$name", ({ schema }) => {
    expect.hasAssertions();
    const decode = Schema.decodeResult(schema);
    expect(Result.getOrThrow(decode("letters"))).toBe("letters");
    expect(Result.isFailure(decode("1letters"))).toBe(true);
    expect(Result.isFailure(decode("letters1"))).toBe(true);
    expect(Result.isFailure(decode("letters\n"))).toBe(true);
  });
});
