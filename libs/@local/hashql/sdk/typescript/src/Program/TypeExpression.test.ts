import { Result, pipe } from "effect";
import { describe, expect, test } from "vitest";

import * as JExpr from "../JExpr/index.js";
import * as ProgramError from "./ProgramError.js";
import * as TypeExpression from "./TypeExpression.js";

import type * as Type from "../Type.js";

interface Pair extends Type.TypeConstructor {
  readonly arity: 2;
  readonly type: this["Target"] extends readonly [
    infer L extends Type.Any,
    infer R extends Type.Any,
  ]
    ? Type.Tuple<readonly [L, R]>
    : Type.Never;
}

const path = (source: string): JExpr.Path.Path =>
  Result.getOrThrow(JExpr.Path.decodeResult(source));
const text = TypeExpression.reference<Type.PrimitiveString>(path("String"));
const integer = TypeExpression.reference<Type.PrimitiveInteger>(
  path("Integer"),
);
const pair = Result.getOrThrow(
  TypeExpression.constructor<Pair>(path("Pair"), 2),
);
const compile = (type: TypeExpression.TypeExpression.Any): string =>
  pipe(type, TypeExpression.toType, Result.getOrThrow, JExpr.Type.compile);

const adapt =
  (self: TypeExpression.Constructor<Pair>) =>
  (
    syntax: JExpr.Type.Type,
  ): TypeExpression.TypeExpression<
    Type.Tuple<readonly [Type.PrimitiveString, Type.PrimitiveInteger]>
  > =>
    self(text, TypeExpression.fromType<Type.PrimitiveInteger>(syntax));

const firstPath = path("::first::Pair");
const secondPath = path("::second::Pair");

describe("type_expression", () => {
  test("syntax_and_reference_roundtrip", () => {
    expect.hasAssertions();
    const syntax = JExpr.Type.tuple(
      Result.getOrThrow(TypeExpression.toType(text)),
      Result.getOrThrow(TypeExpression.toType(integer)),
    );
    const tuple =
      TypeExpression.fromType<
        Type.Tuple<readonly [Type.PrimitiveString, Type.PrimitiveInteger]>
      >(syntax);
    expect(Result.getOrThrow(TypeExpression.toType(tuple))).toBe(syntax);
    expect(compile(tuple)).toBe("(String, Integer)");
    expect(compile(text)).toBe("String");
    expect([
      TypeExpression.isExport(tuple),
      TypeExpression.isConstructor(tuple),
      TypeExpression.isExport({ syntax: Result.succeed(syntax) }),
      TypeExpression.isConstructor(null),
    ]).toStrictEqual([true, false, false, false]);
  });

  test("retained_construction_failure", () => {
    expect.hasAssertions();
    const failure = ProgramError.Construction.invalidTypeArity(-1);
    const syntax = Result.fail(failure);
    const failed = TypeExpression.fromResult<Type.PrimitiveString>(syntax);
    expect(TypeExpression.toType(failed)).toBe(syntax);
    expect(TypeExpression.relocate(failed, firstPath)).toStrictEqual(syntax);
    expect(pipe(failed, TypeExpression.relocate(firstPath))).toStrictEqual(
      syntax,
    );
    const application = TypeExpression.toType(pair(failed, integer));
    expect(pipe(application, Result.flip, Result.getOrThrow)).toBe(failure);
  });

  test("unchecked_argument", () => {
    expect.hasAssertions();
    const unchecked = TypeExpression.fromType<Type.PrimitiveInteger>({
      _tag: "Struct",
      members: [[{ _tag: "Lexical", value: "first name" }, { _tag: "Infer" }]],
    });
    const application = TypeExpression.toType(pair(text, unchecked));
    expect(pipe(application, Result.flip, Result.getOrThrow).reason._tag).toBe(
      "InvalidExpression",
    );
  });

  test.each([-1, 0.5, Number.NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "invalid_arity_%s",
    (arity) => {
      expect.hasAssertions();
      const declaration = TypeExpression.constructor<Type.TypeConstructor>(
        path("Invalid"),
        arity,
      );
      expect(
        pipe(declaration, Result.flip, Result.getOrThrow).reason,
      ).toStrictEqual({
        _tag: "InvalidTypeArity",
        arity,
      });
    },
  );

  test("generic_application_and_argument_count", () => {
    expect.hasAssertions();
    expect(compile(pair(text, integer))).toBe("Pair<String, Integer>");
    expect([
      TypeExpression.isExport(pair),
      TypeExpression.isConstructor(pair),
    ]).toStrictEqual([true, true]);
    const zero = Result.getOrThrow(
      TypeExpression.constructor<Type.TypeConstructor>(path("Zero"), 0),
    );
    expect(compile(zero())).toBe("Zero");
    // @ts-expect-error Runtime callers can omit a required argument.
    const missing = TypeExpression.toType(pair(text));
    // @ts-expect-error Runtime callers can supply extra arguments.
    const extra = TypeExpression.toType(pair(text, integer, text));
    expect(pipe(missing, Result.flip, Result.getOrThrow).reason).toStrictEqual({
      _tag: "TypeArgumentCountMismatch",
      expected: 2,
      received: 1,
    });
    expect(pipe(extra, Result.flip, Result.getOrThrow).reason).toStrictEqual({
      _tag: "TypeArgumentCountMismatch",
      expected: 2,
      received: 3,
    });
  });

  test("generic_path_arguments", () => {
    expect.hasAssertions();
    const genericPath = path("::module<Outer>::Pair<Existing>");
    const constructor = Result.getOrThrow(
      TypeExpression.constructor<Pair>(genericPath, 2),
    );
    const syntax = Result.getOrThrow(
      TypeExpression.toType(constructor(text, integer)),
    );
    expect(JExpr.Type.compile(syntax)).toBe(
      "::module<Outer>::Pair<Existing, String, Integer>",
    );
    expect(JExpr.Path.compile(genericPath)).toBe(
      "::module<Outer>::Pair<Existing>",
    );
    expect(JExpr.Type.make(syntax)).toStrictEqual(syntax);
  });

  test("relocation_preservation", () => {
    expect.hasAssertions();
    const structural = TypeExpression.fromType<Type.Tuple<readonly []>>(
      JExpr.Type.tuple(),
    );
    const first = Result.getOrThrow(
      TypeExpression.relocate(structural, firstPath),
    );
    const second = pipe(
      first,
      TypeExpression.relocate(secondPath),
      Result.getOrThrow,
    );
    expect([
      compile(structural),
      compile(first),
      compile(second),
    ]).toStrictEqual(["()", "::first::Pair", "::second::Pair"]);
    const firstConstructor = Result.getOrThrow(
      TypeExpression.relocate(pair, firstPath),
    );
    const secondConstructor = pipe(
      firstConstructor,
      TypeExpression.relocate(secondPath),
      Result.getOrThrow,
    );
    expect(compile(pair(text, integer))).toBe("Pair<String, Integer>");
    expect(compile(firstConstructor(text, integer))).toBe(
      "::first::Pair<String, Integer>",
    );
    expect(compile(secondConstructor(text, integer))).toBe(
      "::second::Pair<String, Integer>",
    );
  });

  test("adapted_relocation", () => {
    expect.hasAssertions();
    const adapted = TypeExpression.adaptConstructor(pair, adapt);
    const curried = pipe(pair, TypeExpression.adaptConstructor(adapt));
    for (const constructor of [adapted, curried]) {
      const first = Result.getOrThrow(
        TypeExpression.relocate(constructor, firstPath),
      );
      const second = pipe(
        first,
        TypeExpression.relocate(secondPath),
        Result.getOrThrow,
      );
      const third = Result.getOrThrow(
        TypeExpression.relocate(second, path("::third::Pair")),
      );
      const syntax = Result.getOrThrow(TypeExpression.toType(integer));
      expect([
        TypeExpression.isConstructor(second),
        TypeExpression.isExport(third),
      ]).toStrictEqual([true, true]);
      expect(compile(constructor(syntax))).toBe("Pair<String, Integer>");
      expect(compile(first(syntax))).toBe("::first::Pair<String, Integer>");
      expect(compile(second(syntax))).toBe("::second::Pair<String, Integer>");
      expect(compile(third(syntax))).toBe("::third::Pair<String, Integer>");
    }
  });

  test("pass_through_adaptation", () => {
    expect.hasAssertions();
    const local = Result.getOrThrow(
      TypeExpression.constructor<Pair>(path("Pair"), 2),
    );
    const entry = TypeExpression.adaptConstructor(local, adapt);
    const same = TypeExpression.adaptConstructor(entry, (current) => current);
    expect(same).not.toBe(entry);

    const syntax = Result.getOrThrow(TypeExpression.toType(integer));
    const first = Result.getOrThrow(TypeExpression.relocate(entry, firstPath));
    const second = Result.getOrThrow(TypeExpression.relocate(same, secondPath));
    expect(compile(first(syntax))).toBe("::first::Pair<String, Integer>");
    expect(compile(second(syntax))).toBe("::second::Pair<String, Integer>");
    expect(compile(entry(syntax))).toBe("Pair<String, Integer>");
  });
});
