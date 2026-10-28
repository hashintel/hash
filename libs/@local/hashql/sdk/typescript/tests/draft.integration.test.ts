import { Result, pipe } from "effect";
import { describe, expect, expectTypeOf, test } from "vitest";

import { Program } from "@local/hashql";
import { program, withPrelude } from "@local/hashql/draft";

import type { Type } from "@local/hashql";

const first = 1n;
const second = 2n;

/** Compiles a program's root to J-Expr text. */
const compile = <T extends Type.Any, I>(
  built: Result.Result<
    Program.Expression.Expression<T, I>,
    Program.ProgramError.Construction
  >,
): string =>
  pipe(
    built,
    Result.flatMap((root) => Program.compile(Program.program(root))),
    Result.getOrThrow,
  );

// Import the package export rather than src so these checks exercise the emitted API.
describe("emitted_draft", () => {
  test("program", () => {
    expect.hasAssertions();
    const built = program({ flag: Boolean }, ($, { flag }) => {
      const Label = $.newtype("Label", { text: String });
      const label = $.let("label", Label({ text: "on" }));
      return $.if(flag, {
        // oxlint-disable-next-line unicorn/no-thenable -- then is the HashQL conditional-branch key
        then: () => label,
        else: () => Label({ text: "off" }),
      });
    });
    expectTypeOf<
      Program.Expression.Value.Inputs<Result.Result.Success<typeof built>>
    >().toEqualTypeOf<{ readonly flag: Type.PrimitiveBoolean }>();
    expect(compile(built)).toBe(
      '["::kernel::special_form::newtype","Label",{"#struct":{"text":"::kernel::type::String"}},["::kernel::special_form::let","label",["Label",{"#struct":{"text":{"#literal":"on"}}}],["::kernel::special_form::if",["::kernel::special_form::input","flag","::kernel::type::Boolean"],"label",["Label",{"#struct":{"text":{"#literal":"off"}}}]]]]',
    );
  });

  test("with_prelude", () => {
    expect.hasAssertions();
    type Add = Type.Function<
      readonly [Type.PrimitiveInteger, Type.PrimitiveInteger],
      Type.PrimitiveInteger
    >;
    const math = Result.getOrThrow(
      Program.Module.define("::core::math", {
        values: { add: Program.Module.value<Add>() },
      }),
    );
    const sum = withPrelude(math).program({}, ($) =>
      $.prelude().add(first, second),
    );
    expect(compile(sum)).toBe(
      '["::core::math::add",{"#literal":1},{"#literal":2}]',
    );
  });
});
