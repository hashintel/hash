/**
 * Type-level checks for structural descriptors and input requirements.
 *
 * The generic forwarder checks that normalization retains its caller's type parameter. Mixed tuples distinguish positional mapping from a union of element types.
 *
 * @module
 */
import { Result } from "effect";
import { describe, expectTypeOf, test } from "vitest";

import * as JExpr from "../JExpr/index.js";
import * as Expression from "./Expression.js";
import * as Structural from "./Structural.js";
import * as TypeExpression from "./TypeExpression.js";

import type * as Type from "../Type.js";
import type * as Inputs from "./Inputs.js";

interface Dictionary extends Type.TypeConstructor {
  readonly arity: 2;
  readonly type: this["Target"] extends readonly [
    infer K extends Type.Any,
    infer V extends Type.Any,
  ]
    ? Type.Dict<K, V>
    : Type.Never;
}

const dictionary = Structural.constructor(
  Result.getOrThrow(
    TypeExpression.constructor<Dictionary>(
      Result.getOrThrow(JExpr.Path.decodeResult("::kernel::type::Dict")),
      2,
    ),
  ),
);

const withStringKey = <const D extends Structural.Definition>(
  definition: D,
): TypeExpression.TypeExpression<
  Type.Dict<Type.PrimitiveString, Structural.TypeOf<D>>
> => dictionary(String, definition);

type Row = Type.Struct<{ readonly count: Type.PrimitiveInteger }>;

const hostChoice = (
  flag: boolean,
):
  | {
      readonly count: Expression.Expression<
        Type.PrimitiveInteger,
        { readonly count: Type.PrimitiveInteger }
      >;
    }
  | {
      readonly count: Expression.Expression<
        Type.PrimitiveInteger,
        Inputs.Empty
      >;
    } => {
  const count = Expression.input("count", Structural.type(BigInt));
  if (flag) {
    return { count };
  }
  return { count: Expression.integer(0) };
};

describe("structural_constructor_types", () => {
  test("argument_positions", () => {
    expectTypeOf(dictionary(String, { count: BigInt })).toEqualTypeOf<
      TypeExpression.TypeExpression<
        Type.Dict<
          Type.PrimitiveString,
          Type.Struct<{ readonly count: Type.PrimitiveInteger }>
        >
      >
    >();
    expectTypeOf(dictionary(Number, [Boolean, String])).toEqualTypeOf<
      TypeExpression.TypeExpression<
        Type.Dict<
          Type.PrimitiveNumber,
          Type.Tuple<readonly [Type.PrimitiveBoolean, Type.PrimitiveString]>
        >
      >
    >();
  });

  test("generic_forwarding", () => {
    expectTypeOf(withStringKey(BigInt)).toEqualTypeOf<
      TypeExpression.TypeExpression<
        Type.Dict<Type.PrimitiveString, Type.PrimitiveInteger>
      >
    >();
    expectTypeOf(withStringKey({ enabled: Boolean })).toEqualTypeOf<
      TypeExpression.TypeExpression<
        Type.Dict<
          Type.PrimitiveString,
          Type.Struct<{ readonly enabled: Type.PrimitiveBoolean }>
        >
      >
    >();
  });

  test("nominal_argument", () => {
    const identity = Symbol("Item");
    const item = TypeExpression.reference<
      Type.Opaque<typeof identity, Type.PrimitiveInteger>
    >(Result.getOrThrow(JExpr.Path.decodeResult("Item")));
    expectTypeOf(dictionary(String, item)).toEqualTypeOf<
      TypeExpression.TypeExpression<
        Type.Dict<
          Type.PrimitiveString,
          Type.Opaque<typeof identity, Type.PrimitiveInteger>
        >
      >
    >();
  });

  test("relocated_types", () => {
    const local = Result.getOrThrow(JExpr.Path.decodeResult("Dictionary"));
    const moved = Result.getOrThrow(TypeExpression.relocate(dictionary, local));
    expectTypeOf(moved).toEqualTypeOf<typeof dictionary>();
    expectTypeOf(moved(String, { count: BigInt })).toEqualTypeOf<
      TypeExpression.TypeExpression<Type.Dict<Type.PrimitiveString, Row>>
    >();
    const identity = Symbol("Item");
    const item =
      TypeExpression.reference<
        Type.Opaque<typeof identity, Type.PrimitiveInteger>
      >(local);
    const alias = Result.getOrThrow(TypeExpression.relocate(item, local));
    expectTypeOf(alias).toEqualTypeOf<typeof item>();
    // @ts-expect-error Relocation preserves the constructor's arity.
    moved(String);
  });

  test("structural_requirements", () => {
    const result = Structural.value<Row>()(hostChoice(true));
    expectTypeOf(result).toEqualTypeOf<
      Expression.Expression<Row, { readonly count: Type.PrimitiveInteger }>
    >();
    // @ts-expect-error The host choice may contain a required input.
    const closed: Expression.Expression<Row, Inputs.Empty> = result;
    expectTypeOf(closed).toEqualTypeOf<
      Expression.Expression<Row, Inputs.Empty>
    >();
    // @ts-expect-error Number is not the Integer descriptor required by Row.
    Structural.value<Row>()({ count: 1 });
  });

  test("argument_rejections", () => {
    expectTypeOf<Structural.TypeOf<"key">>().toBeNever();
    // @ts-expect-error Dict requires both a key type and a value type.
    dictionary(String);
    // @ts-expect-error Dict accepts exactly two arguments.
    dictionary(String, Number, Boolean);
    // @ts-expect-error Host values are not type definitions.
    dictionary("key", Number);
  });
});
