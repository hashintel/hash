/**
 * Draft integration checks for flattened prelude and module views.
 *
 * @module
 */
import { Result } from "effect";
import { describe, expect, test } from "vitest";

import { Expression, Module, Structural, TypeExpression } from "../main.js";
import * as Operators from "../program/Operators.js";
import * as Draft from "./index.js";

import type { Type } from "../main.js";

interface List extends Type.TypeConstructor {
  readonly arity: 1;
  readonly type: this["Target"] extends readonly [infer T extends Type.Any]
    ? Type.List<T>
    : Type.Never;
}

const child = Result.getOrThrow(
  Module.define("::child", {
    values: {
      name: Module.value<Type.PrimitiveInteger>(),
      // oxlint-disable-next-line unicorn/no-thenable -- this is a HashQL export name
      then: Module.value<Type.PrimitiveInteger>(),
      $: Module.value<Type.PrimitiveInteger>(),
    },
    types: { ["__proto__"]: Module.type<Type.PrimitiveInteger>() },
  }),
);

describe("draft_namespace", () => {
  test("joined_constructor", () => {
    expect.hasAssertions();
    const custom = Result.getOrThrow(
      Module.define("::custom", {
        types: { Both: Module.genericType<List>(1) },
        modules: { Both: child },
      }),
    );
    const result = Draft.withPrelude(custom).program({}, ($) => {
      const { Both } = $.prelude();
      expect(Both.name).toBe(child.values.name);
      expect(Both).toSatisfy(TypeExpression.isConstructor);
      expect(Both(Structural.type(BigInt))).toSatisfy(TypeExpression.isExport);
      return Both.name;
    });
    expect(result).toSatisfy(Result.isSuccess);
  });

  test("then_export", () => {
    expect.hasAssertions();
    const result = Draft.withPrelude({
      modules: { Both: child },
      values: { Both: Expression.integer(1) },
    }).program({}, ($) => {
      const { Both } = $.prelude();
      expect(Both.then).toBe(child.values.then);
      expect($.modules().Both.then).toBe(child.values.then);
      expect(Both.values.$).toBe(child.values.$);
      expect(Both.$).toBe(child.values.$);
      return Operators.eq(Both, 1n);
    });
    expect(result).toSatisfy(Result.isSuccess);
  });

  test("prototype_type", () => {
    expect.hasAssertions();
    const result = Draft.withPrelude(child).program({}, ($) => {
      // oxlint-disable-next-line eslint/no-proto -- __proto__ names a HashQL type export
      const type = $.prelude().__proto__;
      expect(type).toSatisfy(TypeExpression.isExport);
      return $.literal(true);
    });
    expect(result).toSatisfy(Result.isSuccess);
  });

  test("prototype_join", () => {
    expect.hasAssertions();
    const custom = Result.getOrThrow(
      Module.define("::custom", {
        modules: { ["__proto__"]: child },
        types: { ["__proto__"]: Module.type<Type.PrimitiveInteger>() },
        values: { ["__proto__"]: Module.value<Type.PrimitiveInteger>() },
      }),
    );
    const result = Draft.withPrelude(custom).program({}, ($) => {
      // oxlint-disable-next-line eslint/no-proto -- __proto__ names a HashQL export in all three namespaces
      const entry = $.prelude().__proto__;
      expect(entry).toSatisfy(TypeExpression.isExport);
      expect(entry).toSatisfy(Expression.isExpression);
      expect(entry).toSatisfy(Module.isModule);
      return entry;
    });
    expect(result).toSatisfy(Result.isSuccess);
  });
});
