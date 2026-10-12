import { describe, expectTypeOf, test } from "vitest";

import * as JExpr from "./jexpr/index.js";
import { get, makeExpression, toJExpr } from "./playground.js";

import type { Expression } from "./playground.js";
import type * as Type from "./type/index.js";
import type { ReadonlyRecord } from "effect/Record";

type User = Type.Struct<{
  readonly name: Type.PrimitiveString;
  readonly address: Type.Struct<{ readonly city: Type.PrimitiveString }>;
}>;

interface Recursive extends Type.Struct<{
  readonly value: Type.PrimitiveString;
  readonly next: Recursive;
}> {}

const preserve = <T extends Type.Any>(
  expression: Expression<T>,
): Expression<T> => expression;

const lookup = <K extends Type.Any, V extends Type.Any>(
  dictionary: Expression<Type.Dict<K, V>>,
  key: Expression<K>,
): Expression<V | Type.PrimitiveNull> => get(dictionary, key);

describe("expression_types", () => {
  test("struct_projection", () => {
    const user = makeExpression<User>("user");

    expectTypeOf(user.name).toEqualTypeOf<Expression<Type.PrimitiveString>>();
    expectTypeOf(user.address.city).toEqualTypeOf<
      Expression<Type.PrimitiveString>
    >();
  });

  test("generic_preservation", () => {
    const user = preserve(makeExpression<User>("user"));

    expectTypeOf(user).toEqualTypeOf<Expression<User>>();
    expectTypeOf(user.address.city).toEqualTypeOf<
      Expression<Type.PrimitiveString>
    >();
  });

  test("recursive_projection", () => {
    const node = makeExpression<Recursive>("node");

    expectTypeOf(node.next.next.value).toEqualTypeOf<
      Expression<Type.PrimitiveString>
    >();
  });

  test("primitive_identity", () => {
    const value = makeExpression<Type.PrimitiveString>(JExpr.literal("alice"));

    expectTypeOf(value).not.toEqualTypeOf<Expression<Type.PrimitiveInteger>>();
    expectTypeOf(toJExpr(value)).toEqualTypeOf<JExpr.Expression>();
    expectTypeOf(value).not.toHaveProperty("value");
    expectTypeOf(value).not.toHaveProperty("push");
  });

  test("opaque_identity", () => {
    const value =
      makeExpression<Type.Opaque<"UserId", Type.PrimitiveInteger>>("id");

    expectTypeOf(value).not.toEqualTypeOf<Expression<Type.PrimitiveInteger>>();
    expectTypeOf(value).not.toEqualTypeOf<
      Expression<Type.Opaque<"PostId", Type.PrimitiveInteger>>
    >();
  });

  test("missing_field", () => {
    const user = makeExpression<User>("user");

    expectTypeOf(user).toEqualTypeOf<Expression<User>>();
    expectTypeOf(user).not.toHaveProperty("missing");
    // @ts-expect-error Field access cannot replace a symbolic expression.
    user.name = makeExpression<Type.PrimitiveString>("other");
  });
});

describe("tuple_types", () => {
  test("tuple_positions", () => {
    const tuple =
      makeExpression<
        Type.Tuple<readonly [Type.PrimitiveString, Type.PrimitiveInteger]>
      >("tuple");

    expectTypeOf(tuple[0]).toEqualTypeOf<Expression<Type.PrimitiveString>>();
    expectTypeOf(tuple[1]).toEqualTypeOf<Expression<Type.PrimitiveInteger>>();
    expectTypeOf(tuple).not.toHaveProperty("2");
    expectTypeOf(tuple).not.toHaveProperty(Number("0"));
    expectTypeOf(tuple).not.toHaveProperty("length");
    expectTypeOf(tuple).not.toHaveProperty("map");
  });

  test("tuple_empty", () => {
    const tuple = makeExpression<Type.Tuple<readonly []>>("tuple");

    expectTypeOf(toJExpr(tuple)).toEqualTypeOf<JExpr.Expression>();
    expectTypeOf(tuple).not.toHaveProperty("0");
    expectTypeOf(tuple).not.toHaveProperty(Number("0"));
  });
});

describe("lookup_types", () => {
  test("lookup_nullable", () => {
    const dictionary =
      makeExpression<Type.Dict<Type.PrimitiveString, User>>("users");
    const key = makeExpression<Type.PrimitiveString>(JExpr.literal("alice"));
    const result = get(dictionary, key);

    expectTypeOf(result).toEqualTypeOf<Expression<User | Type.PrimitiveNull>>();
    expectTypeOf(result).not.toHaveProperty("name");
  });

  test("lookup_null_value", () => {
    const dictionary =
      makeExpression<Type.Dict<Type.PrimitiveString, Type.PrimitiveNull>>(
        "values",
      );
    const key = makeExpression<Type.PrimitiveString>("key");

    expectTypeOf(get(dictionary, key)).toEqualTypeOf<
      Expression<Type.PrimitiveNull>
    >();
  });

  test("lookup_expression_key", () => {
    const dictionary =
      makeExpression<Type.Dict<Type.PrimitiveString, User>>("users");
    const user = makeExpression<User>("user");

    expectTypeOf(get(dictionary, user.name)).toEqualTypeOf<
      Expression<User | Type.PrimitiveNull>
    >();
  });

  test("lookup_generic_wrapper", () => {
    const dictionary =
      makeExpression<Type.Dict<Type.PrimitiveString, User>>("users");
    const key = makeExpression<Type.PrimitiveString>("key");

    expectTypeOf(lookup(dictionary, key)).toEqualTypeOf<
      Expression<User | Type.PrimitiveNull>
    >();
  });
});

describe("lookup_constraints", () => {
  test("lookup_invariant_struct_key", () => {
    type Key = Type.Struct<{ readonly id: Type.PrimitiveInteger }>;
    const dictionary = makeExpression<Type.Dict<Key, User>>("users");
    const key = makeExpression<Key>("key");
    const narrower = makeExpression<
      Type.Struct<{
        readonly id: Type.PrimitiveInteger;
        readonly name: Type.PrimitiveString;
      }>
    >("narrower");
    const broader =
      makeExpression<Type.Struct<ReadonlyRecord<never, never>>>("broader");

    expectTypeOf(get(dictionary, key)).toEqualTypeOf<
      Expression<User | Type.PrimitiveNull>
    >();
    // @ts-expect-error An additional field makes the key narrower, not equivalent.
    get(dictionary, narrower);
    // @ts-expect-error The dictionary's required field cannot disappear from the key.
    get(dictionary, broader);
  });

  test("lookup_invariant_union_key", () => {
    type Key = Type.PrimitiveString | Type.PrimitiveNull;
    const dictionary = makeExpression<Type.Dict<Key, User>>("users");
    const key = makeExpression<Key>("key");
    const narrower = makeExpression<Type.PrimitiveString>("narrower");
    const broader = makeExpression<Key | Type.PrimitiveInteger>("broader");

    expectTypeOf(get(dictionary, key)).toEqualTypeOf<
      Expression<User | Type.PrimitiveNull>
    >();
    // @ts-expect-error Equivalence must include every union member.
    get(dictionary, narrower);
    // @ts-expect-error An additional union member makes the key broader, not equivalent.
    get(dictionary, broader);
  });

  test("lookup_invalid_arguments", () => {
    const dictionary =
      makeExpression<Type.Dict<Type.PrimitiveString, User>>("users");
    const wrongKey = makeExpression<Type.PrimitiveInteger>(JExpr.integer(0));
    const key = makeExpression<Type.PrimitiveString>("key");
    const user = makeExpression<User>("user");

    expectTypeOf(get(dictionary, key)).toEqualTypeOf<
      Expression<User | Type.PrimitiveNull>
    >();
    // @ts-expect-error The dictionary, not its index expression, determines the key type.
    get(dictionary, wrongKey);
    // @ts-expect-error A struct cannot stand in for a dictionary.
    get(user, key);
    // @ts-expect-error Lookup keys are expressions, not decoded JavaScript values.
    get(dictionary, "alice");
  });

  test("lookup_nullable_receiver", () => {
    type Dictionary = Type.Dict<Type.PrimitiveString, Type.PrimitiveString>;
    const outer =
      makeExpression<Type.Dict<Type.PrimitiveString, Dictionary>>("outer");
    const key = makeExpression<Type.PrimitiveString>("key");
    const inner = get(outer, key);

    expectTypeOf(inner).toEqualTypeOf<
      Expression<Dictionary | Type.PrimitiveNull>
    >();
    // @ts-expect-error A second lookup needs to handle the possibly absent dictionary.
    get(inner, key);
  });
});

describe("binding_types", () => {
  test("descriptor_rejection", () => {
    const value = makeExpression<Type.PrimitiveString>("value");

    expectTypeOf(toJExpr(value)).toEqualTypeOf<JExpr.Expression>();
    // @ts-expect-error A type descriptor carries no expression binding.
    toJExpr({ _tag: "String", value: "alice" });
  });

  test("binding_name_fields", () => {
    const value = makeExpression<
      Type.Struct<{
        readonly get: Type.PrimitiveString;
        readonly push: Type.PrimitiveInteger;
        readonly then: Type.PrimitiveBoolean;
      }>
    >("value");

    expectTypeOf(value.get).toEqualTypeOf<Expression<Type.PrimitiveString>>();
    expectTypeOf(value.push).toEqualTypeOf<Expression<Type.PrimitiveInteger>>();
    expectTypeOf(value.then).toEqualTypeOf<Expression<Type.PrimitiveBoolean>>();
  });
});
