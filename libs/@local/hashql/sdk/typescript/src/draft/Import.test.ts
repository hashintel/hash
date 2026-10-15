/** Lexical imports preserve selected capabilities and callback boundaries. @module */
import { Result, pipe } from "effect";
import { describe, expect, expectTypeOf, test } from "vitest";

import { Do, Import } from "../do/index.js";
import * as TypeSyntax from "../jexpr/type/index.js";
import { Expression, JExpr, Module, Prelude, TypeExpression } from "../main.js";
import * as Draft from "./index.js";

import type { Inputs, ProgramError, Type } from "../main.js";

const child = Result.getOrThrow(
  Module.define("::leaf", {
    values: { enabled: Module.value<Type.PrimitiveBoolean>() },
  }),
);
const declarations = Result.getOrThrow(
  Module.define("::example", {
    modules: { child },
    types: {
      Whole: Module.type<Type.PrimitiveInteger>(),
      List: Prelude.builtin.types.List,
    },
    values: {
      Whole:
        Module.value<
          Type.Function<readonly [Type.PrimitiveInteger], Type.PrimitiveInteger>
        >(),
    },
  }),
);
const compile = (
  result: Result.Result<Expression.Any, ProgramError.Construction>,
): string =>
  pipe(
    result,
    Result.flatMap(Expression.toJExpr),
    Result.map(JExpr.compile),
    Result.getOrThrow,
  );

describe("draft_import", () => {
  test("selected_capabilities", () => {
    expect.hasAssertions();
    const result = Draft.program({}, ($) => {
      const { Whole, List } = $.import(declarations, ["Whole", "List"]);
      expectTypeOf(Whole(1n)).toEqualTypeOf<
        Expression.Expression<Type.PrimitiveInteger, Inputs.Empty>
      >();
      expectTypeOf(List(String)).toEqualTypeOf<
        TypeExpression.TypeExpression<Type.List<Type.PrimitiveString>>
      >();
      expect(
        TypeSyntax.compile(
          Result.getOrThrow(TypeExpression.toType(List(String))),
        ),
      ).toBe("List<::kernel::type::String>");
      expect(
        TypeSyntax.compile(Result.getOrThrow(TypeExpression.toType(Whole))),
      ).toBe("Whole");
      return Whole(1n);
    });
    expect(compile(result)).toBe(
      '["::kernel::special_form::use","::example",{"#tuple":["Whole","List"]},["Whole",{"#literal":1}]]',
    );
  });

  test("wildcard_and_nested_module", () => {
    expect.hasAssertions();
    const result = Draft.program({}, ($) => {
      const imported = $.import(declarations);
      const { active } = $.import(imported.child, { enabled: "active" });
      expectTypeOf(active).toEqualTypeOf<typeof child.values.enabled>();
      return $.and(active, true);
    });
    expect(compile(result)).toBe(
      '["::kernel::special_form::use","::example","*",["::kernel::special_form::use","child",{"#struct":{"enabled":"active"}},["::core::bool::and","active",{"#literal":true}]]]',
    );
  });

  test("branch_scope", () => {
    expect.hasAssertions();
    const result = Draft.program({}, ($) =>
      $.ifElse(
        true,
        ($) => {
          const { Whole } = $.import(declarations, { Whole: "_" });
          return Whole(1n);
        },
        () => 0n,
      ),
    );
    expect(compile(result)).toBe(
      '["::kernel::special_form::if",{"#literal":true},["::kernel::special_form::use","::example",{"#struct":{"Whole":"Whole"}},["Whole",{"#literal":1}]],{"#literal":0}]',
    );
  });

  test("adapted_callable", () => {
    expect.hasAssertions();
    const original = Expression.fromJExpr<
      Type.Function<readonly [Type.PrimitiveString], Type.PrimitiveString>,
      Inputs.Empty
    >("::original");
    const adapted = Expression.adaptCallable(
      original,
      (self) =>
        (value: {
          readonly text: string;
        }): Expression.Expression<Type.PrimitiveString, Inputs.Empty> =>
          self(value.text),
    );
    const source = Result.getOrThrow(
      Module.define("::adapted", { values: { call: adapted } }),
    );
    const result = Draft.program({}, ($) => {
      const { invoke } = $.import(source, { call: "invoke" });
      expectTypeOf(invoke).toEqualTypeOf(adapted);
      return invoke({ text: "value" });
    });
    expect(compile(result)).toBe(
      '["::kernel::special_form::use","::adapted",{"#struct":{"call":"invoke"}},["invoke",{"#literal":"value"}]]',
    );
    const throughDo = Do(
      Import(() => source, { call: "invoke" }),
      (_, { invoke }) => invoke({ text: "value" }),
    );
    expect(compile(throughDo)).toBe(compile(result));
  });

  test("symbol_alias", () => {
    expect.hasAssertions();
    const result = Draft.program({}, ($) => {
      const imported = $.import(declarations, { Whole: "+" });
      expect(Object.hasOwn(imported, "+")).toBe(true);
      return imported["+"](1n);
    });
    expect(compile(result)).toBe(
      '["::kernel::special_form::use","::example",{"#struct":{"Whole":"`+`"}},["`+`",{"#literal":1}]]',
    );
  });

  test("own_names", () => {
    expect.hasAssertions();
    const values = {
      ["__proto__"]: Expression.literal(true),
      hidden: Expression.literal(false),
    };
    Object.defineProperty(values, "hidden", { enumerable: false });
    const source = Result.getOrThrow(Module.define("::own", { values }));
    const result = Draft.program({}, ($) => {
      const imported = $.import(source);
      expect(Object.hasOwn(imported, "__proto__")).toBe(true);
      expect(Object.hasOwn(imported, "hidden")).toBe(true);
      const { __proto__: prototypeNamed } = imported;
      return $.and(prototypeNamed, imported.hidden);
    });
    expect(compile(result)).toBe(
      '["::kernel::special_form::use","::own","*",["::core::bool::and","__proto__","hidden"]]',
    );
    expect(Object.isFrozen(values)).toBe(false);
  });

  test("repeated_alias", () => {
    expect.hasAssertions();
    const source = Result.getOrThrow(
      Module.define("::aliases", {
        values: {
          first: Module.value<Type.PrimitiveBoolean>(),
          second: Module.value<Type.PrimitiveBoolean>(),
        },
      }),
    );
    const result = Draft.program(
      {},
      ($) =>
        $.import(source, { first: "selected", second: "selected" }).selected,
    );
    expect(compile(result)).toBe(
      '["::kernel::special_form::use","::aliases",{"#struct":{"first":"selected","second":"selected"}},"selected"]',
    );
  });

  test("symbol_selection", () => {
    expect.hasAssertions();
    const hidden = Symbol("hidden");
    const selection = { Whole: "Whole", [hidden]: "hidden" };
    const result = Draft.program({}, ($) => {
      $.import(declarations, selection);
      return $.literal(true);
    });
    expect(result).toMatchObject({
      _tag: "Failure",
      failure: { reason: { _tag: "InvalidImportName", name: String(hidden) } },
    });
  });

  test("invalid_alias", () => {
    expect.hasAssertions();
    let continued = false;
    const result = Draft.program({}, ($) => {
      const { "bad name": whole } = $.import(declarations, {
        Whole: "bad name",
      });
      continued = true;
      return whole(1n);
    });
    expect(result).toMatchObject({
      _tag: "Failure",
      failure: { reason: { _tag: "InvalidImportName", name: "bad name" } },
    });
    expect(continued).toBe(false);
  });

  test("caught_import_failure", () => {
    expect.hasAssertions();
    const result = Draft.program({}, ($) => {
      try {
        $.import(declarations, { Whole: "bad name" });
      } catch {
        /* The collector must still retain this construction failure. */
      }
      return $.literal(true);
    });
    expect(Result.isFailure(result)).toBe(true);
  });

  test("host_exception", () => {
    expect.hasAssertions();
    const error = new Error("host callback");
    expect(() =>
      Draft.program({}, ($) => {
        $.import(declarations);
        throw error;
      }),
    ).toThrow(error);
  });
});
