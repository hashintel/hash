import {
  Arbitrary,
  Array,
  Effect,
  HashSet,
  Option,
  Predicate,
  Result,
  flow,
  pipe,
} from "effect";
import { describe, expect, test } from "vitest";

import {
  characterClass,
  unicodeScalar,
  xidContinue,
  xidStart,
} from "./character-class.js";
import {
  ExpectedCharacterClass,
  ExpectedEndOfInput,
  ParserError,
} from "./parser-error.js";
import {
  charIn,
  choice,
  eof,
  literal,
  make,
  map,
  takeWhile,
} from "./parser.js";

const identifierPrefix = flow(
  charIn(xidStart),
  takeWhile(xidContinue),
  map(([[, first], rest]) => first + rest),
)(make());
const identifier = eof(identifierPrefix);

describe("character_class", () => {
  test("scalar_membership", () => {
    expect.hasAssertions();
    for (const character of [
      "\0",
      "\n",
      "\r",
      "\u007F",
      "\u0080",
      "a",
      "é",
      "\uD7FF",
      "\uE000",
      "\uFFFF",
      "\u{10000}",
      "😀",
      "\u{10FFFF}",
    ]) {
      expect(unicodeScalar.test(character)).toBe(true);
    }
    for (const input of [
      "",
      "aa",
      "a\n",
      "😀x",
      "\uD800",
      "\uDFFF",
      "\uD800a",
    ]) {
      expect(unicodeScalar.test(input)).toBe(false);
      expect(xidStart.test(input)).toBe(false);
      expect(xidContinue.test(input)).toBe(false);
    }
  });

  test("ascii_membership", () => {
    expect.hasAssertions();
    for (const characters of [
      xidStart,
      xidContinue,
      unicodeScalar,
      characterClass({ name: "hex", pattern: "[A-F0-9]" }),
    ]) {
      const expected = new RegExp(
        `^(?:${characters.pattern})(?![\\s\\S])`,
        "u",
      );
      for (let codePoint = 0; codePoint < 128; codePoint += 1) {
        const character = String.fromCodePoint(codePoint);
        expect(characters.test(character)).toBe(expected.test(character));
      }
    }
  });

  test("unicode_membership", () => {
    expect.hasAssertions();
    const characters = [
      "é",
      "Ω",
      "中",
      "𐐀",
      "℘",
      "\u0301",
      "\u200C",
      "\u200D",
      "😀",
      "\uD7FF",
      "\uE000",
      "\uFFFF",
      "\u{10000}",
      "\u{10FFFF}",
    ];
    for (const character of characters) {
      expect(xidStart.test(character)).toBe(/^\p{XID_Start}$/u.test(character));
      expect(xidContinue.test(character)).toBe(
        /^\p{XID_Continue}$/u.test(character),
      );
    }
    expect(xidStart.test("_")).toBe(false);
    expect(xidContinue.test("_")).toBe(true);
    expect(xidContinue.test("2")).toBe(true);
  });

  test("pattern_scalar_restriction", () => {
    expect.hasAssertions();
    const characters = characterClass({
      name: "mixed",
      pattern: "a|a\\n|😀|ab",
    });
    expect(characters.test("a")).toBe(true);
    expect(characters.test("😀")).toBe(true);
    expect(characters.test("ab")).toBe(false);
    expect(characters.test("a\n")).toBe(false);
    expect(() => characterClass({ name: "invalid", pattern: "[" })).toThrow(
      SyntaxError,
    );
  });

  // oxlint-disable-next-line effecttsgo/async-function -- Vitest owns this callback. Effect.runPromise executes the sampling effect.
  test("class_generation", async () => {
    expect.hasAssertions();
    await Effect.runPromise(
      Effect.gen(function* () {
        for (const characters of [xidStart, xidContinue]) {
          const arbitrary = characters.arbitrary();
          expect(characters.arbitrary()).toBe(arbitrary);
          const examples = yield* Arbitrary.sampleEffect(arbitrary, {
            count: 100,
            size: 4,
            seed: 42,
          });
          for (const example of examples) {
            expect(characters.test(example)).toBe(true);
            expect(Array.fromIterable(example)).toHaveLength(1);
          }
          expect(examples.some((example) => example.length === 2)).toBe(true);
          expect(
            examples.some(
              Predicate.and(
                (example: string) => example.length === 1,
                (example) => /\P{ASCII}/u.test(example),
              ),
            ),
          ).toBe(true);
        }
      }),
    );
  });

  // oxlint-disable-next-line effecttsgo/async-function -- Vitest owns this callback. Effect.runPromise executes the sampling effect.
  test("empty_generation", async () => {
    expect.hasAssertions();
    await Effect.runPromise(
      Effect.gen(function* () {
        const empty = characterClass({ name: "empty", pattern: "a{2}" });
        expect(empty.test("a")).toBe(false);
        expect(empty.test("aa")).toBe(false);
        const result = yield* Effect.result(
          Arbitrary.sampleEffect(empty.arbitrary(), {
            count: 1,
            seed: 42,
            maxDiscards: 3,
          }),
        );
        expect(result).toMatchObject({
          _tag: "Failure",
          failure: { _tag: "SampleError", generated: 0 },
        });
      }),
    );
  });
});

describe("character_class_parser", () => {
  test.each(["hello", "é_2", "中Δ𐐀", "𐐀x", "℘name"])(
    "identifier_%s",
    (input) => {
      expect.hasAssertions();
      expect(identifier.parse(input)).toStrictEqual(
        Result.succeed({ input: "", output: input }),
      );
    },
  );

  test.each([
    { name: "empty", input: "" },
    { name: "underscore_start", input: "_a" },
    { name: "digit_start", input: "2x" },
    { name: "punctuation", input: "a!" },
    { name: "emoji", input: "😀" },
    { name: "isolated_surrogate", input: "\uD800" },
  ])("invalid_identifier_$name", ({ input }) => {
    expect.hasAssertions();
    expect(Result.isFailure(identifier.parse(input))).toBe(true);
  });

  test("prefix_and_empty_run", () => {
    expect.hasAssertions();
    expect(identifierPrefix.parse("é2!")).toStrictEqual(
      Result.succeed({ input: "!", output: "é2" }),
    );
    expect(takeWhile(xidContinue)(make()).parse("!")).toStrictEqual(
      Result.succeed({ input: "!", output: [undefined, ""] }),
    );
    expect(takeWhile(xidContinue)(make()).parse("a\uD800")).toStrictEqual(
      Result.succeed({ input: "\uD800", output: [undefined, "a"] }),
    );
  });

  test("utf16_offset", () => {
    expect.hasAssertions();
    expect(
      pipe(make(), literal("😀"), charIn(xidStart)).parse("😀2"),
    ).toStrictEqual(
      Result.fail(
        ParserError.at(
          2,
          ExpectedCharacterClass({
            name: "XID_Start",
            pattern: "\\p{XID_Start}",
          }),
        ),
      ),
    );
    expect(identifier.parse("𐐀2!")).toStrictEqual(
      Result.fail(ParserError.at(3, ExpectedEndOfInput())),
    );
  });

  test("class_reason_identity", () => {
    expect.hasAssertions();
    const first = characterClass({ name: "letter", pattern: "a" });
    const second = characterClass({ name: "letter", pattern: "b" });
    const parser = choice(
      charIn(first)(make()),
      charIn(second)(make()),
      charIn(first)(make()),
    );
    const failure = Result.getFailure(parser.parse("!"));
    const reasons = Option.getOrThrow(failure).expected;
    expect(HashSet.size(reasons)).toBe(2);
    expect(
      HashSet.has(
        reasons,
        ExpectedCharacterClass({ name: "letter", pattern: "a" }),
      ),
    ).toBe(true);
    expect(
      HashSet.has(
        reasons,
        ExpectedCharacterClass({ name: "letter", pattern: "b" }),
      ),
    ).toBe(true);
  });

  // oxlint-disable-next-line effecttsgo/async-function -- Vitest owns this callback. Effect.runPromise executes the sampling effect.
  test("identifier_generation", async () => {
    expect.hasAssertions();
    await Effect.runPromise(
      Effect.gen(function* () {
        const examples = yield* Arbitrary.sampleEffect(identifier.arbitrary(), {
          count: 100,
          size: 4,
          seed: 42,
        });
        for (const { source, output } of examples) {
          expect(
            /^\p{XID_Start}\p{XID_Continue}*(?![\s\S])/u.test(source),
          ).toBe(true);
          expect(output).toBe(source);
          expect(identifier.parse(source)).toStrictEqual(
            Result.succeed({ input: "", output }),
          );
        }
      }),
    );
  });
});
