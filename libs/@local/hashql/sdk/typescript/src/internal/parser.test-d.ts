import { Array, Data, Option, Result, flow, pipe } from "effect";
import { describe, expectTypeOf, test } from "vitest";

import { xidContinue, xidStart } from "./character-class.js";
import {
  and,
  charIn,
  choice,
  eof,
  literal,
  make,
  map,
  nextChar,
  optional,
  takeWhile,
  tryMap,
} from "./parser.js";

import type {
  ExpectedCharacterClass,
  ExpectedEndOfInput,
  ExpectedLiteral,
  ExpectedScalar,
  InsufficientLength,
  ParserError,
} from "./parser-error.js";
import type { Parser } from "./parser.js";
import type { HashSet } from "effect";

/** A semantic failure whose payload must survive builder inference. */
class NotNumber extends Data.TaggedClass("NotNumber")<{
  readonly text: string;
}> {}

/** Models a finite-number conversion with a distinct failure type. */
const number = (text: string): Result.Result<number, NotNumber> =>
  pipe(
    Number(text),
    Result.liftPredicate(Number.isFinite, () => new NotNumber({ text })),
  );

describe("parser_types", () => {
  test("generic_builder", () => {
    const builder = flow(nextChar, nextChar);
    expectTypeOf(builder(make("seed"))).toEqualTypeOf<
      Parser<
        readonly [readonly [string, string], string],
        ExpectedScalar | InsufficientLength
      >
    >();
    expectTypeOf(builder(make(42))).toEqualTypeOf<
      Parser<
        readonly [readonly [number, string], string],
        ExpectedScalar | InsufficientLength
      >
    >();
    expectTypeOf(builder(make())).toEqualTypeOf<
      Parser<
        readonly [readonly [undefined, string], string],
        ExpectedScalar | InsufficientLength
      >
    >();
  });

  test("composed_outputs", () => {
    const suffix = pipe(
      make(),
      literal("!"),
      map(([, value]) => value),
    );
    expectTypeOf(and(suffix)(make({ key: 1 }))).toEqualTypeOf<
      Parser<readonly [{ key: number }, "!"], ExpectedLiteral>
    >();
    expectTypeOf(choice(make(42), make("text"), make(null))).toEqualTypeOf<
      Parser<number | string | null, never>
    >();
  });

  test("reason_union", () => {
    const parser = choice(
      pipe(
        make(),
        literal("!"),
        map(([, value]) => value),
      ),
      pipe(
        make(),
        charIn(xidStart),
        map(([, value]) => value),
        tryMap(number),
      ),
      pipe(make(true), eof),
    );
    expectTypeOf(parser).toEqualTypeOf<
      Parser<
        "!" | number | boolean,
        | ExpectedLiteral
        | ExpectedCharacterClass
        | NotNumber
        | ExpectedEndOfInput
      >
    >();
    const failure = pipe(
      parser.parse("x"),
      Result.getFailure,
      Option.getOrThrow,
    );
    expectTypeOf(failure).toEqualTypeOf<
      ParserError<
        | ExpectedLiteral
        | ExpectedCharacterClass
        | NotNumber
        | ExpectedEndOfInput
      >
    >();
    const reason = pipe(
      failure.expected,
      Array.fromIterable,
      Array.findFirst((candidate) => candidate._tag === "NotNumber"),
      Option.getOrThrow,
    );
    expectTypeOf(reason).toEqualTypeOf<NotNumber>();
    expectTypeOf(reason.text).toEqualTypeOf<string>();
    // @ts-expect-error A semantic failure is not a literal expectation.
    expectTypeOf(reason.literal);
  });

  test("identifier_builder", () => {
    const identifier = flow(
      charIn(xidStart),
      takeWhile(xidContinue),
      map(([[, first], rest]) => first + rest),
      eof,
    );
    expectTypeOf(identifier(make())).toEqualTypeOf<
      Parser<string, ExpectedCharacterClass | ExpectedEndOfInput>
    >();
    expectTypeOf(identifier(make(42))).toEqualTypeOf<
      Parser<string, ExpectedCharacterClass | ExpectedEndOfInput>
    >();
    const semanticSeed = tryMap(number)(make("1"));
    expectTypeOf(identifier(semanticSeed)).toEqualTypeOf<
      Parser<string, NotNumber | ExpectedCharacterClass | ExpectedEndOfInput>
    >();
  });

  test("optional_committed_reasons", () => {
    const parser = pipe(make(), nextChar, optional, eof);
    const failure = pipe(
      parser.parse("xx"),
      Result.getFailure,
      Option.getOrThrow,
    );
    expectTypeOf(failure.expected).toEqualTypeOf<
      HashSet.HashSet<ExpectedEndOfInput | ExpectedScalar | InsufficientLength>
    >();
  });

  test("invalid_composition", () => {
    expectTypeOf(choice(make(42))).toEqualTypeOf<Parser<number, never>>();
    // @ts-expect-error The mapper requires text, but the preceding parser produces a number.
    map((value: string) => value.length)(make(42));
    // @ts-expect-error A fallible mapper must return a Result.
    tryMap((value: number) => value + 1)(make(42));
    // @ts-expect-error A failure reason must retain a tag rather than becoming prose.
    tryMap(() => Result.fail("bad input"))(make());
    // @ts-expect-error A choice requires at least one branch.
    choice();
  });
});
