/**
 * Type-level checks for declaration variance.
 *
 * @module
 */
import { describe, expectTypeOf, test } from "vitest";

import * as Declaration from "./Declaration.js";

import type * as Type from "../Type.js";
import type * as Expression from "./Expression.js";

describe("declaration_variance", () => {
  test("declaration_covariance", () => {
    const precise = Declaration.value<Type.PrimitiveInteger>();
    const broad: Declaration.Declaration.Any = precise;
    expectTypeOf(precise).toExtend<
      Declaration.Declaration<Expression.Expression.Any>
    >();
    expectTypeOf(broad).toExtend<Declaration.Declaration.Any>();
    // @ts-expect-error An erased declaration cannot promise an integer expression.
    const reverse: typeof precise = broad;
    expectTypeOf(reverse).toEqualTypeOf<typeof precise>();
  });
});
