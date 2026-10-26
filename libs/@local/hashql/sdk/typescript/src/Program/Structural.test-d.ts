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

const emptyList = <const D extends Structural.Definition>(
  definition: D,
): Expression.Expression<Type.List<Structural.TypeOf<D>>, Inputs.Empty> =>
  Structural.list(definition, []);

const shorthandInput = <
  const Name extends string,
  const D extends Structural.Definition,
>(
  name: Name,
  definition: D,
): Expression.Expression<
  Structural.TypeOf<D>,
  Readonly<Record<Name, Structural.TypeOf<D>>>
> => {
  const expression = Structural.input(name, definition);
  return expression;
};

const possiblyAbsent = <V>(value: V): V | undefined => value;

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

describe("structural_value_types", () => {
  test("inferred_fields", () => {
    const count = Structural.input("count", BigInt);
    const enabled = Structural.input("enabled", Boolean, true);
    const row = Structural.struct({ count, enabled, pair: ["x", 1n] });
    expectTypeOf<Expression.TypeOf<typeof row>>().toEqualTypeOf<
      Type.Struct<{
        readonly count: Type.PrimitiveInteger;
        readonly enabled: Type.PrimitiveBoolean;
        readonly pair: Type.Tuple<
          readonly [Type.PrimitiveString, Type.PrimitiveInteger]
        >;
      }>
    >();
    expectTypeOf<Expression.Inputs<typeof row>>().toEqualTypeOf<{
      readonly count: Type.PrimitiveInteger;
      readonly enabled?: Type.PrimitiveBoolean;
    }>();
    expectTypeOf<
      Expression.TypeOf<(typeof row.pair)[0]>
    >().toEqualTypeOf<Type.PrimitiveString>();
  });

  test("tuple_positions", () => {
    const pair = Structural.tuple([1n, "x"]);
    expectTypeOf<Expression.TypeOf<typeof pair>>().toEqualTypeOf<
      Type.Tuple<readonly [Type.PrimitiveInteger, Type.PrimitiveString]>
    >();
    const empty = Structural.tuple([]);
    expectTypeOf<Expression.TypeOf<typeof empty>>().toEqualTypeOf<
      Type.Tuple<readonly []>
    >();
    const variable: readonly bigint[] = [1n];
    // @ts-expect-error A tuple needs a statically known length.
    Structural.tuple(variable);
    const optional: readonly [bigint?] = [];
    // @ts-expect-error Tuple positions must be present.
    Structural.tuple(optional);
  });

  test("list_elements", () => {
    const count = Structural.input("count", BigInt);
    const rows = Structural.list({ count: BigInt }, [{ count }, { count: 0n }]);
    expectTypeOf<Expression.TypeOf<typeof rows>>().toEqualTypeOf<
      Type.List<Row>
    >();
    expectTypeOf<Expression.Inputs<typeof rows>>().toEqualTypeOf<{
      readonly count: Type.PrimitiveInteger;
    }>();
    const empty = Structural.list(BigInt, []);
    expectTypeOf(empty).toEqualTypeOf<
      Expression.Expression<Type.List<Type.PrimitiveInteger>, Inputs.Empty>
    >();
    // @ts-expect-error Values cannot widen the declared Integer element type.
    Structural.list(BigInt, [1]);
    // @ts-expect-error Extra structural fields must not disappear from the element descriptor.
    Structural.list({ count: BigInt }, [{ count: 1n, extra: true }]);
  });

  test("dictionary_entries", () => {
    const key = Structural.input("key", String);
    const count = Structural.input("count", BigInt);
    const byName = Structural.dict(String, BigInt, [[key, count]]);
    expectTypeOf<Expression.TypeOf<typeof byName>>().toEqualTypeOf<
      Type.Dict<Type.PrimitiveString, Type.PrimitiveInteger>
    >();
    expectTypeOf<Expression.Inputs<typeof byName>>().toEqualTypeOf<{
      readonly key: Type.PrimitiveString;
      readonly count: Type.PrimitiveInteger;
    }>();
    const record = Structural.dict(
      String,
      { count: BigInt },
      { item: { count } },
    );
    expectTypeOf<Expression.TypeOf<typeof record>>().toEqualTypeOf<
      Type.Dict<Type.PrimitiveString, Row>
    >();
    expectTypeOf<Expression.Inputs<typeof record>>().toEqualTypeOf<{
      readonly count: Type.PrimitiveInteger;
    }>();
    const empty = Structural.dict(BigInt, String, []);
    expectTypeOf(empty).toEqualTypeOf<
      Expression.Expression<
        Type.Dict<Type.PrimitiveInteger, Type.PrimitiveString>,
        Inputs.Empty
      >
    >();
    // @ts-expect-error A record supplies String keys, not Integer keys.
    Structural.dict(BigInt, String, { item: "x" });
    // @ts-expect-error Values cannot widen the declared key descriptor.
    Structural.dict(String, BigInt, [[1n, 1n]]);
    // @ts-expect-error Values cannot widen the declared value descriptor.
    Structural.dict(String, BigInt, { item: "x" });
    const extra = { item: { count: 1n, extra: true } };
    // @ts-expect-error Extra structural fields remain incompatible in dictionary values.
    Structural.dict(String, { count: BigInt }, extra);
  });

  test("nominal_members", () => {
    const item = TypeExpression.reference<
      Type.Opaque<"Item", Type.PrimitiveInteger>
    >(Result.getOrThrow(JExpr.Path.decodeResult("Item")));
    const id = Expression.input("id", item);
    const ids = Structural.list(item, [id]);
    const names = Structural.dict(item, String, [[id, "x"]]);
    expectTypeOf<Expression.TypeOf<typeof ids>>().toEqualTypeOf<
      Type.List<Type.Opaque<"Item", Type.PrimitiveInteger>>
    >();
    expectTypeOf<Expression.TypeOf<typeof names>>().toEqualTypeOf<
      Type.Dict<
        Type.Opaque<"Item", Type.PrimitiveInteger>,
        Type.PrimitiveString
      >
    >();
    // @ts-expect-error A representation value is not an opaque value.
    Structural.list(item, [1n]);
    // @ts-expect-error Opaque keys require matching handles too.
    Structural.dict(item, String, [[1n, "x"]]);
  });

  test("nested_collection", () => {
    const integers = TypeExpression.reference<Type.List<Type.PrimitiveInteger>>(
      Result.getOrThrow(
        JExpr.Path.decodeResult(
          "::kernel::type::List<::kernel::type::Integer>",
        ),
      ),
    );
    const nested = Structural.list(integers, [Structural.list(BigInt, [1n])]);
    expectTypeOf<Expression.TypeOf<typeof nested>>().toEqualTypeOf<
      Type.List<Type.List<Type.PrimitiveInteger>>
    >();
    // @ts-expect-error A nested host array is a tuple, not a list.
    Structural.list(integers, [[1n]]);
  });

  test("generic_definition", () => {
    const strings = emptyList(String);
    const count = shorthandInput("count", BigInt);
    expectTypeOf<Expression.TypeOf<typeof strings>>().toEqualTypeOf<
      Type.List<Type.PrimitiveString>
    >();
    expectTypeOf<Expression.Inputs<typeof count>>().toEqualTypeOf<{
      readonly count: Type.PrimitiveInteger;
    }>();
  });
});

describe("structural_input_types", () => {
  test("default_requirements", () => {
    const count = Structural.input("count", BigInt);
    const row = Structural.input("row", { count: BigInt }, { count });
    expectTypeOf<Expression.TypeOf<typeof row>>().toEqualTypeOf<Row>();
    expectTypeOf<Expression.Inputs<typeof row>>().toEqualTypeOf<{
      readonly row?: Row;
      readonly count: Type.PrimitiveInteger;
    }>();
    const required = Structural.input("row", { count: BigInt });
    expectTypeOf<Expression.Inputs<typeof required>>().toEqualTypeOf<{
      readonly row: Row;
    }>();
    // @ts-expect-error The default cannot widen the declared field descriptor.
    Structural.input("row", { count: BigInt }, { count: "x" });
    // @ts-expect-error The default must not hide additional fields.
    Structural.input("row", { count: BigInt }, { count: 1n, extra: true });
  });

  test("uncertain_default", () => {
    const fallback = Structural.input("fallback", BigInt);
    const count = Structural.input("count", BigInt, possiblyAbsent(fallback));
    expectTypeOf<Expression.Inputs<typeof count>>().toEqualTypeOf<{
      readonly count: Type.PrimitiveInteger;
      readonly fallback: Type.PrimitiveInteger;
    }>();
    // oxlint-disable-next-line unicorn/no-useless-undefined -- explicitly absent defaults still require the input
    const absent = Structural.input("count", BigInt, undefined);
    expectTypeOf<Expression.Inputs<typeof absent>>().toEqualTypeOf<{
      readonly count: Type.PrimitiveInteger;
    }>();
    // @ts-expect-error Undefined does not make an incompatible defined alternative acceptable.
    Structural.input("count", BigInt, possiblyAbsent("x"));
  });
});
