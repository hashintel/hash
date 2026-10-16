/**
 * Static checks for joined capabilities, optional names and relocation.
 *
 * @module
 */
import { Result } from "effect";
import { describe, expectTypeOf, test } from "vitest";

import { relocate } from "../internal/relocation.js";
import * as JExpr from "../JExpr/index.js";
import * as Expression from "./Expression.js";
import * as Module from "./Module.js";
import * as Namespace from "./Namespace.js";
import * as Structural from "./Structural.js";

import type { Inputs, Type, TypeExpression } from "../main.js";

interface List extends Type.TypeConstructor {
  readonly arity: 1;
  readonly type: this["Target"] extends readonly [infer T extends Type.Any]
    ? Type.List<T>
    : Type.Never;
}

const identity = Symbol("Item");
type Item = Type.Opaque<typeof identity, Type.PrimitiveInteger>;
const child = Result.getOrThrow(
  Module.define("::child", {
    values: {
      count: Module.value<Type.PrimitiveInteger>(),
      // oxlint-disable-next-line unicorn/no-thenable -- this is a HashQL export name
      then: Module.value<Type.PrimitiveString>(),
    },
  }),
);
const source = Result.getOrThrow(
  Module.define("::source", {
    modules: { Item: child, List: child },
    types: { Item: Module.type<Item>(), List: Module.genericType<List>(1) },
    values: {
      Item: Module.value<
        Type.Function<readonly [Type.PrimitiveInteger], Item>
      >(),
      List: Module.value<
        Type.Function<readonly [Type.PrimitiveInteger], Type.PrimitiveString>
      >(),
    },
  }),
);
const flat = Namespace.flatten(source);
const path = Result.getOrThrow(JExpr.Path.decodeResult("local"));

describe("namespace_types", () => {
  test("joined_types", () => {
    expectTypeOf(flat.Item(1n)).toEqualTypeOf<
      Expression.Expression<Item, Inputs.Empty>
    >();
    expectTypeOf(flat.Item.count).toEqualTypeOf<typeof child.values.count>();
    expectTypeOf(flat.Item.then).toEqualTypeOf<typeof child.values.then>();
    expectTypeOf(Structural.type(flat.Item)).toEqualTypeOf<
      TypeExpression.TypeExpression<Item>
    >();
    expectTypeOf(flat.List(Structural.type(BigInt))).toEqualTypeOf<
      TypeExpression.TypeExpression<Type.List<Type.PrimitiveInteger>>
    >();
    expectTypeOf(flat.List(1n)).toEqualTypeOf<
      Expression.Expression<Type.PrimitiveString, Inputs.Empty>
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
    expectTypeOf(moved(Structural.type(String))).toEqualTypeOf<
      TypeExpression.TypeExpression<Type.List<Type.PrimitiveString>>
    >();
    expectTypeOf(moved(1n)).toEqualTypeOf<
      Expression.Expression<Type.PrimitiveString, Inputs.Empty>
    >();
    const twice = Result.getOrThrow(relocate(moved, path));
    expectTypeOf(twice).toEqualTypeOf<typeof moved>();
  });

  test("optional_names", () => {
    const types: {
      readonly Maybe?: TypeExpression.TypeExpression<Type.PrimitiveInteger>;
    } = {};
    const modules: { readonly child?: typeof child } = {};
    const optional = Namespace.flatten({ modules, types, values: {} });
    expectTypeOf(optional.Maybe).toEqualTypeOf<
      TypeExpression.TypeExpression<Type.PrimitiveInteger> | undefined
    >();
    expectTypeOf<Pick<typeof optional, "Maybe">>().toEqualTypeOf<
      typeof types
    >();
    // @ts-expect-error Narrow the optional module before reading its members.
    expectTypeOf(optional.child.count);
    const explicit = Namespace.modules({ modules, types: {}, values: {} });
    // @ts-expect-error Explicit module views also preserve optional entries.
    expectTypeOf(explicit.child.count);
    const shared = Namespace.flatten({
      modules: {},
      types,
      values: { Maybe: Expression.integer(1) },
    });
    expectTypeOf(shared.Maybe).not.toBeUndefined();
  });

  test("projection_collision", () => {
    const value = Structural.value<
      Type.Struct<{
        readonly count: Type.PrimitiveString;
        readonly own: Type.PrimitiveBoolean;
      }>
    >()({ count: "shadowed", own: true });
    const joined = Namespace.flatten({
      modules: { Both: child },
      types: { Both: Structural.type(BigInt) },
      values: { Both: value },
    }).Both;
    expectTypeOf(joined.count).toEqualTypeOf<typeof child.values.count>();
    expectTypeOf(joined.own).toEqualTypeOf<
      Expression.Expression<Type.PrimitiveBoolean, Inputs.Empty>
    >();
    expectTypeOf(joined.$project("count")).toEqualTypeOf<
      Expression.Expression<Type.PrimitiveString, Inputs.Empty>
    >();
    expectTypeOf(Structural.type(joined)).toEqualTypeOf<
      TypeExpression.TypeExpression<Type.PrimitiveInteger>
    >();
  });

  test("unpreserved_properties", () => {
    const extended = Object.assign(Structural.type(BigInt), { note: "extra" });
    // @ts-expect-error Rebinding the producer would drop note.
    Namespace.combine(extended, Expression.integer(1));
    Namespace.flatten({
      modules: {},
      // @ts-expect-error A joined namespace must preserve every promised property.
      types: { Both: extended },
      values: { Both: Expression.integer(1) },
    });
    expectTypeOf(extended.note).toEqualTypeOf<string>();
    const optional: { readonly Both?: typeof extended } = {};
    // @ts-expect-error Optional producers must preserve their properties when present.
    Namespace.flatten({ modules: {}, types: optional, values: {} });
  });

  test("input_requirements", () => {
    const input = Expression.input("count", Structural.type(BigInt));
    const joined = Namespace.combine(input, Structural.type(BigInt));
    const moved = Result.getOrThrow(relocate(joined, path));
    expectTypeOf<Expression.Inputs<typeof moved>>().toEqualTypeOf<{
      readonly count: Type.PrimitiveInteger;
    }>();
    // @ts-expect-error Moving a reference does not erase its input requirement.
    const closed: Expression.Expression<Type.PrimitiveInteger, Inputs.Empty> =
      moved;
    expectTypeOf(closed).toEqualTypeOf<
      Expression.Expression<Type.PrimitiveInteger, Inputs.Empty>
    >();
  });
});
