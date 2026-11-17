/** Operator domains and input inference in both argument orders. @module */
import { Result, pipe } from "effect";
import { describe, expectTypeOf, test } from "vitest";

import * as Expression from "./Expression.js";
import * as Operators from "./Operators.js";
import * as Structural from "./Structural.js";

import type * as Type from "../Type.js";
import type * as Inputs from "./Inputs.js";

const integerType = Result.getOrThrow(Structural.type(BigInt));
const booleanType = Result.getOrThrow(Structural.type(Boolean));

describe("operator_types", () => {
  test("operator_domains", () => {
    const count = Expression.input(
      "count",
      Result.getOrThrow(Structural.type(BigInt)),
    );
    const other = Expression.input(
      "other",
      Result.getOrThrow(Structural.type(BigInt)),
      0n,
    );
    const first = Operators.eq(count, other);
    const last = pipe(count, Operators.eq(other));
    expectTypeOf(first).toEqualTypeOf<
      Operators.Predicate<{
        readonly count: Type.PrimitiveInteger;
        readonly other?: Type.PrimitiveInteger;
      }>
    >();
    expectTypeOf(last).toEqualTypeOf(first);
    expectTypeOf(count).not.toHaveProperty("$");
    expectTypeOf(Expression.literal(true)).not.toHaveProperty("and");
    // @ts-expect-error Integer and Number remain distinct in the data-last form.
    pipe(count, Operators.eq(1));
    // @ts-expect-error Negation does not coerce numeric truthiness.
    Operators.not(count);
    // @ts-expect-error A conjunction requires a Boolean left operand.
    pipe(count, Operators.and(true));
    // @ts-expect-error Only an option union admits None checking.
    Operators.isNone(count);
    const left = Symbol("Left");
    const right = Symbol("Right");
    const firstNominal = Expression.fromJExpr<
      Type.Opaque<typeof left, Type.PrimitiveInteger>,
      Inputs.Empty
    >("a");
    const secondNominal = Expression.fromJExpr<
      Type.Opaque<typeof right, Type.PrimitiveInteger>,
      Inputs.Empty
    >("b");
    // @ts-expect-error A pipe cannot equate distinct nominal identities.
    pipe(firstNominal, Operators.eq(secondNominal));
    // @ts-expect-error A fluent predicate still requires Boolean operands.
    first.and(count);
  });

  test("exact_operands", () => {
    const integer = Expression.literal(1n);
    const number = Expression.literal(1);
    expectTypeOf(Operators.eq(integer, 2n)).toEqualTypeOf<
      Operators.Predicate<Inputs.Empty>
    >();
    Operators.eq(number, 2);
    // @ts-expect-error A host number does not become Integer through its value.
    Operators.eq(integer, 2);
    // @ts-expect-error Integer does not implicitly widen to Number.
    Operators.eq(number, 2n);
    // @ts-expect-error Expression handles do not implicitly widen either.
    Operators.eq(number, integer);
    Operators.eq(number, Expression.assume<Type.PrimitiveNumber>()(integer));
    expectTypeOf(Expression.assume<Type.PrimitiveNumber>()(1n)).toEqualTypeOf<
      Expression.Expression<Type.PrimitiveNumber, Inputs.Empty>
    >();
    // @ts-expect-error Boolean operations reject numeric truthiness.
    Operators.and(Expression.literal(true), 1);
    const id = Expression.fromJExpr<
      Type.Opaque<"Id", Type.PrimitiveString>,
      Inputs.Empty
    >("id");
    // @ts-expect-error Strings do not stand in for nominal values.
    Operators.eq(id, "id");
  });

  test("defaults_and_operations", () => {
    const count = Expression.input("count", integerType, 1n);
    const enabled = Expression.input("enabled", booleanType);
    const result = Operators.or(
      Operators.and(Operators.eq(count, 2n), enabled),
      false,
    );
    expectTypeOf<Expression.Value.Inputs<typeof result>>().toEqualTypeOf<{
      readonly count?: Type.PrimitiveInteger;
      readonly enabled: Type.PrimitiveBoolean;
    }>();
  });

  test("none_operand", () => {
    type OptionalCount = Type.Union<
      readonly [
        Type.Opaque<"::core::option::Some", Type.PrimitiveInteger>,
        Type.Opaque<"::core::option::None", Type.PrimitiveNull>,
      ]
    >;
    const count = Expression.fromJExpr<
      OptionalCount,
      { readonly count: OptionalCount }
    >("count");
    const absent = Operators.isNone(count);
    expectTypeOf(absent).toEqualTypeOf<
      Operators.Predicate<{ readonly count: OptionalCount }>
    >();
    const none = Symbol("None");
    const symbolic = Expression.fromJExpr<
      Type.Union<
        readonly [
          Type.PrimitiveInteger,
          Type.Opaque<typeof none, Type.PrimitiveNull>,
        ]
      >,
      Inputs.Empty
    >("symbolic");
    // @ts-expect-error The check compares the opaque name, so a None with a symbol identity does not qualify.
    Operators.isNone(symbolic);
  });

  test("nullable_operand", () => {
    type Flag = Type.Union<
      readonly [Type.PrimitiveBoolean, Type.PrimitiveNull]
    >;
    const flags = Expression.fromJExpr<
      Type.Dict<Type.PrimitiveString, Type.PrimitiveBoolean>,
      Inputs.Empty
    >("flags");
    const selected = flags.$index("key");
    // @ts-expect-error Comparing a nullable result with null needs an explicit assumption.
    Operators.eq(selected, null);
    expectTypeOf(
      Operators.eq(selected, Expression.assume<Flag>()(null)),
    ).toEqualTypeOf<Operators.Predicate<Inputs.Empty>>();
  });
});
