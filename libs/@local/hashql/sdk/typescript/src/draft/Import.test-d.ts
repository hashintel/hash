/** Import selections retain names, signatures and input requirements. @module */
import { Result } from "effect";
import { describe, expectTypeOf, test } from "vitest";

import { Expression, Module, Prelude } from "../main.js";
import * as Draft from "./index.js";

import type { Type } from "../main.js";

const integer = Prelude.builtin.types.Integer;
const outside = Expression.input("outside", integer);
const source = Result.getOrThrow(
  Module.define("::requirements", {
    values: { outside },
    types: { Integer: integer },
  }),
);

describe("draft_import_types", () => {
  test("import_names", () => {
    Draft.program({ outside: integer }, ($) => {
      const selected = $.import(source, { outside: "local" });
      expectTypeOf(selected).toHaveProperty("local");
      expectTypeOf(selected).not.toHaveProperty("outside");
      expectTypeOf(selected).not.toHaveProperty("Integer");
      expectTypeOf(selected.local).toEqualTypeOf<typeof outside>();
      // @ts-expect-error An import does not mutate the existing context's prelude type.
      expectTypeOf($.prelude().local);
      // @ts-expect-error A selection must name a declared export.
      $.import(source, ["absent"]);
      // @ts-expect-error Alias sources must name declared exports.
      $.import(source, { absent: "local" });
      return selected.local;
    });
  });

  test("import_requirements", () => {
    // @ts-expect-error Imported handles keep requirements from their declarations.
    Draft.program({}, ($) => $.import(source).outside);
    Draft.program({}, ($) => {
      const imported = $.import(source);
      // @ts-expect-error Discarding an initializer cannot conceal an imported requirement.
      $.let("discarded", imported.outside);
      return $.literal(true);
    });
    const result = Draft.program(
      { outside: integer },
      ($) => $.import(source).outside,
    );
    expectTypeOf<
      Expression.Inputs<Result.Result.Success<typeof result>>
    >().toEqualTypeOf<{ readonly outside: Type.PrimitiveInteger }>();
  });
});
