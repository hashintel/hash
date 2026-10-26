import { Result } from "effect";
import { describe, expect, test } from "vitest";

import * as JExpr from "../JExpr/index.js";
import * as Expression from "./Expression.js";
import * as Operators from "./Operators.js";
import * as Structural from "./Structural.js";

import type * as Type from "../Type.js";
import type * as Inputs from "./Inputs.js";

const compile = (value: Expression.Value.Any): string =>
  JExpr.compile(Result.getOrThrow(Expression.toJExpr(value)));

const numberType = Structural.type(Number);

describe("primitive_lowering", () => {
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

  test("default_and_boolean_operand", () => {
    expect.hasAssertions();
    const number = Expression.input("number", numberType, 1);
    expect(compile(Operators.and(Operators.eq(number, 2), true))).toBe(
      '["::core::bool::and",["::core::cmp::eq",["::kernel::special_form::input","number","::kernel::type::Number",{"#literal":1}],{"#literal":2}],{"#literal":true}]',
    );
  });
});

describe("primitive_failures", () => {
  test.each([Number.NaN, Infinity, -Infinity])("nonfinite: %s", (value) => {
    expect.hasAssertions();
    const number = Expression.input("number", numberType);
    for (const expression of [
      Expression.literal(value),
      Operators.eq(number, value),
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
      // oxlint-disable-next-line unicorn/no-thenable -- this property holds a conditional branch
      then: 1,
      else: Number.NaN,
    });
    const failure = Result.getOrThrow(
      Result.flip(Expression.toJExpr(conditional)),
    );
    expect(failure.reason._tag).toBe("InvalidExpression");
  });

  test("assumption_preserves_syntax", () => {
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
