import { Option, Result, SchemaParser, pipe } from "effect";
import { describe, expect, expectTypeOf, test } from "vitest";

import { JExpr, Program } from "@local/hashql";

import type { Type } from "@local/hashql";

const { Expression, TypeExpression } = Program;
const booleanType = TypeExpression.fromType<Type.PrimitiveBoolean>(
  Option.getOrThrow(JExpr.Type.reference("::kernel::type::Boolean")),
);
const integerType = TypeExpression.fromType<Type.PrimitiveInteger>(
  Option.getOrThrow(JExpr.Type.reference("::kernel::type::Integer")),
);

// Import the package export rather than src so these checks exercise the emitted API.
describe("emitted_package", () => {
  test("conditional", () => {
    expect.hasAssertions();
    const enabled = Expression.input("enabled", booleanType);
    const count = Expression.input("count", integerType);
    const selected = pipe(
      enabled,
      Expression.ifElse({ then: count, else: 0n }),
    );
    type Expected = Program.Expression.Expression<
      Type.PrimitiveInteger,
      {
        readonly enabled: Type.PrimitiveBoolean;
        readonly count: Type.PrimitiveInteger;
      }
    >;
    expectTypeOf(selected).toEqualTypeOf<Expected>();
    expectTypeOf(selected).toEqualTypeOf<
      Program.Expression.Expression.Shape<
        Type.PrimitiveInteger,
        {
          readonly enabled: Type.PrimitiveBoolean;
          readonly count: Type.PrimitiveInteger;
        }
      >
    >();
    expect(JExpr.compile(Result.getOrThrow(Expression.toJExpr(selected)))).toBe(
      '["::kernel::special_form::if",["::kernel::special_form::input","enabled","::kernel::type::Boolean"],["::kernel::special_form::input","count","::kernel::type::Integer"],{"#literal":0}]',
    );
    expect(
      Expression.toJExpr(
        enabled.pipe(Expression.ifElse({ then: count, else: 0n })),
      ),
    ).toStrictEqual(Expression.toJExpr(selected));
  });

  test("call_requirements", () => {
    expect.hasAssertions();
    const count = Expression.input("count", integerType);
    const increment = Expression.fromJExpr<
      Type.Function<readonly [Type.PrimitiveInteger], Type.PrimitiveInteger>,
      Program.Inputs.Empty
    >("increment");
    const incremented = increment(count);
    expectTypeOf<
      Program.Expression.Inputs<typeof incremented>
    >().toEqualTypeOf<{
      readonly count: Type.PrimitiveInteger;
    }>();
    expect(
      JExpr.compile(Result.getOrThrow(Expression.toJExpr(incremented))),
    ).toBe(
      '["increment",["::kernel::special_form::input","count","::kernel::type::Integer"]]',
    );
  });

  test("unsafe_access", () => {
    expect.hasAssertions();
    const receiver = Expression.fromJExpr<
      Type.Unknown,
      { readonly payload: Type.Unknown }
    >("payload");
    const count = Expression.input("count", integerType);
    const projected = receiver.$projectUnsafe("name");
    const indexed = receiver.$indexUnsafe(count);
    expectTypeOf<
      Program.Expression.TypeOf<typeof indexed>
    >().toEqualTypeOf<Type.Unknown>();
    expectTypeOf<Program.Expression.Inputs<typeof indexed>>().toEqualTypeOf<{
      readonly payload: Type.Unknown;
      readonly count: Type.PrimitiveInteger;
    }>();
    expectTypeOf<Program.Expression.Inputs<typeof projected>>().toEqualTypeOf<{
      readonly payload: Type.Unknown;
    }>();
    expect(
      JExpr.compile(Result.getOrThrow(Expression.toJExpr(projected))),
    ).toBe('["::kernel::special_form::access","payload","name"]');
    expect(receiver.pipe((value) => value)).toBe(receiver);
  });

  test.each([
    "account",
    "`+`",
    "`https://example.com/types/entity-type/account/`",
  ])("identifier %s", (source) => {
    expect.hasAssertions();
    const ident = Result.getOrThrow(
      SchemaParser.decodeResult(JExpr.Ident.Schema)(source),
    );
    expectTypeOf(ident).toEqualTypeOf<JExpr.Ident.Ident>();
    expect(JExpr.Ident.compile(ident)).toBe(source);
  });
});
