import { Result } from "effect";
import { describe, expect, test } from "vitest";

import { Expression, JExpr, Let, Module, Program } from "../main.js";

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
    const first = Result.getOrThrow(Program.Do(() => snippet));
    const second = Result.getOrThrow(
      Program.Do(($) => snippet.$.eq($.input("other", integer))),
    );
    expect(compile(first)).toBe(
      '["::kernel::special_form::input","count","::kernel::type::Integer",{"#literal":7}]',
    );
    expect(compile(second)).toBe(
      '["::core::cmp::eq",["::kernel::special_form::input","count","::kernel::type::Integer",{"#literal":7}],["::kernel::special_form::input","other","::kernel::type::Integer"]]',
    );
    expect(compile(snippet)).toBe(compile(first));
  });

  test("discarded_input", () => {
    expect.hasAssertions();
    const expression = Result.getOrThrow(
      Program.Do(($) => {
        $.input("discarded", integer);
        return $.integer(1);
      }),
    );
    expect(compile(expression)).toBe('{"#literal":1}');
  });

  test("unused_initializer", () => {
    expect.hasAssertions();
    const expression = Result.getOrThrow(
      Program.Do(
        Let("unused", ($) => $.input("retained", integer)),
        ($) => $.integer(1),
      ),
    );
    expect(compile(expression)).toBe(
      '["::kernel::special_form::let","unused",["::kernel::special_form::input","retained","::kernel::type::Integer"],{"#literal":1}]',
    );
  });

  test("assumption_syntax", () => {
    expect.hasAssertions();
    const expression = Expression.input("count", integer);
    const assumed = Expression.assume<Type.PrimitiveString>()(expression);
    expect(compile(assumed)).toBe(compile(expression));
  });
});
