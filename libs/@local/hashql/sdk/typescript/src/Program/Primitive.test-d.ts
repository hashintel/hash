import { describe, expectTypeOf, test } from "vitest";

import * as Expression from "./Expression.js";
import * as Operators from "./Operators.js";
import * as Structural from "./Structural.js";

import type * as Type from "../Type.js";
import type * as Inputs from "./Inputs.js";

const integerType = Structural.type(BigInt);
const numberType = Structural.type(Number);
const booleanType = Structural.type(Boolean);

interface Identity extends Type.FunctionSignature {
  readonly type: this["Target"] extends readonly [infer T extends Type.Any]
    ? Type.Function<readonly [T], T>
    : Type.Function<readonly [Type.Never], Type.Never>;
}

declare const hostNumber: number;
declare const optionalNumber: number | undefined;

describe("primitive_types", () => {
  test("host_numeric_types", () => {
    expectTypeOf(Expression.literal(1)).toEqualTypeOf<
      Expression.Expression<Type.PrimitiveNumber, Inputs.Empty>
    >();
    expectTypeOf(Expression.literal(1.5)).toEqualTypeOf<
      Expression.Expression<Type.PrimitiveNumber, Inputs.Empty>
    >();
    expectTypeOf(Expression.literal(hostNumber)).toEqualTypeOf<
      Expression.Expression<Type.PrimitiveNumber, Inputs.Empty>
    >();
    expectTypeOf(Expression.literal(1n)).toEqualTypeOf<
      Expression.Expression<Type.PrimitiveInteger, Inputs.Empty>
    >();
    expectTypeOf(Expression.literal(true)).toEqualTypeOf<
      Expression.Expression<Type.PrimitiveBoolean, Inputs.Empty>
    >();
    expectTypeOf(Expression.literal("name")).toEqualTypeOf<
      Expression.Expression<Type.PrimitiveString, Inputs.Empty>
    >();
    expectTypeOf(Expression.literal(null)).toEqualTypeOf<
      Expression.Expression<Type.PrimitiveNull, Inputs.Empty>
    >();
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
});

describe("primitive_arguments", () => {
  test("fixed_and_generic", () => {
    const identity = Expression.fromJExpr<
      Type.GenericFunction<Identity>,
      Inputs.Empty
    >("identity");
    expectTypeOf(identity(7)).toEqualTypeOf<
      Expression.Expression<Type.PrimitiveNumber, Inputs.Empty>
    >();
    expectTypeOf(identity(7n)).toEqualTypeOf<
      Expression.Expression<Type.PrimitiveInteger, Inputs.Empty>
    >();
    const fixed = Expression.fromJExpr<
      Type.Function<
        readonly [Type.PrimitiveNumber, Type.PrimitiveString],
        Type.PrimitiveBoolean
      >,
      { readonly receiver: Type.PrimitiveBoolean }
    >("fixed");
    const result = fixed(7, "literal");
    expectTypeOf<Expression.Inputs<typeof result>>().toEqualTypeOf<{
      readonly receiver: Type.PrimitiveBoolean;
    }>();
    // @ts-expect-error The exact parameter descriptor is Number, not Integer.
    fixed(7n, "literal");
    // @ts-expect-error Primitive arguments do not disable arity checking.
    fixed(7);
    // @ts-expect-error Objects require explicit construction.
    identity({ field: true });
  });

  test("index_key", () => {
    const list = Expression.fromJExpr<
      Type.List<Type.PrimitiveString>,
      Inputs.Empty
    >("list");
    expectTypeOf(list.$index(0n)).toEqualTypeOf<
      Expression.Expression<
        Type.Union<readonly [Type.PrimitiveString, Type.PrimitiveNull]>,
        Inputs.Empty
      >
    >();
    // @ts-expect-error A list index requires Integer even when a number is integral.
    list.$index(0);
    const dict = Expression.fromJExpr<
      Type.Dict<Type.PrimitiveString, Type.PrimitiveBoolean>,
      Inputs.Empty
    >("dict");
    const selected = dict.$index("key");
    expectTypeOf(selected).toEqualTypeOf<
      Expression.Expression<
        Type.Union<readonly [Type.PrimitiveBoolean, Type.PrimitiveNull]>,
        Inputs.Empty
      >
    >();
  });
});

describe("primitive_requirements", () => {
  test("defaults_and_operations", () => {
    const count = Expression.input("count", integerType, 1n);
    const enabled = Expression.input("enabled", booleanType);
    const result = Operators.or(
      Operators.and(Operators.eq(count, 2n), enabled),
      false,
    );
    expectTypeOf<Expression.Inputs<typeof result>>().toEqualTypeOf<{
      readonly count?: Type.PrimitiveInteger;
      readonly enabled: Type.PrimitiveBoolean;
    }>();
    const number = Expression.input("number", numberType, 1);
    expectTypeOf<Expression.Inputs<typeof number>>().toEqualTypeOf<{
      readonly number?: Type.PrimitiveNumber;
    }>();
    const uncertain = Expression.input("number", numberType, optionalNumber);
    expectTypeOf<Expression.Inputs<typeof uncertain>>().toEqualTypeOf<{
      readonly number: Type.PrimitiveNumber;
    }>();
    // @ts-expect-error Defaults retain the declared numeric distinction.
    Expression.input("count", integerType, 1);
    // @ts-expect-error A bigint default does not widen to Number.
    Expression.input("number", numberType, 1n);
  });

  test("conditional_branches", () => {
    const count = Expression.input("count", integerType);
    const expression = Expression.ifElse(true, {
      // oxlint-disable-next-line unicorn/no-thenable -- this property holds a conditional branch
      then: count,
      else: 0n,
    });
    expectTypeOf(expression).toEqualTypeOf<
      Expression.Expression<
        Type.PrimitiveInteger,
        { readonly count: Type.PrimitiveInteger }
      >
    >();
    const numeric = Expression.ifElse(true, {
      // oxlint-disable-next-line unicorn/no-thenable -- this property holds a conditional branch
      then: 1,
      else: 2,
    });
    expectTypeOf(numeric).toEqualTypeOf<
      Expression.Expression<Type.PrimitiveNumber, Inputs.Empty>
    >();
  });
});
