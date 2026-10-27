import { Equal, Hash, Result } from "effect";
import { describe, expect, test } from "vitest";

import * as JExpr from "../JExpr/index.js";
import * as Module from "./Module.js";
import * as TypeExpression from "./TypeExpression.js";

import type * as Type from "../Type.js";

/** Parses trusted path fixtures. */
const path = (source: string): JExpr.Path.Path =>
  Result.getOrThrow(JExpr.Path.parse(source));

/** Checks the equality/hash implication in both comparison directions. */
const equivalent = (left: Equal.Equal, right: Equal.Equal): void => {
  expect(Equal.equals(left, right)).toBe(true);
  expect(Equal.equals(right, left)).toBe(true);
  expect(Hash.hash(left)).toBe(Hash.hash(right));
};

describe("declaration_protocols", () => {
  test("factory_behavior_not_erased_descriptors", () => {
    expect.hasAssertions();
    const value = Module.value<Type.PrimitiveInteger>();
    equivalent(value, Module.value<Type.PrimitiveString>());
    equivalent(
      Module.type<Type.PrimitiveInteger>(),
      Module.type<Type.PrimitiveString>(),
    );
    equivalent(
      Module.genericType<Type.TypeConstructor>(2),
      Module.genericType<Type.TypeConstructor>(2),
    );
    expect(Equal.equals(value, Module.type<Type.PrimitiveInteger>())).toBe(
      false,
    );
    expect(
      Equal.equals(
        Module.type<Type.PrimitiveInteger>(),
        Module.genericType<Type.TypeConstructor>(0),
      ),
    ).toBe(false);
    expect(
      Equal.equals(
        Module.genericType<Type.TypeConstructor>(1),
        Module.genericType<Type.TypeConstructor>(2),
      ),
    ).toBe(false);
    expect(value.pipe((declaration) => declaration)).toBe(value);
    expect(Object.isFrozen(value)).toBe(true);
  });

  test("arity_validation_still_waits_for_binding", () => {
    expect.hasAssertions();
    const declaration = Module.genericType<Type.TypeConstructor>(-1);
    equivalent(declaration, Module.genericType<Type.TypeConstructor>(-1));
    const result = Module.define("::invalid", {
      types: { Invalid: declaration },
    });
    expect(result).toMatchObject({
      _tag: "Failure",
      failure: { reason: { _tag: "InvalidTypeArity" } },
    });
  });
});

describe("module_protocols", () => {
  test("path_and_all_tables_participate", () => {
    expect.hasAssertions();
    const child = Result.getOrThrow(Module.define("::child", {}));
    const type = TypeExpression.reference<Type.PrimitiveInteger>(
      path("::Integer"),
    );
    const source = Result.getOrThrow(
      Module.define("::source", {
        values: { count: Module.value<Type.PrimitiveInteger>() },
      }),
    );
    const definition = {
      modules: { child },
      types: { Integer: type },
      values: { count: source.values.count },
    };
    const first = Result.getOrThrow(Module.define("::same", definition));
    const second = Result.getOrThrow(Module.define("::same", definition));
    equivalent(first, second);
    expect(first.pipe((module) => module.path)).toBe(first.path);
    expect(Object.isFrozen(first)).toBe(true);
    for (const other of [
      Result.getOrThrow(Module.define("::other", definition)),
      Result.getOrThrow(
        Module.define("::same", { ...definition, modules: {} }),
      ),
      Result.getOrThrow(Module.define("::same", { ...definition, types: {} })),
      Result.getOrThrow(Module.define("::same", { ...definition, values: {} })),
      Result.getOrThrow(
        Module.define("::same", {
          ...definition,
          types: {
            Integer: TypeExpression.reference<Type.PrimitiveInteger>(
              path("::Other"),
            ),
          },
        }),
      ),
    ]) {
      expect(Equal.equals(first, other)).toBe(false);
    }
    expect(first.modules.child).toBe(child);
    expect(first.types.Integer).toBe(type);
    expect(first.values.count).toBe(source.values.count);
  });

  test("all_own_string_keys_and_member_equality", () => {
    expect.hasAssertions();
    const member = TypeExpression.reference<Type.PrimitiveInteger>(
      path("::Integer"),
    );
    const hidden = Object.defineProperty({}, "Hidden", { value: member });
    const first = Result.getOrThrow(
      Module.define("::same", { types: { ["__proto__"]: member, ...hidden } }),
    );
    const hiddenModule = Result.getOrThrow(
      Module.define("::same", { types: hidden }),
    );
    const visibleModule = Result.getOrThrow(
      Module.define("::same", { types: { Hidden: member } }),
    );
    equivalent(hiddenModule, visibleModule);
    expect(Equal.equals(first, hiddenModule)).toBe(false);
    expect(Object.hasOwn(first.types, "__proto__")).toBe(true);
    const fresh = TypeExpression.reference<Type.PrimitiveInteger>(
      path("::Integer"),
    );
    const freshModule = Result.getOrThrow(
      Module.define("::same", { types: { Hidden: fresh } }),
    );
    expect(Equal.equals(hiddenModule, freshModule)).toBe(
      Equal.equals(member, fresh),
    );
  });

  test("relocation_retains_protocols_recursively", () => {
    expect.hasAssertions();
    const child = Result.getOrThrow(
      Module.define("::child", {
        types: { Item: Module.type<Type.PrimitiveInteger>() },
      }),
    );
    const parent = Result.getOrThrow(
      Module.define("::parent", { modules: { child } }),
    );
    const relocated = Result.getOrThrow(Module.relocate(parent, path("local")));
    expect(relocated.pipe((module) => JExpr.Path.compile(module.path))).toBe(
      "local",
    );
    expect(
      relocated.modules.child.pipe((module) => JExpr.Path.compile(module.path)),
    ).toBe("local::child");
    expect(
      [
        relocated.modules.child,
        relocated.modules.child.path,
        relocated.modules.child.path.segments[0],
      ].every(Equal.isEqual),
    ).toBe(true);
    expect(Equal.equals(parent, relocated)).toBe(false);
  });
});
