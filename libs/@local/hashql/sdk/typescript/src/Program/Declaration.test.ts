/**
 * Runtime checks for declaration equality and deferred validation.
 *
 * @module
 */
import { Equal, Hash } from "effect";
import { describe, expect, test } from "vitest";

import * as Declaration from "./Declaration.js";
import * as Module from "./Module.js";

import type * as Type from "../Type.js";

/** Checks the equality/hash implication in both comparison directions. */
const equivalent = (left: Equal.Equal, right: Equal.Equal): void => {
  expect(Equal.equals(left, right)).toBe(true);
  expect(Equal.equals(right, left)).toBe(true);
  expect(Hash.hash(left)).toBe(Hash.hash(right));
};

describe("declaration_protocols", () => {
  test("declaration_equality", () => {
    expect.hasAssertions();
    const value = Declaration.value<Type.PrimitiveInteger>();
    equivalent(value, Declaration.value<Type.PrimitiveString>());
    equivalent(
      Declaration.type<Type.PrimitiveInteger>(),
      Declaration.type<Type.PrimitiveString>(),
    );
    equivalent(
      Declaration.genericType<Type.TypeConstructor>(2),
      Declaration.genericType<Type.TypeConstructor>(2),
    );
    expect(Equal.equals(value, Declaration.type<Type.PrimitiveInteger>())).toBe(
      false,
    );
    expect(
      Equal.equals(
        Declaration.type<Type.PrimitiveInteger>(),
        Declaration.genericType<Type.TypeConstructor>(0),
      ),
    ).toBe(false);
    expect(
      Equal.equals(
        Declaration.genericType<Type.TypeConstructor>(1),
        Declaration.genericType<Type.TypeConstructor>(2),
      ),
    ).toBe(false);
    expect(value.pipe((declaration) => declaration)).toBe(value);
    expect(Object.isFrozen(value)).toBe(true);
  });

  test("deferred_arity_validation", () => {
    expect.hasAssertions();
    const declaration = Declaration.genericType<Type.TypeConstructor>(-1);
    equivalent(declaration, Declaration.genericType<Type.TypeConstructor>(-1));
    const result = Module.define("::invalid", {
      types: { Invalid: declaration },
    });
    expect(result).toMatchObject({
      _tag: "Failure",
      failure: { reason: { _tag: "InvalidTypeArity" } },
    });
  });
});
