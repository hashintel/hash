import { Result, pipe } from "effect";
import { describe, expectTypeOf, test } from "vitest";

import { JExpr, Program } from "../main.js";

import type { Type } from "../main.js";

interface Pair extends Type.TypeConstructor {
  readonly arity: 2;
  readonly type: this["Target"] extends readonly [
    infer L extends Type.Any,
    infer R extends Type.Any,
  ]
    ? Type.Tuple<readonly [L, R]>
    : Type.Never;
}

const { TypeExpression } = Program;
const path = Result.getOrThrow(JExpr.Path.decodeResult("Pair"));
const text = TypeExpression.reference<Type.PrimitiveString>(path);
const integer = TypeExpression.reference<Type.PrimitiveInteger>(path);
const pair = Result.getOrThrow(TypeExpression.constructor<Pair>(path, 2));

type StringIntegerPair = Program.TypeExpression.TypeExpression<
  Type.Tuple<readonly [Type.PrimitiveString, Type.PrimitiveInteger]>
>;

describe("type_expression_inference", () => {
  test("specialization", () => {
    expectTypeOf(pair(text, integer)).toEqualTypeOf<StringIntegerPair>();
    // @ts-expect-error The declared arity is a literal two.
    TypeExpression.constructor<Pair>(path, 1);
    // @ts-expect-error A pair requires two type expressions.
    pair(text);
    // @ts-expect-error A pair rejects extra type expressions.
    pair(text, integer, text);
    // @ts-expect-error Host values do not supply semantic descriptors.
    pair("String", 1);
    // @ts-expect-error Type expressions require semantic descriptors.
    TypeExpression.reference<string>(path);
  });

  test("relocation", () => {
    const first = Result.getOrThrow(
      TypeExpression.relocate(pair(text, integer), path),
    );
    const second = pipe(
      first,
      TypeExpression.relocate(path),
      Result.getOrThrow,
    );
    expectTypeOf(first).toEqualTypeOf<StringIntegerPair>();
    expectTypeOf(second).toEqualTypeOf<StringIntegerPair>();
    const constructor = pipe(
      pair,
      TypeExpression.relocate(path),
      Result.getOrThrow,
    );
    expectTypeOf(constructor).toEqualTypeOf<
      Program.TypeExpression.Constructor<Pair>
    >();
    expectTypeOf(constructor(text, integer)).toEqualTypeOf<StringIntegerPair>();
  });

  test("adapted_generic_callable", () => {
    const adapt =
      (self: Program.TypeExpression.Constructor<Pair>) =>
      <T extends Type.Any>(
        second: Program.TypeExpression.TypeExpression<T>,
      ): Program.TypeExpression.TypeExpression<
        Type.Tuple<readonly [Type.PrimitiveString, T]>
      > =>
        self(text, second);
    const first = TypeExpression.adaptConstructor(pair, adapt);
    const curried = pipe(pair, TypeExpression.adaptConstructor(adapt));
    const second = Result.getOrThrow(TypeExpression.relocate(first, path));
    const third = pipe(
      second,
      TypeExpression.relocate(path),
      Result.getOrThrow,
    );
    expectTypeOf(first(integer)).toEqualTypeOf<StringIntegerPair>();
    expectTypeOf(curried(integer)).toEqualTypeOf<StringIntegerPair>();
    expectTypeOf(second(integer)).toEqualTypeOf<StringIntegerPair>();
    expectTypeOf(third(integer)).toEqualTypeOf<StringIntegerPair>();
    // @ts-expect-error Relocation retains the adapter's single argument.
    third(text, integer);
  });
});
