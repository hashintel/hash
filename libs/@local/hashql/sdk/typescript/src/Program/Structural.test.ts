/**
 * Runtime checks for structural normalization and constructor metadata forwarding.
 *
 * @module
 */
import { Result } from "effect";
import { describe, expect, test } from "vitest";

import * as JExpr from "../JExpr/index.js";
import * as TypeSyntax from "../JExpr/Type/index.js";
import * as Expression from "./Expression.js";
import * as ProgramError from "./ProgramError.js";
import * as Structural from "./Structural.js";
import * as TypeExpression from "./TypeExpression.js";

import type * as Type from "../Type.js";

interface Dictionary extends Type.TypeConstructor {
  readonly arity: 2;
  readonly type: this["Target"] extends readonly [
    infer K extends Type.Any,
    infer V extends Type.Any,
  ]
    ? Type.Dict<K, V>
    : Type.Never;
}

const path = Result.getOrThrow(JExpr.Path.decodeResult("::kernel::type::Dict"));
const declaration = Result.getOrThrow(
  TypeExpression.constructor<Dictionary>(path, 2),
);
const dictionary = Structural.constructor(declaration);

const compile = (definition: TypeExpression.TypeExpression.Any): string =>
  TypeSyntax.compile(Result.getOrThrow(TypeExpression.toType(definition)));

const emit = (value: Expression.Value.Any): string =>
  JExpr.compile(Result.getOrThrow(Expression.toJExpr(value)));

describe("structural_constructor", () => {
  test("mixed_arguments", () => {
    expect.hasAssertions();
    expect(compile(dictionary(String, { count: BigInt }))).toBe(
      "::kernel::type::Dict<::kernel::type::String, (count: ::kernel::type::Integer)>",
    );
  });

  test("forwarded_metadata", () => {
    expect.hasAssertions();
    const forwarded = new Proxy(declaration, { ownKeys: (): string[] => [] });
    const adapted = Structural.constructor(forwarded);
    expect(adapted).toSatisfy(TypeExpression.isConstructor);
    expect(compile(adapted(String, Number))).toBe(
      "::kernel::type::Dict<::kernel::type::String, ::kernel::type::Number>",
    );
  });

  test("relocated_constructor", () => {
    expect.hasAssertions();
    const local = Result.getOrThrow(JExpr.Path.decodeResult("Dictionary"));
    const moved = Result.getOrThrow(TypeExpression.relocate(dictionary, local));
    expect(compile(moved(String, { count: BigInt }))).toBe(
      "Dictionary<::kernel::type::String, (count: ::kernel::type::Integer)>",
    );
    const second = Result.getOrThrow(
      TypeExpression.relocate(
        moved,
        Result.getOrThrow(JExpr.Path.decodeResult("Other")),
      ),
    );
    expect(compile(second(Boolean, Number))).toBe(
      "Other<::kernel::type::Boolean, ::kernel::type::Number>",
    );
    expect(compile(dictionary(String, Number))).toBe(
      "::kernel::type::Dict<::kernel::type::String, ::kernel::type::Number>",
    );
  });

  test("relocated_failure", () => {
    expect.hasAssertions();
    const invalid = dictionary(String, { "": Number });
    expect(TypeExpression.relocate(invalid, path)).toStrictEqual(
      invalid.syntax,
    );
  });

  test("invalid_nested_name", () => {
    expect.hasAssertions();
    const result = dictionary(String, { "": BigInt }).syntax;
    expect(result).toMatchObject({
      _tag: "Failure",
      failure: { reason: { _tag: "InvalidBindingName", name: "" } },
    });
  });

  test("unspecialized_type", () => {
    expect.hasAssertions();
    // @ts-expect-error An unapplied constructor is not a type definition.
    const result = Structural.type(declaration);
    expect(result).toMatchObject({
      _tag: "Failure",
      failure: {
        reason: { _tag: "UnspecializedTypeConstructor" },
        message: "A generic type must be specialized before use",
      },
    });
  });

  test("unsupported_constructor", () => {
    expect.hasAssertions();
    // @ts-expect-error Date is outside the supported primitive shorthand.
    const result = Structural.type(Date);
    expect(result).toMatchObject({
      _tag: "Failure",
      failure: {
        reason: { _tag: "UnsupportedTypeConstructor", name: "Date" },
        message: 'Unsupported primitive type constructor: "Date"',
      },
    });
  });

  test("invalid_field_name", () => {
    expect.hasAssertions();
    expect(Structural.type({ "": Number })).toMatchObject({
      _tag: "Failure",
      failure: { reason: { _tag: "InvalidBindingName", name: "" } },
    });
  });

  test("duplicate_field", () => {
    expect.hasAssertions();
    expect(Structural.type({ "+": String, "`+`": BigInt })).toMatchObject({
      _tag: "Failure",
      failure: {
        reason: { _tag: "DuplicateStructField", name: "`+`" },
        message: 'Duplicate HashQL struct field: "`+`"',
      },
    });
    expect(
      Structural.type({ count: { "`+`": String, "+": BigInt } }),
    ).toMatchObject({
      _tag: "Failure",
      failure: { reason: { _tag: "DuplicateStructField", name: "+" } },
    });
    expect(
      dictionary(String, { "+": String, "`+`": BigInt }).syntax,
    ).toMatchObject({
      _tag: "Failure",
      failure: { reason: { _tag: "DuplicateStructField", name: "`+`" } },
    });
  });

  test("dynamic_arity", () => {
    expect.hasAssertions();
    const dynamic = Structural.constructor(
      Result.getOrThrow(
        TypeExpression.constructor<Type.TypeConstructor>(path, 2),
      ),
    );
    expect(dynamic(String).syntax).toMatchObject({
      _tag: "Failure",
      failure: {
        reason: { _tag: "TypeArgumentCountMismatch", expected: 2, received: 1 },
      },
    });
  });
});

describe("structural_values", () => {
  test("record_and_tuple", () => {
    expect.hasAssertions();
    expect(emit(Structural.struct({ name: "Ada", pair: [1n, true] }))).toBe(
      '{"#struct":{"name":{"#literal":"Ada"},"pair":{"#tuple":[{"#literal":1},{"#literal":true}]}}}',
    );
    expect(emit(Structural.tuple([1n, "x"]))).toBe(
      '{"#tuple":[{"#literal":1},{"#literal":"x"}]}',
    );
    expect(emit(Structural.struct({}))).toBe('{"#struct":{}}');
    expect(emit(Structural.tuple([]))).toBe('{"#tuple":[]}');
  });

  test("empty_collection_types", () => {
    expect.hasAssertions();
    expect(emit(Structural.list(BigInt, []))).toBe(
      '{"#list":[],"#type":"::kernel::type::List<::kernel::type::Integer>"}',
    );
    expect(emit(Structural.dict(String, BigInt, {}))).toBe(
      '{"#dict":[],"#type":"::kernel::type::Dict<::kernel::type::String, ::kernel::type::Integer>"}',
    );
    expect(emit(Structural.dict(BigInt, String, []))).toBe(
      '{"#dict":[],"#type":"::kernel::type::Dict<::kernel::type::Integer, ::kernel::type::String>"}',
    );
  });

  test("nested_collections", () => {
    expect.hasAssertions();
    const rows = Structural.list({ name: String }, [{ name: "Ada" }]);
    const counts = Structural.dict(String, BigInt, { total: 1n });
    const record = Structural.struct({ rows, counts });
    const syntax = Result.getOrThrow(Expression.toJExpr(record));
    expect(syntax).toMatchObject({
      "#struct": {
        rows: {
          "#list": [{ "#struct": { name: { "#literal": "Ada" } } }],
          "#type": "::kernel::type::List<(name: ::kernel::type::String)>",
        },
        counts: {
          "#type":
            "::kernel::type::Dict<::kernel::type::String, ::kernel::type::Integer>",
        },
      },
    });
    expect(emit(Structural.list([BigInt, String], [[1n, "x"]]))).toBe(
      '{"#list":[{"#tuple":[{"#literal":1},{"#literal":"x"}]}],"#type":"::kernel::type::List<(::kernel::type::Integer, ::kernel::type::String)>"}',
    );
  });

  test("dictionary_key_forms", () => {
    expect.hasAssertions();
    const key = Structural.input("key", BigInt);
    const keyed = Structural.dict(BigInt, String, [[key, "value"]]);
    expect(emit(keyed)).toBe(
      '{"#dict":[[["::kernel::special_form::input","key","::kernel::type::Integer"],{"#literal":"value"}]],"#type":"::kernel::type::Dict<::kernel::type::Integer, ::kernel::type::String>"}',
    );
    const record = Structural.dict(String, String, {
      "::path": "value",
      "not an identifier": "other",
      ["__proto__"]: "safe",
    });
    expect(emit(record)).toBe(
      '{"#dict":[[{"#literal":"::path"},{"#literal":"value"}],[{"#literal":"not an identifier"},{"#literal":"other"}],[{"#literal":"__proto__"},{"#literal":"safe"}]],"#type":"::kernel::type::Dict<::kernel::type::String, ::kernel::type::String>"}',
    );
  });

  test("failed_values", () => {
    expect.hasAssertions();
    const bad = Expression.number(Number.NaN);
    const failure = Result.getOrThrow(Result.flip(Expression.toJExpr(bad)));
    for (const expression of [
      Structural.struct({ bad }),
      Structural.tuple([bad]),
      Structural.list(Number, [bad]),
      Structural.dict(Number, String, [[bad, "x"]]),
      Structural.dict(String, Number, { bad }),
      Structural.input("number", Number, bad),
    ]) {
      expect(
        Result.getOrThrow(Result.flip(Expression.toJExpr(expression))),
      ).toBe(failure);
    }
  });

  test("failed_definitions", () => {
    expect.hasAssertions();
    const invalid = dictionary(String, { "": String });
    const failure = Result.getOrThrow(Result.flip(invalid.syntax));
    for (const expression of [
      Structural.list(invalid, []),
      Structural.dict(invalid, String, []),
      Structural.dict(String, invalid, []),
      Structural.input("invalid", invalid),
    ]) {
      expect(
        Result.getOrThrow(Result.flip(Expression.toJExpr(expression))),
      ).toBe(failure);
    }
  });

  test("duplicate_field", () => {
    expect.hasAssertions();
    expect(
      Result.getOrThrow(
        Result.flip(
          Expression.toJExpr(Structural.struct({ "+": 1n, "`+`": 2n })),
        ),
      ).reason,
    ).toStrictEqual(
      ProgramError.Reason.make({
        _tag: "DuplicateStructField",
        name: "`+`",
      }),
    );
  });

  test("invalid_field_and_literal", () => {
    expect.hasAssertions();
    for (const expression of [
      Structural.struct({ "": true }),
      Structural.tuple([Number.NaN]),
      Structural.list(Number, [Number.NaN]),
      Structural.dict(String, Number, { bad: Number.NaN }),
    ]) {
      expect(
        Result.getOrThrow(Result.flip(Expression.toJExpr(expression))).reason
          ._tag,
      ).toBe("InvalidExpression");
    }
  });

  test("structural_input_defaults", () => {
    expect.hasAssertions();
    const count = Structural.input("count", BigInt);
    const row = Structural.input("row", { count: BigInt }, { count });
    expect(emit(row)).toBe(
      '["::kernel::special_form::input","row",{"#struct":{"count":"::kernel::type::Integer"}},{"#struct":{"count":["::kernel::special_form::input","count","::kernel::type::Integer"]}}]',
    );
    expect(emit(Structural.input("pair", [BigInt, String], [1n, "x"]))).toBe(
      '["::kernel::special_form::input","pair",{"#tuple":["::kernel::type::Integer","::kernel::type::String"]},{"#tuple":[{"#literal":1},{"#literal":"x"}]}]',
    );
    // oxlint-disable-next-line unicorn/no-useless-undefined -- explicitly absent defaults must behave like omitted defaults
    expect(emit(Structural.input("count", BigInt, undefined))).toBe(
      emit(count),
    );
  });
});

describe("structural_guards", () => {
  test("records_and_tuples", () => {
    expect.hasAssertions();
    expect(Structural.isDefinition({ name: String })).toBe(true);
    expect(Structural.isDefinition([BigInt, String])).toBe(true);
    expect(Structural.isDefinition(Object.create(null))).toBe(true);
    expect(Structural.isValue({ name: "Ada", location: [1, 2] })).toBe(true);
    expect(Structural.isValue(Object.create(null))).toBe(true);
  });

  test("host_instances", () => {
    expect.hasAssertions();
    expect(Structural.isDefinition(new Map())).toBe(false);
    expect(Structural.isValue(new Map([["a", 1n]]))).toBe(false);
    expect(Structural.isValue(new Set(["a"]))).toBe(false);
    expect(Structural.isValue({ nested: new Map() })).toBe(false);
  });
});
