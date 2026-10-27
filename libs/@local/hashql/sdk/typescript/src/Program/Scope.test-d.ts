import { Result, pipe } from "effect";
import { describe, expectTypeOf, test } from "vitest";

import * as Expression from "./Expression.js";
import * as Module from "./Module.js";
import * as Prelude from "./Prelude.js";
import * as Scope from "./Scope.js";
import * as Structural from "./Structural.js";

import type * as Type from "../Type.js";
import type * as Inputs from "./Inputs.js";

describe("scope_merge_types", () => {
  test("namespace_views", () => {
    expectTypeOf<typeof Scope.empty>().toEqualTypeOf<Scope.Scope.Empty>();
    const added = { values: { count: Expression.integer(1) } };
    expectTypeOf(Scope.merge(Scope.empty, added)).toEqualTypeOf<
      Scope.Scope.Merge<Scope.Scope.Empty, typeof added>
    >();
    expectTypeOf<Scope.Scope<typeof added>["values"]>().toEqualTypeOf<
      Readonly<typeof added.values>
    >();
  });

  test("table_types", () => {
    const count = Expression.integer(1);
    const math = Result.getOrThrow(Module.define("::math", {}));
    const added = {
      modules: { math },
      values: { count },
      types: { List: Prelude.builtin.types.List },
    };
    const scoped = Scope.empty.pipe(Scope.merge(added));
    expectTypeOf(scoped.modules.math).toEqualTypeOf<typeof math>();
    expectTypeOf(scoped.values.count).toEqualTypeOf<typeof count>();
    expectTypeOf(scoped.types.List).toEqualTypeOf<typeof added.types.List>();
    expectTypeOf(scoped).toExtend<Scope.Scope.Any>();
    expectTypeOf<Scope.Scope.Any>().not.toExtend<typeof scoped>();
    expectTypeOf<Scope.Definition<typeof scoped>>().toEqualTypeOf<
      Scope.Definition.Base<
        Readonly<typeof added.modules>,
        Readonly<typeof added.values>,
        Readonly<typeof added.types>
      >
    >();
    // @ts-expect-error A frozen scope table cannot be changed through its public type.
    scoped.values.count = count;
    // @ts-expect-error Values are not modules.
    Scope.merge(Scope.empty, { modules: { count } });
    // @ts-expect-error Modules are not value expressions.
    Scope.merge(Scope.empty, { values: { math } });
    // @ts-expect-error A namespace is a table, not one expression.
    Scope.merge(Scope.empty, { values: count });
  });

  test("both_forms", () => {
    const count = Expression.integer(1);
    const before = Scope.merge(Scope.empty, { values: { count } });
    const added = {
      types: { Text: Structural.type(String) },
      values: { count: Expression.literal("new") },
    };
    const direct = Scope.merge(before, added);
    const piped = pipe(before, Scope.merge(added));
    expectTypeOf(piped).toEqualTypeOf<typeof direct>();
    expectTypeOf(piped.values.count).toEqualTypeOf<
      Expression.Expression<Type.PrimitiveString, Inputs.Empty>
    >();
    expectTypeOf(piped.types.Text).toEqualTypeOf<typeof added.types.Text>();
    expectTypeOf(piped.modules).toEqualTypeOf<typeof Scope.empty.modules>();
    // @ts-expect-error An omitted namespace does not introduce arbitrary names.
    expectTypeOf(piped.modules.missing);
  });

  test("optional_replacement", () => {
    const count = Expression.integer(1);
    const before = Scope.merge(Scope.empty, { values: { count } });
    const added: {
      readonly values?: {
        readonly count?: Expression.Expression<
          Type.PrimitiveString,
          Inputs.Empty
        >;
        readonly other?: typeof count;
      };
    } = {};
    const direct = Scope.merge(before, added);
    const piped = pipe(before, Scope.merge(added));
    expectTypeOf(piped).toEqualTypeOf<typeof direct>();
    expectTypeOf(piped.values.count).toEqualTypeOf<
      | typeof count
      | Expression.Expression<Type.PrimitiveString, Inputs.Empty>
      | undefined
    >();
    expectTypeOf(piped.values.other).toEqualTypeOf<typeof count | undefined>();
  });
});
