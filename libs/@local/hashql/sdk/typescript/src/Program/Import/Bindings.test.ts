import { Result } from "effect";
import { describe, expect, test } from "vitest";

import * as Program from "../index.js";
import * as Bindings from "./Bindings.js";

import type * as Type from "../../Type.js";

const { Expression, Import, Module, Namespace, Prelude, TypeExpression } =
  Program;
const source = Result.getOrThrow(
  Module.define("::source", {
    modules: { Item: Prelude.builtin.modules.math },
    types: { Item: Module.type<Type.PrimitiveInteger>() },
    values: { Item: Module.value<Type.PrimitiveInteger>() },
  }),
);
const separate = Result.getOrThrow(
  Module.define("::separate", {
    types: { Kind: Module.type<Type.PrimitiveInteger>() },
    values: { create: Module.value<Type.PrimitiveInteger>() },
  }),
);
const genericSource = Result.getOrThrow(
  Module.define("::generic", {
    types: { Generic: Prelude.builtin.types.List },
    values: { Generic: Prelude.builtin.modules.cmp.values.eq },
  }),
);
const bindings = Bindings.make<typeof source, "*">({
  modules: source.modules,
  types: source.types,
  values: source.values,
});

/** Reports whether a flattened name is a module, a type and a value. */
const capabilitiesOf = (
  // oxlint-disable-next-line typescript/no-restricted-types -- the guards accept any flattened name
  name: unknown,
): readonly boolean[] => [
  Module.isModule(name),
  TypeExpression.isExport(name),
  Expression.isExpression(name),
];

describe("bindings", () => {
  describe("make", () => {
    test("given_tables", () => {
      expect.hasAssertions();
      expect(bindings.modules).toBe(source.modules);
      expect(bindings.types).toBe(source.types);
      expect(bindings.values).toBe(source.values);
    });

    test("frozen", () => {
      expect.hasAssertions();
      expect(Object.isFrozen(bindings)).toBe(true);
      expect(() => Object.assign(bindings, { values: {} })).toThrow(TypeError);
      expect(() =>
        Object.defineProperty(bindings, "values", { value: {} }),
      ).toThrow(TypeError);
    });
  });

  describe("flatten", () => {
    test("correlated_capabilities", () => {
      expect.hasAssertions();
      const listed = Namespace.flatten(
        Result.getOrThrow(Import.bind(source, ["Item"])).scope,
      );
      expect(Object.keys(listed)).toStrictEqual(["Item"]);
      expect(capabilitiesOf(listed.Item)).toStrictEqual([true, true, true]);
      const aliased = Namespace.flatten(
        Result.getOrThrow(Import.bind(source, { Item: "local" })).scope,
      );
      expect(Object.keys(aliased)).toStrictEqual(["local"]);
      expect(capabilitiesOf(aliased.local)).toStrictEqual([true, true, true]);
    });

    test("generic_correlation", () => {
      expect.hasAssertions();
      const { Generic: generic } = Namespace.flatten(
        Result.getOrThrow(Import.bind(genericSource, ["Generic"])).scope,
      );
      expect(TypeExpression.isConstructor(generic)).toBe(true);
      expect(Expression.isExpression(generic)).toBe(true);
    });

    test("different_sources", () => {
      expect.hasAssertions();
      const kind = Namespace.flatten(
        Result.getOrThrow(Import.bind(separate, { Kind: "local" })).scope,
      );
      expect(capabilitiesOf(kind.local)).toStrictEqual([false, true, false]);
      const create = Namespace.flatten(
        Result.getOrThrow(Import.bind(separate, { create: "local" })).scope,
      );
      expect(capabilitiesOf(create.local)).toStrictEqual([false, false, true]);
    });

    test("independent_optional_exports", () => {
      expect.hasAssertions();
      for (const scope of [
        { types: {}, values: {} },
        { types: { Item: source.types.Item }, values: {} },
        { types: {}, values: { Item: source.values.Item } },
        {
          types: { Item: source.types.Item },
          values: { Item: source.values.Item },
        },
      ]) {
        const expected = [false, "Item" in scope.types, "Item" in scope.values];
        const flat = Namespace.flatten({ modules: {}, ...scope });
        expect(capabilitiesOf(flat.Item)).toStrictEqual(expected);
        const optional = Result.getOrThrow(Module.define("::optional", scope));
        const selected = Namespace.flatten(
          Result.getOrThrow(Import.bind(optional, ["Item"])).scope,
        );
        expect(capabilitiesOf(selected.Item)).toStrictEqual(expected);
      }
    });
  });
});
