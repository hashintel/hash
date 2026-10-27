import { Result } from "effect";
import { describe, expectTypeOf, test } from "vitest";

import * as JExpr from "../JExpr/index.js";
import * as Module from "./Module.js";

import type * as Type from "../Type.js";
import type * as Expression from "./Expression.js";
import type * as Inputs from "./Inputs.js";
import type * as TypeExpression from "./TypeExpression.js";

describe("value_class_relationships", () => {
  test("declaration_covariance", () => {
    const precise = Module.value<Type.PrimitiveInteger>();
    const broad: Module.Declaration.Any = precise;
    expectTypeOf(precise).toExtend<
      Module.Declaration<Expression.Expression.Any>
    >();
    expectTypeOf(broad).toExtend<Module.Declaration.Any>();
    // @ts-expect-error An erased declaration cannot promise an integer expression.
    const reverse: typeof precise = broad;
    expectTypeOf(reverse).toEqualTypeOf<typeof precise>();
  });

  test("precise_module_to_any_and_exact_relocation", () => {
    const precise = Result.getOrThrow(
      Module.define("::precise", {
        types: { Integer: Module.type<Type.PrimitiveInteger>() },
        values: { count: Module.value<Type.PrimitiveInteger>() },
      }),
    );
    const broad: Module.Module.Any = precise;
    expectTypeOf(broad).toExtend<Module.Module<Module.Definition.Any>>();
    expectTypeOf(precise.types.Integer).toEqualTypeOf<
      TypeExpression.TypeExpression<Type.PrimitiveInteger>
    >();
    expectTypeOf(precise.values.count).toEqualTypeOf<
      Expression.Expression<Type.PrimitiveInteger, Inputs.Empty>
    >();
    const rebound = Result.getOrThrow(
      Module.relocate(precise, Result.getOrThrow(JExpr.Path.parse("local"))),
    );
    expectTypeOf(rebound).toEqualTypeOf<typeof precise>();
    expectTypeOf(rebound.types.Integer).not.toExtend<Module.Declaration.Any>();
    // @ts-expect-error Erasing the definition loses the known Integer export.
    const reverse: typeof precise = broad;
    expectTypeOf(reverse).toEqualTypeOf<typeof precise>();
    // @ts-expect-error Relocation must not introduce a string index signature.
    expectTypeOf(rebound.values.absent);
  });

  test("optional_tables_and_empty_module_are_any", () => {
    const definition: {
      readonly types?: {
        readonly Integer: Module.Declaration<
          TypeExpression.TypeExpression<Type.PrimitiveInteger>
        >;
      };
    } = {};
    const optional = Result.getOrThrow(Module.define("::optional", definition));
    expectTypeOf(optional).toExtend<Module.Module.Any>();
    expectTypeOf(optional.types.Integer).toEqualTypeOf<
      TypeExpression.TypeExpression<Type.PrimitiveInteger> | undefined
    >();
    expectTypeOf(
      Result.getOrThrow(Module.define("::empty", {})),
    ).toExtend<Module.Module.Any>();
  });
});
