import { Inspectable } from "effect";
import { describe, expect, expectTypeOf, test } from "vitest";

import { Program } from "@local/hashql";

const { Scope, Expression, Prelude, Namespace } = Program;

describe("emitted_scope", () => {
  test("protocols_and_names", () => {
    expect.hasAssertions();
    const count = Expression.integer(1);
    const scoped = Scope.empty.pipe(
      Scope.merge({
        modules: { math: Prelude.builtin.modules.math },
        values: { count },
        types: { List: Prelude.builtin.types.List },
      }),
    );
    expectTypeOf(scoped).toExtend<Program.Scope.Scope.Any>();
    expectTypeOf(scoped.values.count).toEqualTypeOf<typeof count>();
    expectTypeOf(scoped.types.List).toEqualTypeOf<
      typeof Prelude.builtin.types.List
    >();
    expectTypeOf(scoped.modules.math).toEqualTypeOf<
      typeof Prelude.builtin.modules.math
    >();
    expect(scoped.pipe((scope) => scope.values.count)).toBe(count);
    expect(Scope.isScope(scoped)).toBe(true);
    expect(scoped[Inspectable.NodeInspectSymbol]()).toStrictEqual(
      scoped.toJSON(),
    );
    expect(Namespace.flatten(scoped).count).toBe(count);
    expect(Namespace.modules(scoped).math).toBeDefined();
  });
});
