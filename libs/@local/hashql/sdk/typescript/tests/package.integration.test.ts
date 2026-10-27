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
describe("emitted_namespaces", () => {
  test("encoded_view", () => {
    expect.hasAssertions();
    const integer = 42n;
    const encoded: JExpr.Expression.Encoded = Result.getOrThrow(
      SchemaParser.encodeResult(JExpr.Schema)(JExpr.integer(integer)),
    );
    expectTypeOf<JExpr.Expression.Encoded>().toEqualTypeOf<
      (typeof JExpr.Schema)["Encoded"]
    >();
    expectTypeOf<JExpr.Type.Type.Encoded>().toEqualTypeOf<
      (typeof JExpr.Type.Schema)["Encoded"]
    >();
    expect(encoded).toStrictEqual({
      "#literal": { _tag: "Integer", value: "42" },
    });
  });

  test("type_views", () => {
    expect.hasAssertions();
    expectTypeOf<Program.Scope.Scope.Empty>().toEqualTypeOf<
      typeof Program.Scope.empty
    >();
    expectTypeOf<
      Program.Module.Module.Items<typeof Program.Prelude.builtin.modules.math>
    >().toEqualTypeOf<"add">();
    expectTypeOf<
      Type.TypeLambda.Apply<
        Program.Prelude.List,
        readonly [Type.PrimitiveString]
      >
    >().toEqualTypeOf<Type.List<Type.PrimitiveString>>();
    expect(
      Program.ProgramError.Construction.relativeModulePath("core").reason,
    ).toStrictEqual({ _tag: "RelativeModulePath", path: "core" });
  });
});

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
      Program.Expression.Expression.Base<
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
      Program.Expression.Value.Inputs<typeof incremented>
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
      Program.Expression.Value.Type<typeof indexed>
    >().toEqualTypeOf<Type.Unknown>();
    expectTypeOf<
      Program.Expression.Value.Inputs<typeof indexed>
    >().toEqualTypeOf<{
      readonly payload: Type.Unknown;
      readonly count: Type.PrimitiveInteger;
    }>();
    expectTypeOf<
      Program.Expression.Value.Inputs<typeof projected>
    >().toEqualTypeOf<{
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

describe("emitted_structural_operators", () => {
  test("structural_operators", () => {
    expect.hasAssertions();
    const descriptor = Result.getOrThrow(
      Program.Structural.type({
        count: BigInt,
        selected: Boolean,
      }),
    );
    type Row = Type.Struct<{
      readonly count: Type.PrimitiveInteger;
      readonly selected: Type.PrimitiveBoolean;
    }>;
    expectTypeOf(descriptor).toEqualTypeOf<
      Program.TypeExpression.TypeExpression<Row>
    >();
    const count = Expression.input(
      "count",
      Result.getOrThrow(Program.Structural.type(BigInt)),
    );
    const enabled = Expression.input(
      "enabled",
      Result.getOrThrow(Program.Structural.type(Boolean)),
      true,
    );
    const zero = 0n;
    const selected = Program.Operators.eq(count, zero).and(enabled);
    expectTypeOf<
      Program.Structural.Value.Requirements<{
        readonly count: typeof count;
        readonly selected: typeof selected;
      }>
    >().toEqualTypeOf<{
      readonly count: Type.PrimitiveInteger;
      readonly enabled?: Type.PrimitiveBoolean;
    }>();
    const root = Program.Structural.value<Row>()({ count, selected });
    const query = Program.program(root);
    expectTypeOf<Program.Program.Inputs<typeof query>>().toEqualTypeOf<{
      readonly count: Type.PrimitiveInteger;
      readonly enabled?: Type.PrimitiveBoolean;
    }>();
    expectTypeOf<
      Program.Expression.Value.Type<typeof root>
    >().toEqualTypeOf<Row>();
    const structural: Program.Structural.Value.Any = { count, selected };
    expect(Program.Structural.toJExpr(structural)).toStrictEqual(
      Expression.toJExpr(root),
    );
    expect(Result.getOrThrow(Program.compile(query))).toBe(
      '{"#struct":{"count":["::kernel::special_form::input","count","::kernel::type::Integer"],"selected":["::core::bool::and",["::core::cmp::eq",["::kernel::special_form::input","count","::kernel::type::Integer"],{"#literal":0}],["::kernel::special_form::input","enabled","::kernel::type::Boolean",{"#literal":true}]]}}',
    );
    expect(selected.pipe(Program.Operators.not)).toSatisfy(
      Expression.isExpression,
    );
    expect(
      Result.getOrThrow(Expression.toJExpr(selected.$projectUnsafe("field"))),
    ).toStrictEqual([
      "::kernel::special_form::access",
      Result.getOrThrow(Expression.toJExpr(selected)),
      "field",
    ]);
    const indexed = selected.$indexUnsafe(count);
    expectTypeOf<
      Program.Expression.Value.Inputs<typeof indexed>
    >().toEqualTypeOf<{
      readonly count: Type.PrimitiveInteger;
      readonly enabled?: Type.PrimitiveBoolean;
    }>();
    expect(Result.getOrThrow(Expression.toJExpr(indexed))).toStrictEqual([
      "::kernel::special_form::index",
      Result.getOrThrow(Expression.toJExpr(selected)),
      Result.getOrThrow(Expression.toJExpr(count)),
    ]);
  });
});

describe("emitted_structural_constructors", () => {
  test("collections", () => {
    expect.hasAssertions();
    const one = 1n;
    const count = Program.Structural.input("count", BigInt);
    const numbers = Program.Structural.list(BigInt, [count, one]);
    const named = Program.Structural.dict(String, BigInt, [["count", count]]);
    const pair = Program.Structural.tuple(["x", count]);
    const root = Program.Structural.struct({ numbers, named, pair });
    const query = Program.program(root);
    expectTypeOf<Program.Program.Inputs<typeof query>>().toEqualTypeOf<{
      readonly count: Type.PrimitiveInteger;
    }>();
    expectTypeOf<Program.Expression.Value.Type<typeof root>>().toEqualTypeOf<
      Type.Struct<{
        readonly numbers: Type.List<Type.PrimitiveInteger>;
        readonly named: Type.Dict<Type.PrimitiveString, Type.PrimitiveInteger>;
        readonly pair: Type.Tuple<
          readonly [Type.PrimitiveString, Type.PrimitiveInteger]
        >;
      }>
    >();
    expect(Result.getOrThrow(Expression.toJExpr(root))).toMatchObject({
      "#struct": {
        numbers: { "#type": "::kernel::type::List<::kernel::type::Integer>" },
        named: {
          "#type":
            "::kernel::type::Dict<::kernel::type::String, ::kernel::type::Integer>",
        },
      },
    });
    expect(Program.compile(query)).toSatisfy(Result.isSuccess);
  });

  test("structural_default", () => {
    expect.hasAssertions();
    const count = Program.Structural.input("count", BigInt);
    const row = Program.Structural.input("row", { count: BigInt }, { count });
    expectTypeOf<Program.Expression.Value.Inputs<typeof row>>().toEqualTypeOf<{
      readonly row?: Type.Struct<{ readonly count: Type.PrimitiveInteger }>;
      readonly count: Type.PrimitiveInteger;
    }>();
    expect(Result.getOrThrow(Program.compile(Program.program(row)))).toBe(
      '["::kernel::special_form::input","row",{"#struct":{"count":"::kernel::type::Integer"}},{"#struct":{"count":["::kernel::special_form::input","count","::kernel::type::Integer"]}}]',
    );
  });
});

describe("emitted_module_imports", () => {
  test("failure_identity", () => {
    expect.hasAssertions();
    const invalid = Expression.number(Infinity);
    const failure = Result.getOrThrow(Result.flip(Expression.toJExpr(invalid)));
    const source = Result.getOrThrow(
      Program.Module.define("::source", { values: { invalid } }),
    );
    const moved = Program.Module.relocate(
      source,
      Result.getOrThrow(JExpr.Path.decodeResult("local")),
    );
    expect(Result.getOrThrow(Result.flip(moved))).toBe(failure);
    expect(Program.Module.define("relative", {})).toMatchObject({
      _tag: "Failure",
      failure: {
        _tag: "ProgramError/Construction",
        reason: { _tag: "RelativeModulePath", path: "relative" },
      },
    });
  });
});

describe("emitted_program", () => {
  test("metadata", () => {
    expect.hasAssertions();
    const defaultCount = 0n;
    const enabled = Expression.input("enabled", booleanType);
    const count = Expression.input("count", integerType, defaultCount);
    const root = Expression.ifElse(enabled, { then: count, else: 0n });
    const query = Program.program(root);
    interface Requirements {
      readonly enabled: Type.PrimitiveBoolean;
      readonly count?: Type.PrimitiveInteger;
    }
    expectTypeOf(query).toEqualTypeOf<
      Program.Program<Type.PrimitiveInteger, Requirements>
    >();
    expectTypeOf<
      Program.Program.Inputs<typeof query>
    >().toEqualTypeOf<Requirements>();
    expect(query.root).toBe(root);
    expect(Object.isFrozen(query)).toBe(true);
    expectTypeOf(Program.compile(query)).toEqualTypeOf<
      Result.Result<string, Program.ProgramError.Construction>
    >();
  });

  test("compile", () => {
    expect.hasAssertions();
    const greeting = Program.program(Expression.literal("hello"));
    expect(Result.getOrThrow(Program.compile(greeting))).toBe(
      '{"#literal":"hello"}',
    );
    const largeInteger = 9_007_199_254_740_993n;
    const integerProgram = Program.program(Expression.integer(largeInteger));
    expect(Result.getOrThrow(Program.compile(integerProgram))).toBe(
      '{"#literal":9007199254740993}',
    );
  });

  test("construction_failure", () => {
    expect.hasAssertions();
    const invalid = Expression.number(Number.NaN);
    const query = Program.program(invalid);
    const failure = pipe(
      invalid,
      Expression.toJExpr,
      Result.flip,
      Result.getOrThrow,
    );
    expect(pipe(query, Program.compile, Result.flip, Result.getOrThrow)).toBe(
      failure,
    );
  });

  const fraction = 1.5;

  test.each([Number.NaN, Number.POSITIVE_INFINITY, fraction])(
    "projection_key %s",
    (key) => {
      expect.hasAssertions();
      const count = Expression.input("count", integerType);
      const query = Program.program(count.$projectUnsafe(key));
      const failure = pipe(
        query,
        Program.compile,
        Result.flip,
        Result.getOrThrow,
      );
      expect(failure.reason._tag).toBe("InvalidExpression");
    },
  );
});
