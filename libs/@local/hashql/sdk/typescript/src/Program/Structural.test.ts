/**
 * Runtime checks for structural normalization and constructor metadata forwarding.
 *
 * @module
 */
import { Result } from "effect";
import { describe, expect, test } from "vitest";

import * as JExpr from "../JExpr/index.js";
import * as TypeSyntax from "../JExpr/Type/index.js";
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
    const invalid = Structural.type({ "": Number });
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
    const result = Structural.type(declaration).syntax;
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
    const result = Structural.type(Date).syntax;
    expect(result).toMatchObject({
      _tag: "Failure",
      failure: {
        reason: { _tag: "UnsupportedTypeConstructor", name: "Date" },
        message: 'Unsupported primitive type constructor: "Date"',
      },
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
