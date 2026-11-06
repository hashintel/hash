/**
 * Type-level checks for combining input requirements.
 *
 * @module
 */
import { describe, expectTypeOf, test } from "vitest";

import type * as Type from "../Type.js";
import type * as Inputs from "./Inputs.js";

type UserId = Type.Opaque<"example::UserId", Type.PrimitiveInteger>;

describe("merge", () => {
  test("primitive_conflict", () => {
    expectTypeOf<
      Inputs.Merge<
        { readonly id: Type.PrimitiveInteger },
        { readonly id: Type.PrimitiveString }
      >
    >().toEqualTypeOf<{ readonly id: Type.Never }>();
  });

  test("kind_conflict", () => {
    expectTypeOf<
      Inputs.Merge<
        { readonly id: UserId },
        { readonly id: Type.PrimitiveInteger }
      >
    >().toEqualTypeOf<{
      readonly id: Type.Intersection<readonly [UserId, Type.PrimitiveInteger]>;
    }>();
  });
});
