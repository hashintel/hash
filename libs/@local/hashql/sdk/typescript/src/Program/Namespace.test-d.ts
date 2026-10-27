/**
 * Static checks for joined capabilities, optional names and relocation.
 *
 * @module
 */
import { Result } from "effect";
import { describe, expectTypeOf, test } from "vitest";

import { relocate } from "../internal/relocation.js";
import * as JExpr from "../JExpr/index.js";
import * as Program from "./index.js";

import type * as Type from "../Type.js";

interface List extends Type.TypeConstructor {
  readonly arity: 1;
  readonly type: this["Target"] extends readonly [infer T extends Type.Any]
    ? Type.List<T>
    : Type.Never;
}

const identity = Symbol("Item");
type Item = Type.Opaque<typeof identity, Type.PrimitiveInteger>;
const child = Result.getOrThrow(
  Program.Module.define("::child", {
    values: {
      count: Program.Module.value<Type.PrimitiveInteger>(),
      // oxlint-disable-next-line unicorn/no-thenable -- this is a HashQL export name
      then: Program.Module.value<Type.PrimitiveString>(),
    },
  }),
);
const source = Result.getOrThrow(
  Program.Module.define("::source", {
    modules: { Item: child, List: child },
    types: {
      Item: Program.Module.type<Item>(),
      List: Program.Module.genericType<List>(1),
    },
    values: {
      Item: Program.Module.value<
        Type.Function<readonly [Type.PrimitiveInteger], Item>
      >(),
      List: Program.Module.value<
        Type.Function<readonly [Type.PrimitiveInteger], Type.PrimitiveString>
      >(),
    },
  }),
);
const flat = Program.Namespace.flatten(source);
const path = Result.getOrThrow(JExpr.Path.decodeResult("local"));

describe("namespace_types", () => {
  test("joined_types", () => {
    expectTypeOf(flat.Item(1n)).toEqualTypeOf<
      Program.Expression.Expression<Item, Program.Inputs.Empty>
    >();
    expectTypeOf(flat.Item.count).toEqualTypeOf<typeof child.values.count>();
    expectTypeOf(flat.Item.then).toEqualTypeOf<typeof child.values.then>();
    expectTypeOf(flat.Item.pipe(Program.Structural.type)).toEqualTypeOf<
      Program.TypeExpression.TypeExpression<Item>
    >();
    expectTypeOf(flat.List(Program.Structural.type(BigInt))).toEqualTypeOf<
      Program.TypeExpression.TypeExpression<Type.List<Type.PrimitiveInteger>>
    >();
    expectTypeOf(flat.List(1n)).toEqualTypeOf<
      Program.Expression.Expression<Type.PrimitiveString, Program.Inputs.Empty>
    >();
    // @ts-expect-error The value constructor requires Integer.
    flat.Item("wrong");
    // @ts-expect-error No namespace declared this name.
    expectTypeOf(flat.missing);
    // @ts-expect-error Empty type tables do not introduce arbitrary names.
    expectTypeOf(flat.Item.types.missing);
  });

  test("joined_relocation", () => {
    const moved = Result.getOrThrow(relocate(flat.List, path));
    expectTypeOf(moved).toEqualTypeOf<typeof flat.List>();
    expectTypeOf(moved.count).toEqualTypeOf<typeof child.values.count>();
    expectTypeOf(moved(Program.Structural.type(String))).toEqualTypeOf<
      Program.TypeExpression.TypeExpression<Type.List<Type.PrimitiveString>>
    >();
    expectTypeOf(moved(1n)).toEqualTypeOf<
      Program.Expression.Expression<Type.PrimitiveString, Program.Inputs.Empty>
    >();
    const twice = Result.getOrThrow(relocate(moved, path));
    expectTypeOf(twice).toEqualTypeOf<typeof moved>();
  });

  test("optional_names", () => {
    const types: {
      readonly Maybe?: Program.TypeExpression.TypeExpression<Type.PrimitiveInteger>;
    } = {};
    const modules: { readonly child?: typeof child } = {};
    const optional = Program.Namespace.flatten({ modules, types, values: {} });
    expectTypeOf(optional.Maybe).toEqualTypeOf<
      Program.TypeExpression.TypeExpression<Type.PrimitiveInteger> | undefined
    >();
    expectTypeOf<Pick<typeof optional, "Maybe">>().toEqualTypeOf<
      typeof types
    >();
    // @ts-expect-error Narrow the optional module before reading its members.
    expectTypeOf(optional.child.count);
    const explicit = Program.Namespace.modules({
      modules,
      types: {},
      values: {},
    });
    // @ts-expect-error Explicit module views also preserve optional entries.
    expectTypeOf(explicit.child.count);
    const shared = Program.Namespace.flatten({
      modules: {},
      types,
      values: { Maybe: Program.Expression.integer(1) },
    });
    expectTypeOf(shared.Maybe).not.toBeUndefined();
  });

  test("projection_collision", () => {
    const value = Program.Structural.value<
      Type.Struct<{
        readonly count: Type.PrimitiveString;
        readonly own: Type.PrimitiveBoolean;
      }>
    >()({ count: "shadowed", own: true });
    const joined = Program.Namespace.flatten({
      modules: { Both: child },
      types: { Both: Program.Structural.type(BigInt) },
      values: { Both: value },
    }).Both;
    expectTypeOf(joined.count).toEqualTypeOf<typeof child.values.count>();
    expectTypeOf(joined.own).toEqualTypeOf<
      Program.Expression.Expression<Type.PrimitiveBoolean, Program.Inputs.Empty>
    >();
    expectTypeOf(joined.$project("count")).toEqualTypeOf<
      Program.Expression.Expression<Type.PrimitiveString, Program.Inputs.Empty>
    >();
    expectTypeOf(joined.pipe(Program.Structural.type)).toEqualTypeOf<
      Program.TypeExpression.TypeExpression<Type.PrimitiveInteger>
    >();
  });

  test("unpreserved_properties", () => {
    const extended = Object.assign(Program.Structural.type(BigInt), {
      note: "extra",
    });
    // @ts-expect-error Rebinding the producer would drop note.
    Program.Namespace.combine(extended, Program.Expression.integer(1));
    Program.Namespace.flatten({
      modules: {},
      // @ts-expect-error A joined namespace must preserve every promised property.
      types: { Both: extended },
      values: { Both: Program.Expression.integer(1) },
    });
    expectTypeOf(extended.note).toEqualTypeOf<string>();
    const optional: { readonly Both?: typeof extended } = {};
    // @ts-expect-error Optional producers must preserve their properties when present.
    Program.Namespace.flatten({ modules: {}, types: optional, values: {} });
  });

  test("input_requirements", () => {
    const input = Program.Expression.input(
      "count",
      Program.Structural.type(BigInt),
    );
    const joined = Program.Namespace.combine(
      input,
      Program.Structural.type(BigInt),
    );
    const moved = Result.getOrThrow(relocate(joined, path));
    expectTypeOf<
      Program.Expression.Value.Inputs<typeof moved>
    >().toEqualTypeOf<{
      readonly count: Type.PrimitiveInteger;
    }>();
    const projected = moved.$projectUnsafe("field");
    const index = Program.Expression.input(
      "index",
      Program.Structural.type(BigInt),
    );
    const indexed = moved.$indexUnsafe(index);
    expectTypeOf(projected).toEqualTypeOf<
      Program.Expression.Expression<
        Type.Unknown,
        { readonly count: Type.PrimitiveInteger }
      >
    >();
    expectTypeOf<
      Program.Expression.Value.Inputs<typeof indexed>
    >().toEqualTypeOf<{
      readonly count: Type.PrimitiveInteger;
      readonly index: Type.PrimitiveInteger;
    }>();
    expectTypeOf(moved.pipe((value) => value)).toEqualTypeOf<typeof moved>();
    // @ts-expect-error Moving a reference does not erase its input requirement.
    const closed: Program.Expression.Expression<
      Type.PrimitiveInteger,
      Program.Inputs.Empty
    > = moved;
    expectTypeOf(closed).toEqualTypeOf<
      Program.Expression.Expression<Type.PrimitiveInteger, Program.Inputs.Empty>
    >();
  });
});
