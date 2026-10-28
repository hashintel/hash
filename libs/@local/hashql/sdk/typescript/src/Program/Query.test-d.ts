/** Vertex inference through filter and collect in both argument orders. @module */
import { Option, pipe } from "effect";
import { describe, expectTypeOf, test } from "vitest";

import * as JExpr from "../JExpr/index.js";
import * as Expression from "./Expression.js";
import * as Operators from "./Operators.js";
import * as Query from "./Query.js";
import * as Structural from "./Structural.js";
import * as TypeExpression from "./TypeExpression.js";

import type * as Type from "../Type.js";
import type * as Inputs from "./Inputs.js";

type Vertex = Type.Struct<{ readonly enabled: Type.PrimitiveBoolean }>;

const entities = Expression.fromJExpr<
  Type.Function<readonly [Type.PrimitiveInteger], Query.Graph<Vertex>>,
  Inputs.Empty
>("entities");

describe("query_types", () => {
  test("entities", () => {
    const axes = TypeExpression.fromType<Query.QueryTemporalAxes>(
      Option.getOrThrow(
        JExpr.Type.reference("::graph::temporal::QueryTemporalAxes"),
      ),
    );
    expectTypeOf(
      Expression.input("axis", axes).pipe(Query.entities),
    ).toEqualTypeOf<
      Expression.Expression<
        Query.Graph<Query.Entity>,
        { readonly axis: Query.QueryTemporalAxes }
      >
    >();
    // @ts-expect-error The axes are a QueryTemporalAxes.
    Query.entities(1n);
  });

  test("vertex", () => {
    const graph = entities(Expression.input("axis", Structural.type(BigInt)));
    const piped = pipe(
      graph,
      Query.filter("vertex", (vertex) => {
        expectTypeOf(vertex).toEqualTypeOf<
          Expression.Expression<Vertex, Inputs.Empty>
        >();
        return Operators.isTrue(vertex.enabled);
      }),
      Query.collect,
    );
    const direct = Query.collect(
      Query.filter(graph, "vertex", (vertex) => vertex.enabled),
    );
    expectTypeOf(piped).toEqualTypeOf<
      Expression.Expression<
        Type.List<Vertex>,
        { readonly axis: Type.PrimitiveInteger }
      >
    >();
    expectTypeOf(direct).toEqualTypeOf(piped);
  });

  test("predicate_inputs", () => {
    const flag = Expression.input("flag", Structural.type(Boolean), true);
    const filtered = pipe(
      entities(1n),
      Query.filter("vertex", (vertex) => Operators.and(vertex.enabled, flag)),
    );
    expectTypeOf(filtered).toEqualTypeOf<
      Expression.Expression<
        Query.Graph<Vertex>,
        { readonly flag?: Type.PrimitiveBoolean }
      >
    >();
    expectTypeOf(
      pipe(
        entities(1n),
        Query.filter("v", () => true),
      ),
    ).toEqualTypeOf<Expression.Expression<Query.Graph<Vertex>, Inputs.Empty>>();
  });

  test("predicate_domain", () => {
    pipe(
      entities(1n),
      // @ts-expect-error A predicate returns a Boolean, not a vertex.
      Query.filter("vertex", (vertex) => vertex),
    );
    pipe(
      entities(1n),
      // @ts-expect-error A predicate does not accept numeric truthiness.
      Query.filter("vertex", () => 1),
    );
    expectTypeOf<
      Query.Graph.Vertex<Expression.Expression<Vertex, Inputs.Empty>>
    >().toBeNever();
    pipe(
      // @ts-expect-error Only a graph can be filtered.
      Expression.literal(true),
      Query.filter("vertex", () => true),
    );
    // @ts-expect-error Only a graph can be collected.
    Query.collect(Expression.literal(true));
    expectTypeOf<
      Query.Graph.Vertex<ReturnType<typeof entities>>
    >().toEqualTypeOf<Vertex>();
  });
});
