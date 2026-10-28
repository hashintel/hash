import { describe, expectTypeOf, test } from "vitest";

import type * as JExpr from "./index.js";

describe("path_types", () => {
  test("segment_argument_variants", () => {
    expectTypeOf<JExpr.Path.SegmentArgument>().toEqualTypeOf<
      JExpr.Path.GenericArgument | JExpr.Path.GenericConstraint
    >();
    expectTypeOf<
      JExpr.Path.GenericConstraint["name"]
    >().toEqualTypeOf<JExpr.Ident.Ident>();
  });
});
