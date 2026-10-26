/** Operator domains and input inference in both argument orders. @module */
import { pipe } from "effect";
import { describe, expectTypeOf, test } from "vitest";

import * as Expression from "./Expression.js";
import * as Operators from "./Operators.js";
import * as Structural from "./Structural.js";

import type * as Type from "../Type.js";
import type * as Inputs from "./Inputs.js";

describe("operator_types", () => {
  test("operator_domains", () => {
    const count = Expression.input("count", Structural.type(BigInt));
    const other = Expression.input("other", Structural.type(BigInt), 0n);
    const first = Operators.eq(count, other);
    const last = pipe(count, Operators.eq(other));
    expectTypeOf(first).toEqualTypeOf<
      Operators.Predicate<{
        readonly count: Type.PrimitiveInteger;
        readonly other?: Type.PrimitiveInteger;
      }>
    >();
    expectTypeOf(last).toEqualTypeOf(first);
    expectTypeOf(count).not.toHaveProperty("$");
    expectTypeOf(Expression.literal(true)).not.toHaveProperty("and");
    // @ts-expect-error Integer and Number remain distinct in the data-last form.
    pipe(count, Operators.eq(1));
    // @ts-expect-error Negation does not coerce numeric truthiness.
    Operators.not(count);
    // @ts-expect-error A conjunction requires a Boolean left operand.
    pipe(count, Operators.and(true));
    // @ts-expect-error Only an option union admits None checking.
    Operators.isNone(count);
    const left = Symbol("Left");
    const right = Symbol("Right");
    const firstNominal = Expression.fromJExpr<
      Type.Opaque<typeof left, Type.PrimitiveInteger>,
      Inputs.Empty
    >("a");
    const secondNominal = Expression.fromJExpr<
      Type.Opaque<typeof right, Type.PrimitiveInteger>,
      Inputs.Empty
    >("b");
    // @ts-expect-error A pipe cannot equate distinct nominal identities.
    pipe(firstNominal, Operators.eq(secondNominal));
    // @ts-expect-error A fluent predicate still requires Boolean operands.
    first.and(count);
  });
});
