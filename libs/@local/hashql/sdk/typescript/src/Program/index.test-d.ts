/**
 * Type-level checks for programs.
 *
 * @module
 */
import { describe, expectTypeOf, test } from "vitest";

import type * as Type from "../Type.js";
import type * as Program from "./index.js";

describe("inputs", () => {
  test("union", () => {
    type Choice =
      | Program.Program<Type.PrimitiveInteger, Program.Inputs.Empty>
      | Program.Program<
          Type.PrimitiveInteger,
          { readonly count: Type.PrimitiveInteger }
        >;
    expectTypeOf<Program.Inputs<Choice>>().toEqualTypeOf<
      Program.Expression.Inputs<Choice["root"]>
    >();
    expectTypeOf<Program.Inputs<Choice>>().toEqualTypeOf<{
      readonly count: Type.PrimitiveInteger;
    }>();
  });
});
