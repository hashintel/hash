/**
 * Runtime checks for symbolic calls and property projections.
 *
 * @module
 */
import { Result } from "effect";
import { describe, expect, test } from "vitest";

import * as JExpr from "../JExpr/index.js";
import * as Expression from "./Expression.js";

import type * as Type from "../Type.js";
import type * as Inputs from "./Inputs.js";

type Vertex = Type.Struct<{ readonly name: Type.PrimitiveString }>;
const compile = (expression: Expression.Expression.Any): string =>
  JExpr.compile(Result.getOrThrow(Expression.toJExpr(expression)));

describe("expression", () => {
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
});
