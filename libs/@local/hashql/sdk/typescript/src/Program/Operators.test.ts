/** Explicit operator composition and relocation. @module */
import { Result, pipe } from "effect";
import { describe, expect, expectTypeOf, test } from "vitest";

import * as Relocation from "../internal/relocation.js";
import * as JExpr from "../JExpr/index.js";
import * as Expression from "./Expression.js";
import * as Operators from "./Operators.js";
import * as Structural from "./Structural.js";

import type * as Type from "../Type.js";
import type * as Inputs from "./Inputs.js";

type OptionalCount = Type.Union<
  readonly [
    Type.Opaque<"::core::option::Some", Type.PrimitiveInteger>,
    Type.Opaque<"::core::option::None", Type.PrimitiveNull>,
  ]
>;

const syntax = (expression: Expression.Expression.Any): JExpr.Expression =>
  Result.getOrThrow(Expression.toJExpr(expression));
const compile = (value: Expression.Value.Any): string =>
  JExpr.compile(Result.getOrThrow(Expression.toJExpr(value)));

const numberType = Result.getOrThrow(Structural.type(Number));

describe("operators", () => {
  test("composition_forms", () => {
    expect.hasAssertions();
    const count = Expression.input(
      "count",
      Result.getOrThrow(Structural.type(BigInt)),
    );
    const enabled = Expression.input(
      "enabled",
      Result.getOrThrow(Structural.type(Boolean)),
      true,
    );
    const chained = Operators.eq(count, 1n).and(enabled).or(false).not();
    const piped = pipe(
      count,
      Operators.eq(1n),
      Operators.and(enabled),
      Operators.or(false),
      Operators.not,
    );
    const nested = Operators.not(
      Operators.or(Operators.and(Operators.eq(count, 1n), enabled), false),
    );
    expect(syntax(chained)).toStrictEqual(syntax(piped));
    expect(syntax(nested)).toStrictEqual(syntax(chained));
    expect(syntax(chained)).toStrictEqual([
      "::core::bool::not",
      [
        "::core::bool::or",
        [
          "::core::bool::and",
          [
            "::core::cmp::eq",
            [
              "::kernel::special_form::input",
              "count",
              "::kernel::type::Integer",
            ],
            JExpr.literal(1n),
          ],
          [
            "::kernel::special_form::input",
            "enabled",
            "::kernel::type::Boolean",
            { "#literal": true },
          ],
        ],
        { "#literal": false },
      ],
    ]);
    expectTypeOf(chained).toEqualTypeOf<
      Operators.Predicate<{
        readonly count: Type.PrimitiveInteger;
        readonly enabled?: Type.PrimitiveBoolean;
      }>
    >();
    expectTypeOf(piped).toEqualTypeOf(chained);
    expect(Expression.isExpression(chained)).toBe(true);
  });

  test("expression_operations", () => {
    expect.hasAssertions();
    const count = Expression.input(
      "count",
      Result.getOrThrow(Structural.type(BigInt)),
    );
    const position = Expression.input(
      "position",
      Result.getOrThrow(Structural.type(BigInt)),
    );
    const predicate = Operators.eq(count, 1n);
    expect(predicate.pipe((value) => value)).toBe(predicate);
    expect(syntax(predicate.pipe(Operators.not))).toStrictEqual([
      "::core::bool::not",
      syntax(predicate),
    ]);
    expect(syntax(predicate.$projectUnsafe("field"))).toStrictEqual([
      "::kernel::special_form::access",
      syntax(predicate),
      "field",
    ]);
    const indexed = predicate.$indexUnsafe(position);
    expect(syntax(indexed)).toStrictEqual([
      "::kernel::special_form::index",
      syntax(predicate),
      syntax(position),
    ]);
    expectTypeOf<
      Expression.Value.Type<typeof predicate>
    >().toEqualTypeOf<Type.PrimitiveBoolean>();
    expectTypeOf<Expression.Value.Inputs<typeof indexed>>().toEqualTypeOf<{
      readonly count: Type.PrimitiveInteger;
      readonly position: Type.PrimitiveInteger;
    }>();
  });

  test("relocated_chain", () => {
    expect.hasAssertions();
    const original = Operators.eq(1n, 2n);
    const first = Result.getOrThrow(
      original[Relocation.Relocate](
        Result.getOrThrow(JExpr.Path.decodeResult("first")),
      ),
    );
    const second = Result.getOrThrow(
      first[Relocation.Relocate](
        Result.getOrThrow(JExpr.Path.decodeResult("second")),
      ),
    );
    expect(syntax(second.and(false))).toStrictEqual([
      "::core::bool::and",
      "second",
      { "#literal": false },
    ]);
    expect(syntax(second.not())).toStrictEqual(["::core::bool::not", "second"]);
    expect(second.pipe((value) => value)).toBe(second);
    expect(syntax(second.$projectUnsafe("field"))).toStrictEqual([
      "::kernel::special_form::access",
      "second",
      "field",
    ]);
    expect(syntax(second.$indexUnsafe(0n))).toStrictEqual([
      "::kernel::special_form::index",
      "second",
      JExpr.literal(0n),
    ]);
  });

  test("construction_failure", () => {
    expect.hasAssertions();
    const failure = Operators.eq(Number.POSITIVE_INFINITY, 1).and(true).not();
    expect(Result.isFailure(Expression.toNode(failure))).toBe(true);
  });

  test("default_and_boolean_operand", () => {
    expect.hasAssertions();
    const number = Expression.input("number", numberType, 1);
    expect(compile(Operators.and(Operators.eq(number, 2), true))).toBe(
      '["::core::bool::and",["::core::cmp::eq",["::kernel::special_form::input","number","::kernel::type::Number",{"#literal":1}],{"#literal":2}],{"#literal":true}]',
    );
  });

  test.each([Number.NaN, Infinity, -Infinity])("nonfinite: %s", (value) => {
    expect.hasAssertions();
    const number = Expression.input("number", numberType);
    const failure = Result.getOrThrow(
      Result.flip(Expression.toJExpr(Operators.eq(number, value))),
    );
    expect(failure.reason._tag).toBe("InvalidExpression");
  });

  test("none_comparison", () => {
    expect.hasAssertions();
    const count = Expression.fromJExpr<OptionalCount, Inputs.Empty>("count");
    expect(syntax(Operators.isNone(count))).toStrictEqual([
      "::core::cmp::eq",
      "count",
      ["::core::option::None"],
    ]);
  });
});
