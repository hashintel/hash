import { Formatter, Inspectable, pipe } from "effect";
import { describe, expect, test } from "vitest";

import * as Expression from "./Expression.js";
import * as Scope from "./Scope.js";

const before = Scope.merge(Scope.empty, {
  values: { count: Expression.integer(1), label: Expression.literal("old") },
});

describe("scope_merge", () => {
  test("pipe", () => {
    expect.hasAssertions();
    const added = { values: { count: Expression.integer(2) } };
    const scoped = Scope.empty.pipe(Scope.merge(added));
    expect(scoped.pipe((scope) => scope.values.count)).toBe(added.values.count);
  });

  test("marker", () => {
    expect.hasAssertions();
    expect(Scope.isScope(before)).toBe(true);
    expect(Scope.isScope(Scope.empty)).toBe(true);
    expect(Scope.isScope({ modules: {}, values: {}, types: {} })).toBe(false);
    expect(Scope.isScope(null)).toBe(false);
  });

  test("inspection", () => {
    expect.hasAssertions();
    expect(before.toJSON()).toStrictEqual({
      modules: Scope.empty.modules,
      values: before.values,
      types: Scope.empty.types,
    });
    expect(before[Inspectable.NodeInspectSymbol]()).toStrictEqual(
      before.toJSON(),
    );
    expect(before.toString()).toBe(Formatter.format(before.toJSON()));
  });

  test("both_forms", () => {
    expect.hasAssertions();
    const added = { values: { count: Expression.literal("replacement") } };
    const direct = Scope.merge(before, added);
    const piped = pipe(before, Scope.merge(added));
    expect(piped.values.count).toBe(direct.values.count);
    expect(direct.values.count).toBe(added.values.count);
    expect(direct.values.label).toBe(before.values.label);
    expect(before.values.count).not.toBe(added.values.count);
  });

  test("snapshots", () => {
    expect.hasAssertions();
    const added = { values: { count: Expression.literal("replacement") } };
    const direct = Scope.merge(before, added);
    expect(Object.isFrozen(added.values)).toBe(false);
    expect(Object.isFrozen(direct.values)).toBe(true);
    expect(Object.isFrozen(direct)).toBe(true);
    expect(direct.values).not.toBe(added.values);
    added.values.count = Expression.literal("later");
    expect(direct.values.count).not.toBe(added.values.count);
  });

  test("empty", () => {
    expect.hasAssertions();
    expect(Object.isFrozen(Scope.empty)).toBe(true);
    expect(Object.isFrozen(Scope.empty.modules)).toBe(true);
    expect(Object.isFrozen(Scope.empty.values)).toBe(true);
    expect(Object.isFrozen(Scope.empty.types)).toBe(true);
  });

  test("own_enumerable_names", () => {
    expect.hasAssertions();
    const replacement = Expression.literal(true);
    const values = { ["__proto__"]: replacement, count: replacement };
    const merged = pipe(before, Scope.merge({ values }));
    expect(merged.values.count).toBe(replacement);
    expect(Object.hasOwn(merged.values, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(merged.values)).toBeNull();
    expect(Object.keys(merged.values)).toStrictEqual([
      "count",
      "label",
      "__proto__",
    ]);
  });

  test("hidden_names", () => {
    expect.hasAssertions();
    const replacement = Expression.literal(true);
    const values = { count: replacement };
    Object.defineProperty(values, "count", { enumerable: false });
    Object.defineProperty(values, "hidden", { value: replacement });
    Object.defineProperty(values, Symbol("symbol"), {
      value: replacement,
      enumerable: true,
    });
    Object.setPrototypeOf(values, { inherited: replacement });
    const merged = Scope.merge(before, { values });
    expect(merged.values.count).toBe(before.values.count);
    expect(Object.getOwnPropertyNames(merged.values)).toStrictEqual([
      "count",
      "label",
    ]);
    expect(Object.getOwnPropertySymbols(merged.values)).toStrictEqual([]);
    expect("inherited" in merged.values).toBe(false);
  });

  test("inherited_names", () => {
    expect.hasAssertions();
    const values: {
      readonly toString?: ReturnType<typeof Expression.number> | undefined;
    } = { toString: undefined };
    expect(Scope.merge(before, { values }).values.toString).toBeUndefined();
    expect("toString" in Scope.empty.values).toBe(false);
  });

  test("absent_optional_replacement", () => {
    expect.hasAssertions();
    const values: { readonly count?: ReturnType<typeof Expression.number> } =
      {};
    expect(Scope.merge(before, { values }).values.count).toBe(
      before.values.count,
    );
    expect(pipe(before, Scope.merge({})).values.count).toBe(
      before.values.count,
    );
  });

  test("undefined_optional_replacement", () => {
    expect.hasAssertions();
    const values: {
      readonly count?: ReturnType<typeof Expression.number> | undefined;
    } = { count: undefined };
    const merged = Scope.merge(before, { values });
    expect(merged.values.count).toBe(before.values.count);
    expect(
      Object.keys(Scope.merge(Scope.empty, { values }).values),
    ).toStrictEqual([]);
  });
});
