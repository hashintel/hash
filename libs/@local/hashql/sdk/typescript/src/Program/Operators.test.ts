/** Explicit operator composition and relocation. @module */
// oxlint-disable unicorn/no-array-method-this-argument -- Result.flatMap is not an array method
import { Result, pipe } from "effect";
import { describe, expect, expectTypeOf, test } from "vitest";

import * as Draft from "../draft/index.js";
import { Relocate } from "../internal/relocation.js";
import { Expression, JExpr, Operators, Prelude } from "../main.js";

import type { Type } from "../main.js";

const syntax = (expression: Expression.Any): JExpr.Expression =>
  Result.getOrThrow(Expression.toJExpr(expression));

describe("operators", () => {
  test("composition_forms", () => {
    expect.hasAssertions();
    const count = Expression.input("count", Prelude.builtin.types.Integer);
    const enabled = Expression.input(
      "enabled",
      Prelude.builtin.types.Boolean,
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

  test("context_binding", () => {
    expect.hasAssertions();
    const result = Draft.program({}, ($) => {
      const composed = $.eq(1n, 1n).and($.not(false));
      const bound = $.let("selected", composed);
      expectTypeOf(bound).not.toHaveProperty("and");
      return pipe(bound, $.or(false));
    });
    expect(
      Result.getOrThrow(Result.flatMap(result, Expression.toJExpr)),
    ).toStrictEqual([
      "::kernel::special_form::let",
      "selected",
      [
        "::core::bool::and",
        ["::core::cmp::eq", JExpr.literal(1n), JExpr.literal(1n)],
        ["::core::bool::not", { "#literal": false }],
      ],
      ["::core::bool::or", "selected", { "#literal": false }],
    ]);
  });

  test("relocated_chain", () => {
    expect.hasAssertions();
    const original = Operators.eq(1n, 2n);
    const first = Result.getOrThrow(
      original[Relocate](Result.getOrThrow(JExpr.Path.decodeResult("first"))),
    );
    const second = Result.getOrThrow(
      first[Relocate](Result.getOrThrow(JExpr.Path.decodeResult("second"))),
    );
    expect(syntax(second.and(false))).toStrictEqual([
      "::core::bool::and",
      "second",
      { "#literal": false },
    ]);
    expect(syntax(second.not())).toStrictEqual(["::core::bool::not", "second"]);
    expect(Expression.isExpression(second)).toBe(true);
  });

  test("construction_failure", () => {
    expect.hasAssertions();
    const failure = Operators.eq(Number.POSITIVE_INFINITY, 1).and(true).not();
    expect(Result.isFailure(Expression.toNode(failure))).toBe(true);
  });
});
