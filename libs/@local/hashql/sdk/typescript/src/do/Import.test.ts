// oxlint-disable unicorn/no-array-method-this-argument -- Result.map and Result.flatMap are not array methods
// oxlint-disable vitest/prefer-to-be-truthy -- these checks assert exact Boolean results
// oxlint-disable vitest/prefer-to-be-falsy -- these checks assert exact Boolean results
// oxlint-disable hash/naming-conventions -- examples preserve HashQL type and constructor names in separate callback arguments
import { Result } from "effect";
import { describe, expect, test } from "vitest";

import { Expression, Module, TypeExpression } from "../main.js";
import { Import, Let, withPrelude } from "./index.js";

import type { Type } from "../main.js";

type Uuid = Type.Opaque<"::core::uuid::Uuid", Type.PrimitiveString>;
const uuid = Result.getOrThrow(
  Module.define("::core::uuid", {
    types: { Uuid: Module.type<Uuid>() },
    values: {
      Uuid: Module.value<
        Type.Function<readonly [Type.PrimitiveString], Uuid>
      >(),
    },
  }),
);
const core = Result.getOrThrow(Module.define("::core", { modules: { uuid } }));
const { Do } = withPrelude({ modules: { uuid, core } });

const use = "::kernel::special_form::use";
const shadowValue = 7;

describe("import_exports", () => {
  test("same_named_exports", () => {
    expect.hasAssertions();
    const root = Do(
      Import((_, { uuid }) => uuid),
      ($, { Uuid }, { Uuid: uuidType }) => {
        expect(
          Result.getOrThrow(TypeExpression.toType(uuidType)),
        ).toMatchObject({
          _tag: "Reference",
          path: { rooted: false, segments: [{ value: "Uuid" }] },
        });
        return Uuid($.literal("id"));
      },
    );
    expect(
      Result.getOrThrow(Result.flatMap(root, Expression.toJExpr)),
    ).toStrictEqual([use, "::core::uuid", "*", ["Uuid", { "#literal": "id" }]]);
  });

  test("named_import", () => {
    expect.hasAssertions();
    const root = Do(
      Import((_, { uuid }) => uuid, ["Uuid"]),
      ($, { Uuid }, types) =>
        $.input("id", types.Uuid, Uuid($.literal("fallback"))),
    );
    expect(
      Result.getOrThrow(Result.flatMap(root, Expression.toJExpr)),
    ).toStrictEqual([
      use,
      "::core::uuid",
      { "#tuple": ["Uuid"] },
      [
        "::kernel::special_form::input",
        "id",
        "Uuid",
        ["Uuid", { "#literal": "fallback" }],
      ],
    ]);
  });

  test("renamed_exports", () => {
    expect.hasAssertions();
    const root = Do(
      Import((_, { uuid }) => uuid, { Uuid: "Id" }),
      ($, { Id }, types) => $.input("id", types.Id, Id($.literal("fallback"))),
    );
    expect(
      Result.getOrThrow(Result.flatMap(root, Expression.toJExpr)),
    ).toStrictEqual([
      use,
      "::core::uuid",
      { "#struct": { Uuid: "Id" } },
      [
        "::kernel::special_form::input",
        "id",
        "Id",
        ["Id", { "#literal": "fallback" }],
      ],
    ]);
  });

  test("module_alias", () => {
    expect.hasAssertions();
    const root = Do(
      Import((_, { core }) => core, { uuid: "ids" }),
      Import((_, { ids }) => ids),
      ($, { Uuid }) => Uuid($.literal("id")),
    );
    expect(
      Result.getOrThrow(Result.flatMap(root, Expression.toJExpr)),
    ).toStrictEqual([
      use,
      "::core",
      { "#struct": { uuid: "ids" } },
      [use, "ids", "*", ["Uuid", { "#literal": "id" }]],
    ]);
    const qualified = Do(
      Import((_, { core }) => core, { uuid: "ids" }),
      ($) => $.ref.ids.values.Uuid($.literal("id")),
    );
    expect(
      Result.getOrThrow(Result.flatMap(qualified, Expression.toJExpr)),
    ).toStrictEqual([
      use,
      "::core",
      { "#struct": { uuid: "ids" } },
      ["ids::Uuid", { "#literal": "id" }],
    ]);
  });
});

describe("import_validation", () => {
  test("invalid_alias", () => {
    expect.hasAssertions();
    let called = false;
    const result = Do(
      Import((_, { uuid }) => uuid, { Uuid: "bad name" }),
      ($) => {
        called = true;
        return $.integer(1);
      },
    );
    expect(Result.isFailure(result)).toBe(true);
    expect(called).toBe(false);
  });
});

describe("import_scope", () => {
  test("independent_shadow", () => {
    expect.hasAssertions();
    const root = Do(
      Import((_, { uuid }) => uuid),
      Let("Uuid", ($) => $.integer(shadowValue)),
      ($, { Uuid }, types) => {
        expect(Result.getOrThrow(Expression.toJExpr(Uuid))).toBe("Uuid");
        return $.input("id", types.Uuid);
      },
    );
    expect(
      Result.getOrThrow(Result.flatMap(root, Expression.toJExpr)),
    ).toStrictEqual([
      use,
      "::core::uuid",
      "*",
      [
        "::kernel::special_form::let",
        "Uuid",
        { "#literal": { _tag: "Integer", value: "7" } },
        ["::kernel::special_form::input", "id", "Uuid"],
      ],
    ]);
  });

  test("branch_import_isolation", () => {
    expect.hasAssertions();
    const root = Do(($) =>
      $.if(
        $.literal(true),
        () =>
          $.Import((_, { uuid }) => uuid).Expr(($, { Uuid }) =>
            Uuid($.literal("id")),
          ),
        () =>
          $.Expr(($, values, types) => {
            expect(values).toStrictEqual({});
            expect(types).toStrictEqual({});
            return $.ref.uuid.values.Uuid($.literal("fallback"));
          }),
      ),
    );
    expect(
      Result.getOrThrow(Result.flatMap(root, Expression.toJExpr)),
    ).toStrictEqual([
      "::kernel::special_form::if",
      { "#literal": true },
      [use, "::core::uuid", "*", ["Uuid", { "#literal": "id" }]],
      ["::core::uuid::Uuid", { "#literal": "fallback" }],
    ]);
  });

  test("input_defaults", () => {
    expect.hasAssertions();
    const kernel = Result.getOrThrow(
      Module.define("::kernel::type", {
        types: { Integer: Module.type<Type.PrimitiveInteger>() },
      }),
    );
    const root = withPrelude(kernel).Do(($, _, { Integer }) =>
      $.input("count", Integer, $.integer(0)),
    );
    expect(
      Result.getOrThrow(Result.flatMap(root, Expression.toJExpr)),
    ).toStrictEqual([
      "::kernel::special_form::input",
      "count",
      "::kernel::type::Integer",
      { "#literal": { _tag: "Integer", value: "0" } },
    ]);
  });
});
