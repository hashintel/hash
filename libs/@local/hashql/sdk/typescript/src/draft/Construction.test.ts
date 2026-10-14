/** Boundary and rebinding checks for executed Draft construction. @module */
import { Result, pipe } from "effect";
import { describe, expect, test } from "vitest";

import {
  Expression,
  JExpr,
  Module,
  Structural,
  TypeExpression,
} from "../main.js";
import * as Namespace from "../program/Namespace.js";
import * as Draft from "./index.js";

const integer = Structural.type(BigInt);
const compile = (expression: Expression.Any): string =>
  pipe(
    expression,
    Expression.toJExpr,
    Result.map(JExpr.compile),
    Result.getOrThrow,
  );

describe("draft_construction", () => {
  test("symbol_input", () => {
    expect.hasAssertions();
    const key = Symbol("input");
    let visits = 0;
    const result = Draft.program({ [key]: integer }, ($) => {
      visits += 1;
      return $.literal(true);
    });
    expect(Result.getFailure(result)).toMatchObject({
      _tag: "Some",
      value: { reason: { _tag: "SymbolInputName", name: key } },
    });
    expect(visits).toBe(0);
  });

  test("symbol_export", () => {
    expect.hasAssertions();
    const name = Symbol("export");
    const { program } = Draft.withPrelude({
      values: {
        // @ts-expect-error exercise a symbol export from an unchecked caller
        [name]: Expression.integer(1),
      },
    });
    let visits = 0;
    const result = program({}, ($) => {
      visits += 1;
      return $.literal(true);
    });
    expect(Result.getFailure(result)).toMatchObject({
      _tag: "Some",
      value: { reason: { _tag: "SymbolExportName", name } },
    });
    expect(visits).toBe(0);
  });

  test("input_own_names", () => {
    expect.hasAssertions();
    const schema = { count: integer, ["__proto__"]: integer };
    Object.defineProperty(schema, "count", { enumerable: false });
    const result = Draft.program(schema, ($, inputs) => {
      expect(Object.getPrototypeOf(inputs)).toBe(Object.prototype);
      expect(Object.hasOwn(inputs, "count")).toBe(true);
      $.let("count", inputs.count);
      // oxlint-disable-next-line eslint/no-proto -- this is a declared HashQL input, not the JavaScript prototype accessor
      return inputs.__proto__;
    });
    expect(compile(Result.getOrThrow(result))).toContain('"__proto__"');
  });

  test("prelude_snapshot", () => {
    expect.hasAssertions();
    const first = Expression.integer(1);
    const values = { value: first };
    Object.defineProperty(values, "value", { enumerable: false });
    const { program } = Draft.withPrelude({ values });
    expect(Object.isFrozen(values)).toBe(false);
    values.value = Expression.integer(2);
    const result = program({}, ($) => $.prelude().value);
    expect(compile(Result.getOrThrow(result))).toBe('{"#literal":1}');
  });

  test("nominal_relocation", () => {
    expect.hasAssertions();
    const identity = Symbol("Box");
    const result = Draft.program({}, ($) => {
      const Box = $.newtype("Box", identity, { value: BigInt });
      const module = pipe(
        Module.define("::test", { types: { Box }, values: { Box } }),
        Result.getOrThrow,
      );
      const joined = Namespace.flatten(module).Box;
      const first = pipe(
        joined,
        TypeExpression.relocate(
          Result.getOrThrow(JExpr.Path.decodeResult("::first::Box")),
        ),
        Result.getOrThrow,
      );
      const moved = pipe(
        first,
        TypeExpression.relocate(
          Result.getOrThrow(JExpr.Path.decodeResult("::second::Box")),
        ),
        Result.getOrThrow,
      );
      expect(Expression.isExpression(moved)).toBe(true);
      expect(TypeExpression.isExport(moved)).toBe(true);
      expect(Result.getOrThrow(TypeExpression.toType(moved))).toStrictEqual({
        _tag: "Reference",
        path: Result.getOrThrow(JExpr.Path.decodeResult("::second::Box")),
        generics: [],
      });
      return moved({ value: 2n });
    });
    expect(compile(Result.getOrThrow(result))).toContain(
      '["::second::Box",{"#struct":{"value":{"#literal":2}}}]',
    );
  });
});
