import { Result } from "effect";
import { describe, expect, test } from "vitest";

import { Expression, JExpr, Module } from "../main.js";
import * as Operators from "./Operators.js";

import type { Type } from "../main.js";

const kernel = Result.getOrThrow(
  Module.define("::kernel::type", {
    types: { Integer: Module.type<Type.PrimitiveInteger>() },
  }),
);
const integer = kernel.types.Integer;
const compile = (expression: Expression.Any): string =>
  JExpr.compile(Result.getOrThrow(Expression.toJExpr(expression)));

describe("input_composition", () => {
  test("snippet_reuse", () => {
    expect.hasAssertions();
    const snippet = Expression.input("count", integer, Expression.integer(7));
    const comparison = Operators.eq(
      snippet,
      Expression.input("other", integer),
    );
    expect(compile(snippet)).toBe(
      '["::kernel::special_form::input","count","::kernel::type::Integer",{"#literal":7}]',
    );
    expect(compile(comparison)).toBe(
      '["::core::cmp::eq",["::kernel::special_form::input","count","::kernel::type::Integer",{"#literal":7}],["::kernel::special_form::input","other","::kernel::type::Integer"]]',
    );
  });

  test("assumption_syntax", () => {
    expect.hasAssertions();
    const expression = Expression.input("count", integer);
    const assumed = Expression.assume<Type.PrimitiveString>()(expression);
    expect(compile(assumed)).toBe(compile(expression));
  });
});
