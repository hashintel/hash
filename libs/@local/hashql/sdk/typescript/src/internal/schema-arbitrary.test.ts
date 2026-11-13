import { Arbitrary, Effect, Result, Schema, pipe } from "effect";
import { describe, expect, expectTypeOf, test } from "vitest";

import { exactly, sourceText } from "./schema-arbitrary.js";

describe("source_generation", () => {
  test("source_mapping", () => {
    expect.hasAssertions();
    const pair = Schema.Tuple([Schema.Literal("x"), Schema.Literal(3)]);
    const direct = sourceText(pair, (value) => {
      expectTypeOf(value).toEqualTypeOf<readonly ["x", 3]>();
      return value[0].repeat(value[1]);
    });
    const piped = pipe(
      pair,
      sourceText((value) => {
        expectTypeOf(value).toEqualTypeOf<readonly ["x", 3]>();
        return value[0].repeat(value[1]);
      }),
    );
    for (const schema of [direct, piped]) {
      expect(
        Effect.runSync(
          Arbitrary.sampleEffect(Arbitrary.schema(schema), {
            count: 1,
            seed: 42,
          }),
        ),
      ).toStrictEqual(["xxx"]);
    }
  });
});

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
