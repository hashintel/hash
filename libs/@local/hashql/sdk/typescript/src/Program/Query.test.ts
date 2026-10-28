/** Graph filter and collect syntax, and when the predicate runs. @module */
import { Result, pipe } from "effect";
import { describe, expect, test } from "vitest";

import * as JExpr from "../JExpr/index.js";
import * as Expression from "./Expression.js";
import * as Operators from "./Operators.js";
import * as ProgramError from "./ProgramError.js";
import * as Query from "./Query.js";
import * as Structural from "./Structural.js";

import type * as Type from "../Type.js";
import type * as Inputs from "./Inputs.js";

type Vertex = Type.Struct<{ readonly enabled: Type.PrimitiveBoolean }>;

const entities = Expression.fromJExpr<
  Type.Function<readonly [Type.PrimitiveInteger], Query.Graph<Vertex>>,
  Inputs.Empty
>("entities");

const compile = (expression: Expression.Expression.Any): string =>
  pipe(
    expression,
    Expression.toJExpr,
    Result.map(JExpr.compile),
    Result.getOrThrow,
  );

const failure = (
  expression: Expression.Expression.Any,
): ProgramError.Construction =>
  pipe(expression, Expression.toJExpr, Result.flip, Result.getOrThrow);

describe("query", () => {
  test("entities", () => {
    expect.hasAssertions();
    const axis = Expression.fromJExpr<Query.QueryTemporalAxes, Inputs.Empty>(
      "axis",
    );
    expect(compile(pipe(axis, Query.entities, Query.collect))).toBe(
      '["::graph::tail::collect",["::graph::head::entities","axis"]]',
    );
  });

  test("filter_collect", () => {
    expect.hasAssertions();
    let calls = 0;
    const piped = pipe(
      entities(1n),
      Query.filter("item", (item) => {
        calls += 1;
        return Operators.isFalse(item.enabled);
      }),
      Query.collect,
    );
    const direct = Query.collect(
      Query.filter(entities(1n), "item", (item) =>
        Operators.isFalse(item.enabled),
      ),
    );
    expect(compile(piped)).toBe(
      '["::graph::tail::collect",["::graph::body::filter",["entities",{"#literal":1}],["::kernel::special_form::fn",{"#tuple":[]},{"#struct":{"item":"_"}},"_",["::core::cmp::eq",["::kernel::special_form::access","item","enabled"],{"#literal":false}]]]]',
    );
    expect(compile(direct)).toBe(compile(piped));
    expect(calls).toBe(1);
  });

  test("chained_filters", () => {
    expect.hasAssertions();
    const flag = Expression.input(
      "flag",
      Result.getOrThrow(Structural.type(Boolean)),
    );
    const filtered = pipe(
      entities(1n),
      Query.filter("first", () => true),
      Query.filter("second", () => flag),
    );
    expect(compile(filtered)).toBe(
      '["::graph::body::filter",["::graph::body::filter",["entities",{"#literal":1}],["::kernel::special_form::fn",{"#tuple":[]},{"#struct":{"first":"_"}},"_",{"#literal":true}]],["::kernel::special_form::fn",{"#tuple":[]},{"#struct":{"second":"_"}},"_",["::kernel::special_form::input","flag","::kernel::type::Boolean"]]]',
    );
  });

  test("invalid_parameter_name", () => {
    expect.hasAssertions();
    let calls = 0;
    const filtered = pipe(
      entities(1n),
      Query.filter("not a name", () => {
        calls += 1;
        return true;
      }),
    );
    expect(failure(filtered).reason).toMatchObject({
      _tag: "InvalidParameterName",
      name: "not a name",
    });
    expect(calls).toBe(0);
  });

  test("graph_failure", () => {
    expect.hasAssertions();
    let calls = 0;
    const broken = Expression.fromResult<Query.Graph<Vertex>, Inputs.Empty>(
      Result.fail(ProgramError.Construction.invalidBodyResult()),
    );
    const collected = pipe(
      broken,
      Query.filter("item", () => {
        calls += 1;
        return true;
      }),
      Query.collect,
    );
    expect(failure(collected).reason._tag).toBe("InvalidBodyResult");
    expect(calls).toBe(0);
  });

  test("predicate_failure", () => {
    expect.hasAssertions();
    const filtered = pipe(
      entities(1n),
      Query.filter("item", () => Operators.eq(Number.NaN, 1)),
    );
    expect(failure(filtered).reason._tag).toBe("InvalidExpression");
  });

  test("predicate_exception", () => {
    expect.hasAssertions();
    const cause = new Error("predicate");
    expect(() =>
      pipe(
        entities(1n),
        Query.filter("item", () => {
          throw cause;
        }),
      ),
    ).toThrow(cause);
  });
});
