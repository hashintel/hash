/** Result types of the built-in signatures. @module */
import { describe, expectTypeOf, test } from "vitest";

import * as Prelude from "./Prelude.js";

import type * as Type from "../Type.js";
import type * as Expression from "./Expression.js";

const { add } = Prelude.builtin.values;

describe("arithmetic", () => {
  test("integer_operands", () => {
    const sum = add(1n, 2n);
    expectTypeOf<
      Expression.Value.Type<typeof sum>
    >().toEqualTypeOf<Type.PrimitiveInteger>();
  });

  test("mixed_operands", () => {
    const first = add(1n, 2);
    const last = add(2, 1n);
    expectTypeOf<
      Expression.Value.Type<typeof first>
    >().toEqualTypeOf<Type.PrimitiveNumber>();
    expectTypeOf<
      Expression.Value.Type<typeof last>
    >().toEqualTypeOf<Type.PrimitiveNumber>();
  });

  test("nested_sum", () => {
    const sum = add(add(1n, 2), 3);
    expectTypeOf<
      Expression.Value.Type<typeof sum>
    >().toEqualTypeOf<Type.PrimitiveNumber>();
  });
});
