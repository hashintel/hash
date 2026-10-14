/** Type relationships across Draft construction and its explicit-input boundary. @module */
import { Result } from "effect";
import { describe, expectTypeOf, test } from "vitest";

import {
  Expression,
  JExpr,
  Module,
  Structural,
  TypeExpression,
} from "../main.js";
import * as Namespace from "../program/Namespace.js";
import * as Scope from "../program/Scope.js";
import * as Draft from "./index.js";

import type { Inputs, Type } from "../main.js";
import type * as Context from "./Context.js";

const integer = Structural.type(BigInt);
const outside = Expression.input("outside", integer);
const unrestricted = (
  $: Context.Context<Scope.Empty>,
): Expression.Expression<Type.PrimitiveBoolean, Inputs.Empty> => {
  expectTypeOf($.let("outside", outside)).toEqualTypeOf<
    Expression.Expression<
      Type.PrimitiveInteger,
      { readonly outside: Type.PrimitiveInteger }
    >
  >();
  return $.literal(true);
};
const optionalPrelude = (): {
  readonly types?: { readonly Integer: typeof integer };
} => ({ types: { Integer: integer } });

const optionalValue = (): {
  readonly value?: Expression.Expression<Type.PrimitiveBoolean, Inputs.Empty>;
} => ({});

describe("construction_types", () => {
  test("optional_override", () => {
    const base = Scope.merge(Scope.empty, {
      values: { value: Expression.integer(1) },
    });
    const merged = Scope.merge(base, { values: optionalValue() });
    expectTypeOf(merged.values.value).toEqualTypeOf<
      | Expression.Expression<Type.PrimitiveBoolean, Inputs.Empty>
      | Expression.Expression<Type.PrimitiveInteger, Inputs.Empty>
      | undefined
    >();
  });

  test("policy_separation", () => {
    // @ts-expect-error an unrestricted helper can hide inputs in discarded declarations
    Draft.withPrelude({}).program({}, unrestricted);
    expectTypeOf(unrestricted);
  });

  test("optional_namespace", () => {
    Draft.withPrelude(optionalPrelude()).program({}, ($) => {
      expectTypeOf($.prelude().Integer).toEqualTypeOf<
        typeof integer | undefined
      >();
      expectTypeOf($.prelude()).not.toHaveProperty("Missing");
      return $.literal(true);
    });
  });

  test("nominal_rebinding", () => {
    const identity = Symbol("Box");
    Draft.program({ outside: integer }, ($) => {
      const Box = $.newtype("Box", identity, { value: BigInt });
      expectTypeOf<Expression.TypeOf<typeof Box>>().toEqualTypeOf<
        Type.Function<
          readonly [Type.Struct<{ readonly value: Type.PrimitiveInteger }>],
          Type.Opaque<
            typeof identity,
            Type.Struct<{ readonly value: Type.PrimitiveInteger }>
          >
        >
      >();
      type Constructor = Type.Function<
        readonly [Type.Struct<{ readonly value: Type.PrimitiveInteger }>],
        Type.Opaque<
          typeof identity,
          Type.Struct<{ readonly value: Type.PrimitiveInteger }>
        >
      >;
      const bound = $.let("constructor", Box);
      expectTypeOf<
        Expression.TypeOf<typeof bound>
      >().toEqualTypeOf<Constructor>();
      const pass = Expression.fromJExpr<
        Type.Function<readonly [Constructor], Constructor>,
        Inputs.Empty
      >("::test::pass");
      const passed = pass(Box);
      expectTypeOf<
        Expression.TypeOf<typeof passed>
      >().toEqualTypeOf<Constructor>();
      const module = Result.getOrThrow(
        Module.define("::test", { types: { Box }, values: { Box } }),
      );
      const names = Namespace.flatten(module);
      const moved = Result.getOrThrow(
        TypeExpression.relocate(
          names.Box,
          Result.getOrThrow(JExpr.Path.decodeResult("::local::Box")),
        ),
      );
      const value = moved({ value: outside });
      expectTypeOf<Expression.TypeOf<typeof value>>().toEqualTypeOf<
        Type.Opaque<
          typeof identity,
          Type.Struct<{ readonly value: Type.PrimitiveInteger }>
        >
      >();
      expectTypeOf<Expression.Inputs<typeof value>>().toEqualTypeOf<{
        readonly outside: Type.PrimitiveInteger;
      }>();
      // @ts-expect-error rebinding must not widen nominal structure
      moved({ value: "wrong" });
      return value;
    });
  });
});
