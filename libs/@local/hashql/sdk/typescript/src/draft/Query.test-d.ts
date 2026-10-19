import { describe, expectTypeOf, test } from "vitest";

import { Expression } from "../main.js";
import * as Draft from "./index.js";

import type { Inputs, ProgramError, Type } from "../main.js";
import type { Result } from "effect";

type Vertex = Type.Struct<{ readonly enabled: Type.PrimitiveBoolean }>;
type Graph = Type.Opaque<
  "::graph::Graph",
  Type.Struct<{ readonly "'marker": Vertex }>
>;

describe("draft_query_types", () => {
  test("graph_vertex", () => {
    const { program } = Draft.withPrelude({
      values: {
        entities: Expression.fromJExpr<
          Type.Function<readonly [], Graph>,
          Inputs.Empty
        >("entities"),
      },
    });
    const result = program({}, ($) =>
      $.query
        .entities()
        .filter("item", (_, item) => {
          expectTypeOf(item).toEqualTypeOf<
            Expression.Expression<Vertex, Inputs.Empty>
          >();
          return $.isFalse(item.enabled);
        })
        .collect(),
    );
    expectTypeOf(result).toEqualTypeOf<
      Result.Result<
        Expression.Expression<Type.List<Vertex>, Inputs.Empty>,
        ProgramError.Construction
      >
    >();
    program({}, ($) => {
      // @ts-expect-error A predicate must return a Boolean.
      $.query.entities().filter("item", (_, item) => item);
      // @ts-expect-error Query construction has no compatibility adapter.
      expectTypeOf($.query.from);
      return $.literal(true);
    });
  });

  test("primitive_arguments", () => {
    const { program } = Draft.withPrelude({
      values: {
        entities: Expression.fromJExpr<
          Type.Function<readonly [Type.PrimitiveNumber], Graph>,
          Inputs.Empty
        >("entities"),
      },
    });
    const result = program({}, ($) =>
      $.query
        .entities(1)
        .filter("vertex", () => true)
        .collect(),
    );
    expectTypeOf(result).toEqualTypeOf<
      Result.Result<
        Expression.Expression<Type.List<Vertex>, Inputs.Empty>,
        ProgramError.Construction
      >
    >();
    program({}, ($) => {
      // @ts-expect-error Query arguments use the declaration's exact numeric descriptor.
      $.query.entities(1n);
      // @ts-expect-error A predicate does not accept numeric truthiness.
      $.query.entities(1).filter("vertex", () => 1);
      return $.literal(true);
    });
  });
});
