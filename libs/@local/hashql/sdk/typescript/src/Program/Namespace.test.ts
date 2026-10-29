/**
 * Runtime checks for namespace forwarding and relocation of joined handles.
 *
 * @module
 */
import { Result, flow } from "effect";
import { describe, expect, test } from "vitest";

import { relocate } from "../internal/relocation.js";
import * as JExpr from "../JExpr/index.js";
import * as Expression from "./Expression.js";
import * as Module from "./Module.js";
import * as Namespace from "./Namespace.js";
import * as Structural from "./Structural.js";
import * as TypeExpression from "./TypeExpression.js";

import type * as Type from "../Type.js";

interface List extends Type.TypeConstructor {
  readonly arity: 1;
  readonly type: this["Target"] extends readonly [infer T extends Type.Any]
    ? Type.List<T>
    : Type.Never;
}

interface Pair extends Type.TypeConstructor {
  readonly arity: 2;
  readonly type: this["Target"] extends readonly [
    infer L extends Type.Any,
    infer R extends Type.Any,
  ]
    ? Type.Tuple<readonly [L, R]>
    : Type.Never;
}

const path = flow(JExpr.Path.decodeResult, Result.getOrThrow);
const valueSyntax = flow(Expression.toJExpr, Result.getOrThrow);
const typeSyntax = flow(
  TypeExpression.toType,
  Result.getOrThrow,
  JExpr.Type.compile,
);
const child = Result.getOrThrow(
  Module.define("::child", {
    values: {
      count: Module.value<Type.PrimitiveInteger>(),
      // oxlint-disable-next-line unicorn/no-thenable -- this is a HashQL export name
      then: Module.value<Type.PrimitiveInteger>(),
      $: Module.value<Type.PrimitiveInteger>(),
      name: Module.value<Type.PrimitiveInteger>(),
      length: Module.value<Type.PrimitiveInteger>(),
      prototype: Module.value<Type.PrimitiveInteger>(),
      constructor: Module.value<Type.PrimitiveInteger>(),
      toString: Module.value<Type.PrimitiveInteger>(),
      syntax: Module.value<Type.PrimitiveInteger>(),
      pipe: Module.value<Type.PrimitiveInteger>(),
    },
  }),
);
const source = Result.getOrThrow(
  Module.define("::source", {
    modules: { Both: child },
    types: { Both: Module.genericType<List>(1) },
    values: {
      Both: Module.value<
        Type.Function<readonly [Type.PrimitiveInteger], Type.PrimitiveString>
      >(),
    },
  }),
);

describe("namespace", () => {
  test("joined_dispatch", () => {
    expect.hasAssertions();
    const joined = Namespace.flatten(source).Both;
    expect(joined).toSatisfy(TypeExpression.isConstructor);
    expect(joined).toSatisfy(Expression.isExpression);
    expect(joined).toSatisfy(Module.isModule);
    expect(typeSyntax(joined(Result.getOrThrow(Structural.type(BigInt))))).toBe(
      "::source::Both<::kernel::type::Integer>",
    );
    expect(valueSyntax(joined(1n))).toStrictEqual([
      "::source::Both",
      { "#literal": { _tag: "Integer", value: "1" } },
    ]);
  });

  test("adapted_signatures", () => {
    expect.hasAssertions();
    const list = Result.getOrThrow(
      TypeExpression.constructor<List>(path("::source::List"), 1),
    );
    const fromSyntax = TypeExpression.adaptConstructor(
      list,
      (self) =>
        (
          syntax: JExpr.Type.Type,
        ): TypeExpression.TypeExpression<Type.List<Type.PrimitiveInteger>> =>
          self(TypeExpression.fromType<Type.PrimitiveInteger>(syntax)),
    );
    const deferred = Expression.adaptCallable(
      source.values.Both,
      (self) =>
        (count: () => bigint): Expression.Expression.Any =>
          self(count()),
    );
    const typeOnly = Namespace.combine(child, fromSyntax);
    const valueOnly = Namespace.combine(
      Result.getOrThrow(Structural.type(BigInt)),
      deferred,
    );
    const integer = Result.getOrThrow(
      TypeExpression.toType(Result.getOrThrow(Structural.type(BigInt))),
    );
    expect(typeSyntax(typeOnly(integer))).toBe(
      "::source::List<::kernel::type::Integer>",
    );
    expect(valueSyntax(valueOnly(() => 1n))).toStrictEqual(
      valueSyntax(deferred(() => 1n)),
    );
  });

  test("joined_arity", () => {
    expect.hasAssertions();
    const nullary = Result.getOrThrow(
      Module.define("::nullary", {
        types: {
          Pair: Module.genericType<Pair>(2),
          Unit: Module.genericType<Type.TypeConstructor>(0),
        },
        values: {
          Pair: Module.value<
            Type.Function<readonly [], Type.PrimitiveString>
          >(),
          Unit: Module.value<
            Type.Function<readonly [], Type.PrimitiveString>
          >(),
        },
      }),
    );
    const flat = Namespace.flatten(nullary);
    const pair = flat.Pair();
    expect(pair).not.toSatisfy(TypeExpression.isExport);
    expect(valueSyntax(pair)).toStrictEqual(["::nullary::Pair"]);
    const unit = flat.Unit();
    expect(unit).toSatisfy(TypeExpression.isExport);
    expect(unit).toSatisfy(Expression.isExpression);
  });

  test("joined_relocation", () => {
    expect.hasAssertions();
    const joined = Namespace.flatten(source).Both;
    const moved = Result.getOrThrow(relocate(joined, path("local")));
    expect(typeSyntax(moved(Result.getOrThrow(Structural.type(String))))).toBe(
      "local<::kernel::type::String>",
    );
    expect(valueSyntax(moved(1n))).toStrictEqual([
      "local",
      { "#literal": { _tag: "Integer", value: "1" } },
    ]);
    expect(valueSyntax(moved.count)).toBe("local::count");
  });

  test("repeated_relocation", () => {
    expect.hasAssertions();
    const joined = Namespace.flatten(source).Both;
    const moved = Result.getOrThrow(relocate(joined, path("local")));
    const twice = Result.getOrThrow(relocate(moved, path("again")));
    expect(typeSyntax(twice(Result.getOrThrow(Structural.type(BigInt))))).toBe(
      "again<::kernel::type::Integer>",
    );
    expect(valueSyntax(twice.count)).toBe("again::count");
    expect(valueSyntax(joined.count)).toBe("::child::count");
  });

  test("expression_operations_after_relocation", () => {
    expect.hasAssertions();
    const joined = Namespace.flatten(source).Both;
    const moved = Result.getOrThrow(relocate(joined, path("local")));
    const twice = Result.getOrThrow(relocate(moved, path("again")));
    expect(twice.pipe((value) => value)).toBe(twice);
    expect(valueSyntax(twice.$projectUnsafe("field"))).toStrictEqual([
      "::kernel::special_form::access",
      "again",
      "field",
    ]);
    expect(valueSyntax(twice.$indexUnsafe(0n))).toStrictEqual([
      "::kernel::special_form::index",
      "again",
      { "#literal": { _tag: "Integer", value: "0" } },
    ]);
    expect(valueSyntax(twice.values.pipe)).toBe("again::pipe");
  });

  test("construction_failure_identity", () => {
    expect.hasAssertions();
    const invalid = Expression.number(Infinity);
    const joined = Namespace.combine(
      invalid,
      Result.getOrThrow(Structural.type(Number)),
    );
    const failure = Result.getOrThrow(Result.flip(Expression.toJExpr(invalid)));
    expect(Result.getOrThrow(Result.flip(Expression.toJExpr(joined)))).toBe(
      failure,
    );
    expect(
      Result.getOrThrow(Result.flip(relocate(joined, path("local")))),
    ).toBe(failure);
  });

  test("repeated_constructor_adaptation", () => {
    expect.hasAssertions();
    const constructor = Structural.constructor(
      Result.getOrThrow(
        TypeExpression.constructor<List>(path("::source::List"), 1),
      ),
    );
    const custom = Result.getOrThrow(
      Module.define("::custom", { types: { List: constructor } }),
    );
    const joined = Namespace.flatten(custom).List;
    const moved = Result.getOrThrow(relocate(joined, path("local")));
    const twice = Result.getOrThrow(relocate(moved, path("again")));
    expect(typeSyntax(twice(String))).toBe("again<::kernel::type::String>");
    expect(typeSyntax(joined(BigInt))).toBe(
      "::source::List<::kernel::type::Integer>",
    );
  });

  test("ordinary_then", () => {
    expect.hasAssertions();
    const joined = Namespace.flatten(source).Both;
    expect(joined.then).toBe(child.values.then);
    expect("then" in joined).toBe(true);
    expect(Namespace.modules(source).Both.then).toBe(child.values.then);
    expect(joined.values.$).toBe(child.values.$);
    expect(joined.$).toBe(child.values.$);
  });

  test("function_intrinsics", () => {
    expect.hasAssertions();
    const joined = Namespace.flatten(source).Both;
    expect(joined.name).toBe(child.values.name);
    // oxlint-disable-next-line vitest/prefer-to-have-length -- length holds the declared HashQL export
    expect(joined.length).toBe(child.values.length);
    expect(joined.prototype).toBe(child.values.prototype);
    expect(joined.constructor).toBe(child.values.constructor);
    expect(joined.toString).toBe(child.values.toString);
  });

  test("projection_collision", () => {
    expect.hasAssertions();
    const value = Structural.value<
      Type.Struct<{
        readonly count: Type.PrimitiveString;
        readonly own: Type.PrimitiveBoolean;
      }>
    >()({ count: "shadowed", own: true });
    const joined = Namespace.flatten({
      modules: { Both: child },
      types: { Both: Result.getOrThrow(Structural.type(BigInt)) },
      values: { Both: value },
    }).Both;
    expect(joined.count).toBe(child.values.count);
    expect(typeSyntax(joined)).toBe("::kernel::type::Integer");
    expect(valueSyntax(joined.own)).toStrictEqual(valueSyntax(value.own));
    expect(valueSyntax(joined.$project("count"))).toStrictEqual(
      valueSyntax(value.count),
    );
  });

  test("prototype_names", () => {
    expect.hasAssertions();
    const custom = Result.getOrThrow(
      Module.define("::custom", {
        modules: { ["__proto__"]: child },
        types: { ["__proto__"]: Module.type<Type.PrimitiveInteger>() },
        values: { ["__proto__"]: Module.value<Type.PrimitiveInteger>() },
      }),
    );
    // oxlint-disable-next-line eslint/no-proto -- this is an ordinary HashQL export
    const joined = Namespace.flatten(custom).__proto__;
    expect(joined).toSatisfy(Module.isModule);
    expect(joined).toSatisfy(TypeExpression.isExport);
    expect(joined).toSatisfy(Expression.isExpression);
    expect(joined.count).toBe(child.values.count);
  });

  test("inherited_name", () => {
    expect.hasAssertions();
    const typeOnly = Namespace.flatten({
      modules: {},
      types: { toString: Result.getOrThrow(Structural.type(BigInt)) },
      values: {},
    });
    expect(typeOnly.toString).toSatisfy(TypeExpression.isExport);
    expect(typeOnly.toString).not.toSatisfy(Expression.isExpression);
  });

  test("absent_names", () => {
    expect.hasAssertions();
    const flat = Namespace.flatten({ modules: {}, types: {}, values: {} });
    expect("toString" in flat).toBe(false);
  });

  test("optional_absence", () => {
    expect.hasAssertions();
    const modules: { readonly child?: typeof child } = {};
    const types: {
      readonly Integer?: TypeExpression.TypeExpression<Type.PrimitiveInteger>;
    } = {};
    expect(
      Object.keys(Namespace.flatten({ modules, types, values: {} })),
    ).toStrictEqual([]);
    expect(
      Object.keys(Namespace.modules({ modules, types, values: {} })),
    ).toStrictEqual([]);
  });

  test("nonenumerable_names", () => {
    expect.hasAssertions();
    const types = { Integer: Result.getOrThrow(Structural.type(BigInt)) };
    Object.defineProperty(types, "Integer", { enumerable: false });
    const flat = Namespace.flatten({ modules: {}, types, values: {} });
    expect(Object.keys(flat)).toStrictEqual([]);
  });

  test("joined_failure", () => {
    expect.hasAssertions();
    const failed = Expression.number(Number.NaN);
    const joined = Namespace.combine(
      failed,
      Result.getOrThrow(Structural.type(BigInt)),
    );
    expect(relocate(joined, path("local"))).toMatchObject({ _tag: "Failure" });
  });

  test("module_view_relocation", () => {
    expect.hasAssertions();
    const tree = Result.getOrThrow(
      Module.define("::tree", { modules: { nested: child } }),
    );
    const view = Namespace.modules({
      modules: { tree },
      types: {},
      values: {},
    }).tree;
    const moved = Result.getOrThrow(relocate(view, path("local")));
    expect(valueSyntax(moved.nested.count)).toBe("local::nested::count");
    expect(valueSyntax(moved.modules.nested.values.count)).toBe(
      "local::nested::count",
    );
  });

  test("module_view_inherited_members", () => {
    expect.hasAssertions();
    const tree = Result.getOrThrow(
      Module.define("::tree", { modules: { nested: child } }),
    );
    const view = Namespace.modules({
      modules: { tree },
      types: {},
      values: {},
    }).tree;
    // oxlint-disable-next-line typescript/no-base-to-string -- the default conversion is the behavior under test
    expect(() => String(view)).not.toThrow();
  });

  test("join_order", () => {
    expect.hasAssertions();
    const module = Namespace.modules(source).Both;
    const value = Structural.value<
      Type.Struct<{ readonly count: Type.PrimitiveString }>
    >()({ count: "shadowed" });
    const type = Result.getOrThrow(Structural.type(BigInt));
    const joined = Namespace.combine(Namespace.combine(type, value), module);
    expect(typeSyntax(joined)).toBe("::kernel::type::Integer");
    expect(joined.count).toBe(child.values.count);
    expect(valueSyntax(joined.$project("count"))).toStrictEqual(
      valueSyntax(value.count),
    );
  });
});
