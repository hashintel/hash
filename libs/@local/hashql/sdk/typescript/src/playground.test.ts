import { describe, expect, test } from "vitest";

import * as JExpr from "./jexpr/index.js";
import { get, makeExpression, toJExpr } from "./playground.js";

import type * as Type from "./type/index.js";
import type { ReadonlyRecord } from "effect/Record";

type User = Type.Struct<{
  readonly name: Type.PrimitiveString;
  readonly address: Type.Struct<{ readonly city: Type.PrimitiveString }>;
}>;

const collisionFields = [
  "push",
  "get",
  "then",
  "toJSON",
  "constructor",
  "__proto__",
] as const;

type Collision = Type.Struct<
  ReadonlyRecord<(typeof collisionFields)[number], Type.PrimitiveString>
>;

describe("expression_binding", () => {
  test("primitive_ast", () => {
    expect.hasAssertions();
    const expression = makeExpression<Type.PrimitiveInteger>(JExpr.integer(0));

    expect(JExpr.compile(toJExpr(expression))).toBe('{"#literal":0}');
  });

  test("struct_nested", () => {
    expect.hasAssertions();
    const user = makeExpression<User>("user");

    expect(JExpr.compile(toJExpr(user.address.city))).toBe(
      '["::kernel::special_form::access",["::kernel::special_form::access","user","address"],"city"]',
    );
  });

  test("projection_branches", () => {
    expect.hasAssertions();
    const user = makeExpression<User>("user");
    const name = user.name;
    const city = user.address.city;

    expect(toJExpr(user)).toBe("user");
    expect(toJExpr(name)).toStrictEqual([
      "::kernel::special_form::access",
      "user",
      "name",
    ]);
    expect(toJExpr(city)).toStrictEqual([
      "::kernel::special_form::access",
      ["::kernel::special_form::access", "user", "address"],
      "city",
    ]);
  });

  test("tuple_positions", () => {
    expect.hasAssertions();
    const pair =
      makeExpression<
        Type.Tuple<readonly [Type.PrimitiveString, Type.PrimitiveInteger]>
      >("pair");

    expect(JExpr.compile(toJExpr(pair[0]))).toBe(
      '["access","pair",{"#literal":0}]',
    );
    expect(JExpr.compile(toJExpr(pair[1]))).toBe(
      '["access","pair",{"#literal":1}]',
    );
  });

  test("tuple_empty", () => {
    expect.hasAssertions();
    const empty = makeExpression<Type.Tuple<readonly []>>(JExpr.tuple());

    expect(JExpr.compile(toJExpr(empty))).toBe('{"#tuple":[]}');
  });

  test.each(collisionFields)("field_name_%s", (field) => {
    expect.hasAssertions();
    const expression = makeExpression<Collision>("value");

    expect(toJExpr(expression[field])).toStrictEqual([
      "::kernel::special_form::access",
      "value",
      field,
    ]);
  });
});

describe("field_identifiers", () => {
  test("field_unicode", () => {
    expect.hasAssertions();
    const expression =
      makeExpression<Type.Struct<{ readonly naïve: Type.PrimitiveString }>>(
        "value",
      );

    expect(toJExpr(expression.naïve)).toStrictEqual([
      "::kernel::special_form::access",
      "value",
      "naïve",
    ]);
  });

  test("field_symbol", () => {
    expect.hasAssertions();
    const expression =
      makeExpression<Type.Struct<{ readonly "+": Type.PrimitiveInteger }>>(
        "value",
      );

    expect(toJExpr(expression["+"])).toStrictEqual([
      "::kernel::special_form::access",
      "value",
      "`+`",
    ]);
  });

  test("field_base_url", () => {
    expect.hasAssertions();
    const expression = makeExpression<
      Type.Struct<{
        readonly "https://example.com/a::b/": Type.PrimitiveString;
      }>
    >("value");

    expect(toJExpr(expression["https://example.com/a::b/"])).toStrictEqual([
      "::kernel::special_form::access",
      "value",
      "`https://example.com/a::b/`",
    ]);
  });

  test.each(["", "invalid field", "01", "-1", "`+`"])(
    "field_invalid_%s",
    (field) => {
      expect.hasAssertions();
      const expression = makeExpression<User>("user");

      expect(() => {
        Reflect.get(expression, field);
      }).toThrow("Invalid HashQL field name");
    },
  );
});

describe("dictionary_lookup", () => {
  test("lookup_literal_key", () => {
    expect.hasAssertions();
    const dictionary =
      makeExpression<Type.Dict<Type.PrimitiveString, User>>("users");
    const key = makeExpression<Type.PrimitiveString>(JExpr.literal("alice"));

    expect(JExpr.compile(toJExpr(get(dictionary, key)))).toBe(
      '["::kernel::special_form::index","users",{"#literal":"alice"}]',
    );
    expect(toJExpr(dictionary)).toBe("users");
  });

  test("lookup_expression_key", () => {
    expect.hasAssertions();
    const dictionary =
      makeExpression<Type.Dict<Type.PrimitiveString, User>>("users");
    const user = makeExpression<User>("user");

    expect(toJExpr(get(dictionary, user.name))).toStrictEqual([
      "::kernel::special_form::index",
      "users",
      ["::kernel::special_form::access", "user", "name"],
    ]);
  });
});

describe("host_interop", () => {
  test("symbol_probe", () => {
    expect.hasAssertions();
    const expression = makeExpression<User>("user");

    expect(Reflect.get(expression, Symbol.iterator)).toBeUndefined();
    expect(Reflect.get(expression, Symbol.toStringTag)).toBeUndefined();
  });

  // oxlint-disable-next-line typescript/promise-function-async -- returns the Promise assertion directly
  test("promise_assimilation", () => {
    expect.hasAssertions();
    const expression = makeExpression<Collision>("value");

    expect(toJExpr(expression.then)).toStrictEqual([
      "::kernel::special_form::access",
      "value",
      "then",
    ]);
    return expect(Promise.resolve(expression)).resolves.toBe(expression);
  });
});
