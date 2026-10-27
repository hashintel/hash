import {
  Arbitrary,
  Array,
  Data,
  Effect,
  Exit,
  HashSet,
  Option,
  Result,
  flow,
  pipe,
} from "effect";
import { describe, expect, expectTypeOf, test } from "vitest";

import {
  ExpectedEndOfInput,
  ExpectedLiteral,
  ExpectedScalar,
  InsufficientLength,
  ParserError,
} from "./parser-error.js";
import {
  and,
  choice,
  eof,
  literal,
  make,
  map,
  nextChar,
  nextSlice,
  nextSliceBetween,
  optional,
  tryMap,
} from "./parser.js";

import type { Reason } from "./parser-error.js";
import type { Parser } from "./parser.js";

/** Consumes one exact spelling and drops the unused seed. */
const text = <const T extends string>(value: T): Parser<T, ExpectedLiteral> =>
  pipe(
    make(),
    literal(value),
    map(([, output]) => output),
  );

/** Samples a reproducible batch for parser contract tests. */
const sample = <T, R extends Reason>(
  parser: Parser<T, R>,
): Effect.Effect<readonly Parser.Sample<T>[], Arbitrary.SampleError> =>
  Arbitrary.sampleEffect(parser.arbitrary(), { count: 30, size: 4, seed: 42 });

/** A semantic reason independent of built-in syntax expectations. */
class NotDigitOne extends Data.TaggedClass("NotDigitOne")<{
  readonly actual: string;
}> {}

/** Models a fallible conversion whose reason retains the rejected value. */
const digitOne = (value: string): Result.Result<number, NotDigitOne> => {
  if (value === "1") {
    return Result.succeed(1);
  }
  return Result.fail(new NotDigitOne({ actual: value }));
};

describe("parser_builder", () => {
  test("seed", () => {
    expect.hasAssertions();
    const seed = { label: "seed" };
    const parser = make(seed);
    const state = Result.getOrThrow(parser.parse("tail"));
    expect(state).toStrictEqual({ input: "tail", output: seed });
    expect(state.output).toBe(seed);
  });

  test("flow_inference", () => {
    expect.hasAssertions();
    const builder = flow(nextChar, nextChar);
    const parser = builder(make({ seed: 42 }));
    expectTypeOf(parser).toEqualTypeOf<
      Parser<
        readonly [readonly [{ seed: number }, string], string],
        ExpectedScalar | InsufficientLength
      >
    >();
    expect(parser.parse("😀étail")).toStrictEqual(
      Result.succeed({
        input: "tail",
        output: [[{ seed: 42 }, "😀"], "é"],
      }),
    );
  });

  test("mapped_flow", () => {
    expect.hasAssertions();
    const parser = flow(
      nextChar,
      nextChar,
      map(([[, first], second]) => first + second),
      eof,
    )(make());
    expectTypeOf(parser).toEqualTypeOf<
      Parser<string, ExpectedScalar | InsufficientLength | ExpectedEndOfInput>
    >();
    expect(parser.parse("😀é")).toStrictEqual(
      Result.succeed({ input: "", output: "😀é" }),
    );
  });

  test.each([
    { name: "ascii", character: "a" },
    { name: "latin", character: "é" },
    { name: "greek", character: "Ω" },
    { name: "han", character: "中" },
    { name: "emoji", character: "😀" },
    { name: "maximum", character: "\u{10FFFF}" },
    { name: "nul", character: "\0" },
  ])("scalar_$name", ({ character }) => {
    expect.hasAssertions();
    expect(nextChar(make()).parse(`${character}!`)).toStrictEqual(
      Result.succeed({
        input: "!",
        output: [undefined, character],
      }),
    );
  });

  test.each([
    { name: "high", input: "\uD800" },
    { name: "low", input: "\uDFFF" },
    { name: "high_before_ascii", input: "\uD800a" },
  ])("isolated_surrogate_$name", ({ input }) => {
    expect.hasAssertions();
    expect(nextChar(make()).parse(input)).toStrictEqual(
      Result.fail(ParserError.at(0, ExpectedScalar())),
    );
  });

  test("character_empty", () => {
    expect.hasAssertions();
    expect(nextChar(make()).parse("")).toStrictEqual(
      Result.fail(
        ParserError.at(0, InsufficientLength({ minimum: 1, actual: 0 })),
      ),
    );
  });

  test("slice_scalar_count", () => {
    expect.hasAssertions();
    expect(nextSlice(2)(make(0)).parse("😀éx")).toStrictEqual(
      Result.succeed({ input: "x", output: [0, "😀é"] }),
    );
    expect(nextSlice(0)(make(0)).parse("😀éx")).toStrictEqual(
      Result.succeed({ input: "😀éx", output: [0, ""] }),
    );
    expect(nextSlice(3)(make(0)).parse("😀é")).toStrictEqual(
      Result.fail(
        ParserError.at(3, InsufficientLength({ minimum: 3, actual: 2 })),
      ),
    );
  });

  test("bounded_slice", () => {
    expect.hasAssertions();
    const parser = nextSliceBetween({ minLength: 1, maxLength: 2 })(make());
    expect(parser.parse("😀éx")).toStrictEqual(
      Result.succeed({ input: "x", output: [undefined, "😀é"] }),
    );
    expect(parser.parse("é")).toStrictEqual(
      Result.succeed({ input: "", output: [undefined, "é"] }),
    );
    expect(parser.parse("a!")).toStrictEqual(
      Result.succeed({ input: "", output: [undefined, "a!"] }),
    );
  });

  test.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, 4_294_967_296])(
    "invalid_length_%s",
    (length) => {
      expect.hasAssertions();
      expect(() => nextSlice(length)).toThrow(RangeError);
    },
  );

  test("inverted_bounds", () => {
    expect.hasAssertions();
    expect(() => nextSliceBetween({ minLength: 2, maxLength: 1 })).toThrow(
      RangeError,
    );
  });

  test("end_of_input", () => {
    expect.hasAssertions();
    expect(eof(make(42)).parse("")).toStrictEqual(
      Result.succeed({ input: "", output: 42 }),
    );
    expect(eof(make(42)).parse("x")).toStrictEqual(
      Result.fail(ParserError.at(0, ExpectedEndOfInput())),
    );
    expect(pipe(make(42), nextChar, eof).parse("😀x")).toStrictEqual(
      Result.fail(ParserError.at(2, ExpectedEndOfInput())),
    );
  });

  test("literal_type", () => {
    expect.hasAssertions();
    const parser = literal("::")(make(42));
    expectTypeOf(parser).toEqualTypeOf<
      Parser<readonly [number, "::"], ExpectedLiteral>
    >();
    expect(parser.parse("::tail")).toStrictEqual(
      Result.succeed({ input: "tail", output: [42, "::"] }),
    );
    expect(parser.parse(":x")).toStrictEqual(
      Result.fail(ParserError.at(1, ExpectedLiteral({ literal: "::" }))),
    );
  });

  test("nested_error_offset", () => {
    expect.hasAssertions();
    const suffix = pipe(make(), literal("ab"), literal("cd"));
    const parser = pipe(make(), literal("😀"), and(suffix));
    expect(parser.parse("😀abcX")).toStrictEqual(
      Result.fail(ParserError.at(5, ExpectedLiteral({ literal: "cd" }))),
    );
  });

  // oxlint-disable-next-line effecttsgo/async-function -- Vitest owns this asynchronous host callback. Effect.runPromise executes the test effects.
  test("map_timing", async () => {
    expect.hasAssertions();
    let calls = 0;
    const parser = pipe(
      text("42"),
      map((value) => {
        calls += 1;
        return Number(value);
      }),
    );
    const arbitrary = parser.arbitrary();
    expect(calls).toBe(0);
    expect(parser.parse("42tail")).toStrictEqual(
      Result.succeed({ input: "tail", output: 42 }),
    );
    expect(calls).toBe(1);
    const examples = await Effect.runPromise(
      Arbitrary.sampleEffect(arbitrary, {
        count: 1,
        seed: 42,
      }),
    );
    expect(examples).toStrictEqual([{ source: "42", output: 42 }]);
    expect(calls).toBe(2);
  });

  test("try_map", () => {
    expect.hasAssertions();
    const parser = pipe(
      make(),
      nextChar,
      tryMap(([, value]) => digitOne(value)),
    );
    expectTypeOf(parser).toEqualTypeOf<
      Parser<number, ExpectedScalar | InsufficientLength | NotDigitOne>
    >();
    expect(parser.parse("1tail")).toStrictEqual(
      Result.succeed({ input: "tail", output: 1 }),
    );
    expect(parser.parse("😀tail")).toStrictEqual(
      Result.fail(ParserError.at(2, new NotDigitOne({ actual: "😀" }))),
    );
  });

  // oxlint-disable-next-line effecttsgo/async-function -- Vitest owns this callback. Effect.runPromiseExit observes the sampling defect.
  test("callback_exception", async () => {
    expect.hasAssertions();
    const defect = new Error("callback defect");
    const parser = map(() => {
      throw defect;
    })(make());
    expect(() => parser.parse("")).toThrow(defect);
    const exit = await Effect.runPromiseExit(
      Arbitrary.sampleEffect(parser.arbitrary(), { count: 1, seed: 42 }),
    );
    expect(pipe(exit, Exit.findDefect, Result.getOrThrow)).toBe(defect);
  });

  test("optional_rollback", () => {
    expect.hasAssertions();
    const parser = pipe(make(), literal("ab"), literal("cd"), optional);
    expect(parser.parse("abcX")).toStrictEqual(
      Result.succeed({ input: "abcX", output: Option.none() }),
    );
    expect(parser.parse("abcd!")).toStrictEqual(
      Result.succeed({
        input: "!",
        output: Option.some([[undefined, "ab"], "cd"]),
      }),
    );
  });

  test("choice_union", () => {
    expect.hasAssertions();
    const parser = choice(
      pipe(
        text("a"),
        map((): 1 => 1),
      ),
      text("b"),
      make(null),
    );
    expectTypeOf(parser).toEqualTypeOf<
      Parser<1 | "b" | null, ExpectedLiteral>
    >();
    expect(parser.parse("a!")).toStrictEqual(
      Result.succeed({ input: "!", output: 1 }),
    );
    expect(parser.parse("b!")).toStrictEqual(
      Result.succeed({ input: "!", output: "b" }),
    );
    expect(parser.parse("c!")).toStrictEqual(
      Result.succeed({ input: "c!", output: null }),
    );
  });

  test("choice_rollback", () => {
    expect.hasAssertions();
    const first = pipe(make(), literal("ab"), literal("cd"));
    const parser = choice(first, text("abcX"));
    expect(parser.parse("abcX!")).toStrictEqual(
      Result.succeed({ input: "!", output: "abcX" }),
    );
  });

  test("choice_furthest", () => {
    expect.hasAssertions();
    const parser = choice(text("abc"), text("abd"), text("z"), text("abc"));
    expect(parser.parse("abX")).toStrictEqual(
      Result.fail(
        new ParserError({
          offset: 2,
          expected: HashSet.make(
            ExpectedLiteral({ literal: "abc" }),
            ExpectedLiteral({ literal: "abd" }),
          ),
        }),
      ),
    );
  });

  test("choice_first_success", () => {
    expect.hasAssertions();
    const parser = eof(choice(text("a"), text("ab")));
    expect(parser.parse("ab")).toStrictEqual(
      Result.fail(ParserError.at(1, ExpectedEndOfInput())),
    );
  });

  // oxlint-disable-next-line effecttsgo/async-function -- Vitest owns this asynchronous host callback. Effect.runPromise executes the test effects.
  test("source_roundtrip", async () => {
    expect.hasAssertions();
    const parser = pipe(
      make({ seed: 1 }),
      nextChar,
      nextSliceBetween({ minLength: 1, maxLength: 4 }),
      eof,
    );
    const examples = await Effect.runPromise(sample(parser));
    expect(examples).toHaveLength(30);
    for (const example of examples) {
      expect(parser.parse(example.source)).toStrictEqual(
        Result.succeed({ input: "", output: example.output }),
      );
      expect(example.output[0][0]).toStrictEqual({ seed: 1 });
      expect(Array.fromIterable(example.output[0][1])).toHaveLength(1);
    }
  });

  // oxlint-disable-next-line effecttsgo/async-function -- Vitest owns this asynchronous host callback. Effect.runPromise executes the test effects.
  test("shadowed_generation", async () => {
    expect.hasAssertions();
    const examples = await Effect.runPromise(
      sample(choice(text("a"), text("ab"))),
    );
    expect(examples).toHaveLength(30);
    expect(examples).toStrictEqual(
      Array.makeBy(30, () => ({ source: "a", output: "a" })),
    );
  });

  // oxlint-disable-next-line effecttsgo/async-function -- Vitest owns this asynchronous host callback. Effect.runPromise executes the test effects.
  test("greedy_generation", async () => {
    expect.hasAssertions();
    const parser = pipe(
      make(),
      nextSliceBetween({ minLength: 1, maxLength: 2 }),
      literal("!"),
      eof,
    );
    expect(Result.isFailure(parser.parse("a!"))).toBe(true);
    const examples = await Effect.runPromise(sample(parser));
    for (const example of examples) {
      expect(Array.fromIterable(example.source)).toHaveLength(3);
      expect(parser.parse(example.source)).toStrictEqual(
        Result.succeed({ input: "", output: example.output }),
      );
    }
  });

  // oxlint-disable-next-line effecttsgo/async-function -- Vitest owns this asynchronous host callback. Effect.runPromise executes the test effects.
  test("optional_generation", async () => {
    expect.hasAssertions();
    const examples = await Effect.runPromise(sample(optional(text("x"))));
    expect(examples).toContainEqual({ source: "", output: Option.none() });
    expect(examples).toContainEqual({
      source: "x",
      output: Option.some("x"),
    });
  });

  // oxlint-disable-next-line effecttsgo/async-function -- Vitest owns this asynchronous host callback. Effect.runPromise executes the test effects.
  test("mapping_exhaustion", async () => {
    expect.hasAssertions();
    const parser = tryMap(() => Result.fail(new NotDigitOne({ actual: "" })))(
      make(),
    );
    const result = await Effect.runPromise(
      Effect.result(
        Arbitrary.sampleEffect(parser.arbitrary(), {
          count: 1,
          seed: 42,
          maxDiscards: 3,
        }),
      ),
    );
    expect(result).toMatchObject({
      _tag: "Failure",
      failure: { _tag: "SampleError", generated: 0 },
    });
  });

  // oxlint-disable-next-line effecttsgo/async-function -- Vitest owns this asynchronous host callback. Effect.runPromise executes the test effects.
  test("shrinking_sources", async () => {
    expect.hasAssertions();
    const parser = pipe(
      make(),
      nextSliceBetween({ minLength: 1, maxLength: 4 }),
      map(([, value]) => value),
    );
    const visited: Parser.Sample<string>[] = [];
    const result = await Effect.runPromise(
      Arbitrary.checkEffect(
        parser.arbitrary(),
        (example) => {
          visited.push(example);
          return false;
        },
        { runs: 1, size: 4, seed: 42, maxShrinks: 30 },
      ),
    );
    expect(result._tag).toBe("Falsified");
    expect(visited.length).toBeGreaterThan(1);
    for (const example of visited) {
      expect(parser.parse(example.source)).toStrictEqual(
        Result.succeed({ input: "", output: example.output }),
      );
      expect(Array.fromIterable(example.source).length).toBeGreaterThanOrEqual(
        1,
      );
    }
  });
});
