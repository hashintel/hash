import { Result } from "effect";
import { describe, expectTypeOf, test } from "vitest";

import { Expression, Module } from "../main.js";
import { Do as EmptyDo, Import, Let, Newtype, withPrelude } from "./index.js";

import type { Inputs, Type, TypeExpression } from "../main.js";
import type * as ProgramError from "../Program/ProgramError.js";
// oxlint-disable hash/naming-conventions -- examples preserve HashQL type and constructor names in separate callback arguments

const initialValue = 7;
const kernel = Result.getOrThrow(
  Module.define("::kernel::type", {
    types: {
      Integer: Module.type<Type.PrimitiveInteger>(),
      String: Module.type<Type.PrimitiveString>(),
    },
  }),
);
const { Do, Type: Alias } = withPrelude({ modules: { kernel } });
const firstIdentity: unique symbol = Symbol("first");
const secondIdentity: unique symbol = Symbol("second");

describe("universe_types", () => {
  test("universe_transitions", () => {
    const result = Do(
      Import((_, { kernel }) => kernel),
      Alias("Count", (_, { Integer }) => Integer),
      Newtype("Id", firstIdentity, (_, { Count }) => Count),
      Let("id", ($, { Id }, { Id: idType }) => {
        expectTypeOf(idType).toEqualTypeOf<
          TypeExpression.TypeExpression<
            Type.Opaque<typeof firstIdentity, Type.PrimitiveInteger>
          >
        >();
        return Id($.integer(initialValue));
      }),
      Let("Count", ($, _, types) => {
        expectTypeOf(types.Count).toEqualTypeOf<typeof kernel.types.Integer>();
        return $.literal("value");
      }),
      ($, { id, Count }, types) => {
        expectTypeOf(Count).toEqualTypeOf<
          Expression.Expression<Type.PrimitiveString, Inputs.Empty>
        >();
        expectTypeOf($.ref.kernel).toEqualTypeOf<typeof kernel>();
        expectTypeOf(types.Count).toEqualTypeOf<typeof kernel.types.Integer>();
        // @ts-expect-error Modules are not value bindings.
        expectTypeOf(id.kernel);
        // @ts-expect-error Types cannot act as value expressions.
        Expression.toJExpr(types.Count);
        return id;
      },
    );
    expectTypeOf(result).toEqualTypeOf<
      Result.Result<
        Expression.Expression<
          Type.Opaque<typeof firstIdentity, Type.PrimitiveInteger>,
          Inputs.Empty
        >,
        ProgramError.Construction
      >
    >();
  });

  test("sequential_shadow", () => {
    const result = EmptyDo(
      Let("value", ($) => $.integer(initialValue)),
      Let("copy", (_, { value }) => value),
      Let("value", ($) => $.literal("new")),
      (_, { copy, value }) => {
        expectTypeOf(copy).toEqualTypeOf<
          Expression.Expression<Type.PrimitiveInteger, Inputs.Empty>
        >();
        expectTypeOf(value).toEqualTypeOf<
          Expression.Expression<Type.PrimitiveString, Inputs.Empty>
        >();
        // @ts-expect-error No undeclared bindings.
        expectTypeOf(value.missing);
        return copy;
      },
    );
    expectTypeOf(result).toEqualTypeOf<
      Result.Result<
        Expression.Expression<Type.PrimitiveInteger, Inputs.Empty>,
        ProgramError.Construction
      >
    >();
  });
});

describe("branch_types", () => {
  test("implicit_branch_scope", () => {
    const result = Do(
      Import((_, { kernel }) => kernel),
      Let("outer", ($) => $.integer(initialValue)),
      ($, { outer }) => {
        const branch = $.if(
          $.literal(true),
          () =>
            $.Type("Local", (_, { Integer }) => Integer)
              .Let("inner", ($, { outer }, { Local }) =>
                $.input("value", Local, outer),
              )
              .Let("again", (_, { inner }) => inner)
              .Expr((_, { again }, { Local }) => {
                expectTypeOf(Local).toEqualTypeOf<
                  typeof kernel.types.Integer
                >();
                return again;
              }),
          () =>
            $.Expr((_, values, types) => {
              // @ts-expect-error The sibling branch cannot see the local value.
              expectTypeOf(values.inner);
              // @ts-expect-error The sibling branch cannot see the local type.
              expectTypeOf(types.Local);
              return outer;
            }),
        );
        $.if(
          // @ts-expect-error An integer cannot be a conditional's condition.
          outer,
          () => outer,
          () => outer,
        );
        return branch;
      },
    );
    expectTypeOf(result).toEqualTypeOf<
      Result.Result<
        Expression.Expression<
          Type.PrimitiveInteger,
          { readonly value?: Type.PrimitiveInteger }
        >,
        ProgramError.Construction
      >
    >();
  });

  test("nominal_identity", () => {
    Do(
      Import((_, { kernel }) => kernel),
      Newtype("Id", firstIdentity, (_, { Integer }) => Integer),
      Let("first", ($, { Id }) => Id($.integer(1))),
      Newtype("Id", secondIdentity, (_, { Integer }) => Integer),
      ($, { Id, first }) => {
        const second = Id($.integer(2));
        // @ts-expect-error Same query spelling does not make two nominal types equal.
        const wrong: typeof first = second;
        expectTypeOf(wrong);
        // @ts-expect-error A nominal constructor needs its underlying type.
        Id(first);
        return second;
      },
    );
    // oxlint-disable-next-line typescript/no-inferrable-types -- exercises rejection after losing the unique symbol type
    const unbranded: symbol = Symbol("widened");
    // @ts-expect-error A widened symbol cannot distinguish nominal declarations.
    Newtype("Id", unbranded, () => kernel.types.Integer);
  });
});

describe("composition_types", () => {
  test("eight_steps", () => {
    const result = EmptyDo(
      Let("first", ($) => $.integer(1)),
      Let("second", (_, { first }) => first),
      Let("third", (_, { second }) => second),
      Let("fourth", (_, { third }) => third),
      Let("fifth", (_, { fourth }) => fourth),
      Let("sixth", (_, { fifth }) => fifth),
      Let("seventh", (_, { sixth }) => sixth),
      Let("eighth", (_, { seventh }) => seventh),
      (_, { first, eighth }) => {
        expectTypeOf(first).toEqualTypeOf<typeof eighth>();
        return eighth;
      },
    );
    expectTypeOf(result).toEqualTypeOf<
      Result.Result<
        Expression.Expression<Type.PrimitiveInteger, Inputs.Empty>,
        ProgramError.Construction
      >
    >();
  });

  test("callback_universes", () => {
    Do(
      Alias("Integer", ($, types) => {
        // @ts-expect-error Type callbacks see types, not modules.
        expectTypeOf(types.kernel);
        return $.ref.kernel.types.Integer;
      }),
      Newtype("Id", firstIdentity, (_, { Integer }) => Integer),
      (_, { Id }, { Integer }) => {
        // @ts-expect-error The type alias is not a value expression.
        Id(Integer);
        return Id(
          Expression.fromJExpr<Type.PrimitiveInteger, Inputs.Empty>("free"),
        );
      },
    );
  });
});
