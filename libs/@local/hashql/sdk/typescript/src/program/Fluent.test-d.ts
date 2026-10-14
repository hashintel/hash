import { describe, expectTypeOf, test } from "vitest";

import { Do as EmptyDo, withPrelude } from "../do/index.js";
import { Expression } from "../main.js";

import type { Type } from "../main.js";
import type * as Inputs from "./Inputs.js";
import type * as ProgramError from "./ProgramError.js";
import type { Result } from "effect";

type Vertex = Type.Struct<{ readonly enabled: Type.PrimitiveBoolean }>;
type Graph = Type.Opaque<
  "::graph::Graph",
  Type.Struct<{ readonly "'marker": Vertex }>
>;

describe("fluent_types", () => {
  test("graph_vertex", () => {
    const { Do } = withPrelude({
      values: {
        entities: Expression.fromJExpr<
          Type.Function<readonly [], Graph>,
          Inputs.Empty
        >("entities"),
      },
    });
    const result = Do(($) =>
      $.query
        .entities()
        .filter("item", (item) => {
          expectTypeOf(item).toEqualTypeOf<
            Expression.Expression<Vertex, Inputs.Empty>
          >();
          return item.enabled.$.isFalse();
        })
        .collect(),
    );
    expectTypeOf(result).toEqualTypeOf<
      Result.Result<
        Expression.Expression<Type.List<Vertex>, Inputs.Empty>,
        ProgramError.Construction
      >
    >();
    Do(($) => {
      // @ts-expect-error A predicate must return a Boolean.
      $.query.entities().filter("item", (item) => item);
      // @ts-expect-error Query construction has no compatibility adapter.
      expectTypeOf($.query.from);
      return $.literal(true);
    });
  });

  test("operation_domains", () => {
    EmptyDo(($) => {
      const integer = $.integer(1);
      expectTypeOf(integer).toEqualTypeOf<
        Expression.Expression<Type.PrimitiveInteger, Inputs.Empty>
      >();
      // @ts-expect-error Boolean operations do not belong to an integer.
      expectTypeOf(integer.$.and);
      // @ts-expect-error Graph operations do not belong to an integer.
      expectTypeOf(integer.$.collect);
      // @ts-expect-error An integer is not optional.
      expectTypeOf(integer.$.isNone);
      // @ts-expect-error A Boolean conjunction needs a Boolean operand.
      $.literal(true).$.and(integer);
      return integer.$.eq($.integer(2));
    });
  });
});
