import { Result } from "effect";
import { describe, expectTypeOf, test } from "vitest";

import { Module } from "../main.js";
import { Do as EmptyDo, Import, withPrelude } from "./index.js";

import type { Expression, Inputs, Type } from "../main.js";
import type * as ProgramError from "../Program/ProgramError.js";
// oxlint-disable hash/naming-conventions -- examples preserve HashQL type and constructor names in separate callback arguments

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

describe("import_types", () => {
  test("named_exports", () => {
    const result = Do(
      Import((_, { uuid }) => uuid, ["Uuid"]),
      ($, values, types) => {
        expectTypeOf(types.Uuid).toEqualTypeOf<typeof uuid.types.Uuid>();
        expectTypeOf(values.Uuid).toEqualTypeOf<typeof uuid.values.Uuid>();
        // @ts-expect-error Module names do not enter the type universe.
        expectTypeOf(types.uuid);
        // @ts-expect-error Utilities are not a flattened export namespace.
        expectTypeOf($.Uuid);
        return $.ref.uuid.values.Uuid($.literal("id"));
      },
    );
    expectTypeOf(result).toEqualTypeOf<
      Result.Result<
        Expression.Expression<Uuid, Inputs.Empty>,
        ProgramError.Construction
      >
    >();
  });

  test("module_alias", () => {
    Do(
      Import((_, { core }) => core, { uuid: "ids" }),
      Import((_, { ids }) => ids),
      ($, { Uuid }, types) => {
        expectTypeOf($.ref.ids).toEqualTypeOf<typeof uuid>();
        expectTypeOf(types.Uuid).toEqualTypeOf<typeof uuid.types.Uuid>();
        return Uuid($.literal("id"));
      },
    );
  });

  test("invalid_exports", () => {
    expectTypeOf(withPrelude);
    // @ts-expect-error Values must be expression handles.
    withPrelude({ values: { host: 1 } });
    // @ts-expect-error Modules must be module declarations.
    withPrelude({ modules: { uuid: uuid.values.Uuid } });
    // @ts-expect-error Types cannot be value handles.
    withPrelude({ types: { Uuid: uuid.values.Uuid } });
    // @ts-expect-error An import selects a module.
    Import(() => ({ Uuid: uuid.values.Uuid }));
    // @ts-expect-error Selected names must exist in an export universe.
    Import(() => uuid, ["Missing"]);
    // @ts-expect-error Alias sources must exist in an export universe.
    Import(() => uuid, { Missing: "Local" });
  });

  test("literal_types", () => {
    EmptyDo(($) => {
      expectTypeOf($.integer(1)).toEqualTypeOf<
        Expression.Expression<Type.PrimitiveInteger, Inputs.Empty>
      >();
      expectTypeOf($.number(1)).toEqualTypeOf<
        Expression.Expression<Type.PrimitiveNumber, Inputs.Empty>
      >();
      expectTypeOf($.literal(false)).toEqualTypeOf<
        Expression.Expression<Type.PrimitiveBoolean, Inputs.Empty>
      >();
      expectTypeOf($.literal(1)).toEqualTypeOf<
        Expression.Expression<Type.PrimitiveNumber, Inputs.Empty>
      >();
      return $.literal(null);
    });
  });
});
