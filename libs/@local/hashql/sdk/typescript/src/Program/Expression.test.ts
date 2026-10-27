/**
 * Runtime checks for symbolic calls and property projections.
 *
 * @module
 */
import { Result, pipe } from "effect";
import { describe, expect, test } from "vitest";

import { relocate } from "../internal/relocation.js";
import * as JExpr from "../JExpr/index.js";
import * as Expression from "./Expression.js";
import * as Module from "./Module.js";
import * as Structural from "./Structural.js";

import type * as Type from "../Type.js";
import type * as Inputs from "./Inputs.js";

type Vertex = Type.Struct<{ readonly name: Type.PrimitiveString }>;
const compile = (value: Expression.Value.Any): string =>
  JExpr.compile(Result.getOrThrow(Expression.toJExpr(value)));
const alias = Result.getOrThrow(JExpr.Path.decodeResult("alias"));
const numberType = Result.getOrThrow(Structural.type(Number));

describe("expression", () => {
  test("generic_filter_call", () => {
    expect.hasAssertions();
    type Graph<T extends Type.Any> = Type.Opaque<
      "::graph::Graph",
      Type.Struct<{ readonly "'marker": T }>
    >;
    type VertexOf<T> = T extends Graph<infer VertexType> ? VertexType : never;
    interface Filter extends Type.FunctionSignature {
      readonly type: this["Target"] extends readonly [infer Input, Type.Any]
        ? Type.Function<
            readonly [
              Graph<VertexOf<Input>>,
              Type.Function<readonly [VertexOf<Input>], Type.PrimitiveBoolean>,
            ],
            Graph<VertexOf<Input>>
          >
        : Type.Function<readonly [never, never], Type.Never>;
    }
    const body = Result.getOrThrow(
      Module.define("::graph::body", {
        values: { filter: Module.value<Type.GenericFunction<Filter>>() },
      }),
    );
    const vertices = Expression.fromJExpr<Graph<Vertex>, Inputs.Empty>(
      "vertices",
    );
    const predicate = Expression.fromJExpr<
      Type.Function<readonly [Vertex], Type.PrimitiveBoolean>,
      Inputs.Empty
    >([
      "::kernel::special_form::fn",
      { "#tuple": [] },
      { "#struct": { vertex: "_" } },
      "_",
      [
        "::core::cmp::eq",
        ["::kernel::special_form::access", "vertex", "name"],
        { "#literal": "Ada" },
      ],
    ]);
    const prelude = { select: body.values.filter };
    expect(compile(prelude.select(vertices, predicate))).toBe(
      '["::graph::body::filter","vertices",["::kernel::special_form::fn",{"#tuple":[]},{"#struct":{"vertex":"_"}},"_",["::core::cmp::eq",["::kernel::special_form::access","vertex","name"],{"#literal":"Ada"}]]]',
    );
  });

  test("returned_function", () => {
    expect.hasAssertions();
    type Unary = Type.Function<
      readonly [Type.PrimitiveInteger],
      Type.PrimitiveInteger
    >;
    const outer = Expression.fromJExpr<
      Type.Function<readonly [], Unary>,
      Inputs.Empty
    >("outer");
    const operand = Expression.fromJExpr<Type.PrimitiveInteger, Inputs.Empty>(
      JExpr.integer(2),
    );
    expect(compile(outer()(operand))).toBe('[["outer"],{"#literal":2}]');
  });

  test("projected_function", () => {
    expect.hasAssertions();
    type Unary = Type.Function<
      readonly [Type.PrimitiveInteger],
      Type.PrimitiveInteger
    >;
    const record = Expression.fromJExpr<
      Type.Struct<{ readonly increment: Unary }>,
      Inputs.Empty
    >("record");
    const operand = Expression.fromJExpr<Type.PrimitiveInteger, Inputs.Empty>(
      JExpr.integer(2),
    );
    expect(compile(record.increment(operand))).toBe(
      '[["::kernel::special_form::access","record","increment"],{"#literal":2}]',
    );
  });

  test("projection_and_index", () => {
    expect.hasAssertions();
    const record = Expression.fromJExpr<
      Type.Struct<{ readonly users: Type.List<Vertex> }>,
      Inputs.Empty
    >("record");
    const index = Expression.fromJExpr<Type.PrimitiveInteger, Inputs.Empty>(
      JExpr.integer(0),
    );
    expect(compile(record.users.$index(index))).toBe(
      '["::kernel::special_form::index",["::kernel::special_form::access","record","users"],{"#literal":0}]',
    );
    expect(compile(record.$project("users"))).toBe(
      '["::kernel::special_form::access","record","users"]',
    );
  });

  test("unsafe_access", () => {
    expect.hasAssertions();
    const value = Expression.fromJExpr<Type.Unknown, Inputs.Empty>("value");
    expect(compile(value.$projectUnsafe("name"))).toBe(
      '["::kernel::special_form::access","value","name"]',
    );
    expect(compile(value.$projectUnsafe(3))).toBe(
      '["::kernel::special_form::access","value",{"#literal":3}]',
    );
    expect(compile(value.$indexUnsafe("key"))).toBe(
      '["::kernel::special_form::index","value",{"#literal":"key"}]',
    );
  });

  test("unsafe_failure", () => {
    expect.hasAssertions();
    const invalid = Expression.number(Number.NaN);
    const value = Expression.fromJExpr<Type.Unknown, Inputs.Empty>("value");
    const failure = Expression.toJExpr(invalid);
    expect(Result.isFailure(failure)).toBe(true);
    expect(Expression.toJExpr(invalid.$projectUnsafe("name"))).toStrictEqual(
      failure,
    );
    expect(Expression.toJExpr(invalid.$indexUnsafe(0n))).toStrictEqual(failure);
    expect(Expression.toJExpr(value.$indexUnsafe(invalid))).toStrictEqual(
      failure,
    );
    expect(Expression.toJExpr(value.$indexUnsafe(Number.NaN))).toStrictEqual(
      failure,
    );
  });

  test("unsafe_position", () => {
    expect.hasAssertions();
    const value = Expression.fromJExpr<Type.Unknown, Inputs.Empty>("value");
    const fraction = Expression.toJExpr(Expression.integer(1.5));
    expect(Result.isFailure(fraction)).toBe(true);
    expect(Expression.toJExpr(value.$projectUnsafe(1.5))).toStrictEqual(
      fraction,
    );
    expect(Expression.toJExpr(value.$projectUnsafe(Number.NaN))).toStrictEqual(
      Expression.toJExpr(Expression.integer(Number.NaN)),
    );
  });

  test("pipe_and_reserved_fields", () => {
    expect.hasAssertions();
    const record = Expression.fromJExpr<
      Type.Struct<{
        readonly pipe: Type.PrimitiveBoolean;
        readonly $projectUnsafe: Type.PrimitiveString;
        readonly $indexUnsafe: Type.PrimitiveInteger;
      }>,
      Inputs.Empty
    >("record");
    expect(record.pipe((value) => value)).toBe(record);
    expect(compile(record.$project("pipe"))).toBe(
      '["::kernel::special_form::access","record","pipe"]',
    );
    expect(compile(record.$project("$projectUnsafe"))).toBe(
      '["::kernel::special_form::access","record","$projectUnsafe"]',
    );
    expect(compile(record.$project("$indexUnsafe"))).toBe(
      '["::kernel::special_form::access","record","$indexUnsafe"]',
    );
  });

  test("conditional_forms", () => {
    expect.hasAssertions();
    const condition = Expression.literal(true);
    const branches = { then: 1n, else: 0n };
    const expected =
      '["::kernel::special_form::if",{"#literal":true},{"#literal":1},{"#literal":0}]';
    expect(compile(Expression.ifElse(condition, branches))).toBe(expected);
    expect(compile(pipe(condition, Expression.ifElse(branches)))).toBe(
      expected,
    );
    expect(compile(condition.pipe(Expression.ifElse(branches)))).toBe(expected);
  });

  test("conditional_failure", () => {
    expect.hasAssertions();
    const invalid = Expression.number(Number.NaN);
    const condition = Expression.assume<Type.PrimitiveBoolean>()(invalid);
    const failure = Expression.toJExpr(invalid);
    expect(Result.isFailure(failure)).toBe(true);
    expect(
      Expression.toJExpr(Expression.ifElse(condition, { then: 1n, else: 0n })),
    ).toStrictEqual(failure);
    expect(
      Expression.toJExpr(
        pipe(false, Expression.ifElse({ then: invalid, else: 0n })),
      ),
    ).toStrictEqual(failure);
    expect(
      Expression.toJExpr(Expression.ifElse(true, { then: 1n, else: invalid })),
    ).toStrictEqual(failure);
  });

  test("reserved_projection", () => {
    expect.hasAssertions();
    const record = Expression.fromJExpr<
      Type.Struct<{ readonly $: Type.PrimitiveBoolean }>,
      Inputs.Empty
    >("record");
    expect(compile(record.$project("$"))).toBe(
      '["::kernel::special_form::access","record","$"]',
    );
  });

  test("callable_properties", () => {
    expect.hasAssertions();
    const record = Expression.fromJExpr<
      Type.Struct<{
        readonly name: Type.PrimitiveString;
        readonly length: Type.PrimitiveInteger;
        readonly then: Type.Function<readonly [], Type.PrimitiveString>;
      }>,
      Inputs.Empty
    >("record");
    expect(compile(record.name)).toBe(
      '["::kernel::special_form::access","record","name"]',
    );
    expect(compile(record.length)).toBe(
      '["::kernel::special_form::access","record","length"]',
    );
    expect(compile(record.$project("then")())).toBe(
      '[["::kernel::special_form::access","record","then"]]',
    );
    const thenField = record.then;
    expect(compile(thenField())).toBe(
      '[["::kernel::special_form::access","record","then"]]',
    );
  });

  describe("adapted", () => {
    const lookup = Expression.fromJExpr<
      Type.Function<readonly [Type.PrimitiveString], Type.PrimitiveString>,
      Inputs.Empty
    >("lookup");
    const trimmed = Expression.adaptCallable(
      lookup,
      (source) =>
        (
          name: string,
        ): Expression.Expression<Type.PrimitiveString, Inputs.Empty> =>
          source(name.trim()),
    );

    test("callable", () => {
      expect.hasAssertions();
      expect(trimmed.pipe((self) => self)).toBe(trimmed);
      expect(compile(trimmed)).toBe('"lookup"');
      expect(compile(trimmed(" Ada "))).toBe('["lookup",{"#literal":"Ada"}]');
    });

    test("relocation", () => {
      expect.hasAssertions();
      const moved = Result.getOrThrow(relocate(trimmed, alias));
      expect(compile(moved)).toBe('"alias"');
      expect(compile(moved(" Ada "))).toBe('["alias",{"#literal":"Ada"}]');
      expect(compile(trimmed(" Ada "))).toBe('["lookup",{"#literal":"Ada"}]');
    });

    test("pass_through", () => {
      expect.hasAssertions();
      const source = Expression.fromJExpr<
        Type.Function<readonly [Type.PrimitiveString], Type.PrimitiveString>,
        Inputs.Empty
      >("lookup");
      // A narrowed view gets the source past the type that refuses an expression, which is how a caller could still hand the source back.
      const same = Expression.adaptCallable(
        source,
        (
          self,
        ): ((
          name: string,
        ) => Expression.Expression<Type.PrimitiveString, Inputs.Empty>) => self,
      );
      expect(same).not.toBe(source);

      const moved = Result.getOrThrow(relocate(same, alias));
      expect(compile(moved("Ada"))).toBe('["alias",{"#literal":"Ada"}]');
      const original = Result.getOrThrow(relocate(source, alias));
      expect(compile(original("Ada"))).toBe('["alias",{"#literal":"Ada"}]');
    });
  });

  describe("primitive", () => {
    test.each([
      [1, '{"#literal":1}'],
      [1n, '{"#literal":1}'],
      [1.5, '{"#literal":1.5}'],
      [9_007_199_254_740_993n, '{"#literal":9007199254740993}'],
      ["identifier", '{"#literal":"identifier"}'],
      [true, '{"#literal":true}'],
      [null, '{"#literal":null}'],
    ] as const)("literal: %s", (value, expected) => {
      expect.hasAssertions();
      expect(compile(Expression.literal(value))).toBe(expected);
      expect(compile(value)).toBe(expected);
    });

    test("function_and_index", () => {
      expect.hasAssertions();
      const call = Expression.fromJExpr<
        Type.Function<
          readonly [Type.PrimitiveNumber, Type.PrimitiveString],
          Type.PrimitiveBoolean
        >,
        Inputs.Empty
      >("check");
      expect(compile(call(1, "name"))).toBe(
        '["check",{"#literal":1},{"#literal":"name"}]',
      );
      const list = Expression.fromJExpr<
        Type.List<Type.PrimitiveString>,
        Inputs.Empty
      >("list");
      expect(compile(list.$index(0n))).toBe(
        '["::kernel::special_form::index","list",{"#literal":0}]',
      );
    });

    test.each([Number.NaN, Infinity, -Infinity])("nonfinite: %s", (value) => {
      expect.hasAssertions();
      for (const expression of [
        Expression.literal(value),
        Expression.input("default", numberType, value),
      ]) {
        const failure = Result.getOrThrow(
          Result.flip(Expression.toJExpr(expression)),
        );
        expect(failure.reason._tag).toBe("InvalidExpression");
      }
    });

    test("both_branches", () => {
      expect.hasAssertions();
      const conditional = Expression.ifElse(true, {
        then: 1,
        else: Number.NaN,
      });
      const failure = Result.getOrThrow(
        Result.flip(Expression.toJExpr(conditional)),
      );
      expect(failure.reason._tag).toBe("InvalidExpression");
    });

    test("assumption_syntax", () => {
      expect.hasAssertions();
      const integer = Expression.literal(7n);
      const number = Expression.assume<Type.PrimitiveNumber>()(integer);
      expect(compile(number)).toBe('{"#literal":7}');
      expect(compile(integer)).toBe(compile(number));
      expect(compile(Expression.assume<Type.PrimitiveNumber>()(7n))).toBe(
        compile(number),
      );
    });
  });
});
