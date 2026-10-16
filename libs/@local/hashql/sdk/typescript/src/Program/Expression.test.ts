/**
 * Runtime checks for symbolic calls and property projections.
 *
 * @module
 */
import { Result } from "effect";
import { describe, expect, test } from "vitest";

import * as JExpr from "../JExpr/index.js";
import * as Expression from "./Expression.js";
import * as Module from "./Module.js";

import type * as Type from "../Type/index.js";
import type * as Inputs from "./Inputs.js";

type Vertex = Type.Struct<{ readonly name: Type.PrimitiveString }>;
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

const compile = (expression: Expression.Any): string =>
  JExpr.compile(Result.getOrThrow(Expression.toJExpr(expression)));

// This handwritten declaration targets the standard-library function.
const body = Result.getOrThrow(
  Module.define("::graph::body", {
    values: { filter: Module.value<Type.GenericFunction<Filter>>() },
  }),
);

describe("expression", () => {
  test("generic_filter_call", () => {
    expect.hasAssertions();
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
});
