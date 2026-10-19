import { Result, pipe } from "effect";
import { describe, expect, test } from "vitest";

import { Expression, JExpr } from "../main.js";
import * as Draft from "./index.js";

import type { Inputs, ProgramError, Type } from "../main.js";

type Vertex = Type.Struct<{ readonly enabled: Type.PrimitiveBoolean }>;
type Graph = Type.Opaque<
  "::graph::Graph",
  Type.Struct<{ readonly "'marker": Vertex }>
>;

const { program } = Draft.withPrelude({
  values: {
    entities: Expression.fromJExpr<
      Type.Function<readonly [Type.PrimitiveNumber], Graph>,
      Inputs.Empty
    >("entities"),
  },
});

const compile = (
  result: Result.Result<Expression.Any, ProgramError.Construction>,
): string =>
  pipe(
    result,
    Result.flatMap(Expression.toJExpr),
    Result.map(JExpr.compile),
    Result.getOrThrow,
  );

describe("draft_query", () => {
  test("named_filter", () => {
    expect.hasAssertions();
    let calls = 0;
    const result = program({}, ($) =>
      $.query
        .entities(1)
        .filter("item", (_, item) => {
          calls += 1;
          return $.isFalse(item.enabled);
        })
        .collect(),
    );
    expect(compile(result)).toBe(
      '["::graph::tail::collect",["::graph::body::filter",["entities",{"#literal":1}],["fn",{"#tuple":[]},{"#struct":{"item":"_"}},"_",["::core::cmp::eq",["::kernel::special_form::access","item","enabled"],{"#literal":false}]]]]',
    );
    expect(calls).toBe(1);
  });

  test("primitive_predicate", () => {
    expect.hasAssertions();
    const result = program({}, ($) =>
      $.query
        .entities(1)
        .filter("vertex", () => true)
        .collect(),
    );
    expect(compile(result)).toBe(
      '["::graph::tail::collect",["::graph::body::filter",["entities",{"#literal":1}],["fn",{"#tuple":[]},{"#struct":{"vertex":"_"}},"_",{"#literal":true}]]]',
    );
  });

  test("predicate_failure", () => {
    expect.hasAssertions();
    const result = program({}, ($) =>
      $.query
        .entities(1)
        .filter("item", () => $.eq(Number.NaN, 1))
        .collect(),
    );
    const failure = pipe(result, Result.flip, Result.getOrThrow);
    expect(failure.reason._tag).toBe("InvalidExpression");
  });
});
