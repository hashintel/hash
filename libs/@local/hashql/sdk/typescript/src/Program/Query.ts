/**
 * Graph queries: keep the vertices a predicate accepts, then collect them into a list.
 *
 * A query is syntax like any other expression and reads no graph. It starts from an expression of type {@link Graph}: {@link entities}, or a call to another declared graph function. Each step wraps that expression in a call to the matching `::graph` function, and the vertex type travels through every step.
 *
 * @module
 */
import { Function, Result, pipe } from "effect";

import * as JExpr from "../JExpr/index.js";
import * as AST from "./AST/index.js";
import * as Expression from "./Expression.js";
import * as ProgramError from "./ProgramError.js";

import type * as Type from "../Type.js";
import type * as Input from "./Inputs.js";

// TODO(BE-1013): take `Graph`, `QueryTemporalAxes` and `Entity` from the generated standard-library declarations and delete these, so each type is declared once.
/** HashQL's graph of vertices of type `V`, which graph functions return and query steps take. */
export type Graph<V extends Type.Any> = Type.Opaque<
  "::graph::Graph",
  Type.Struct<{ readonly "'marker": V }>
>;

export declare namespace Graph {
  /** The vertex type of a graph expression, or `never` for an expression of any other type. */
  export type Vertex<E extends Expression.Value.Any> =
    Expression.Value.Type<E> extends Graph<infer V> ? V : never;

  /** Accepts a graph expression: `unknown`, which leaves an intersection unchanged, when `E` is one, and `never`, which rejects the value it constrains, otherwise. */
  export type Check<E extends Expression.Value.Any> = [Vertex<E>] extends [
    never,
  ]
    ? never
    : // oxlint-disable-next-line typescript/no-restricted-types -- unknown is the identity of an accepted intersection constraint
      unknown;
}

/**
 * HashQL's `QueryTemporalAxes`, the time axes a graph is read at, known by its name alone.
 *
 * The SDK does not describe its alternatives, so an expression has this type when it comes from an input declared with it, or from `Expression.assume`.
 */
export type QueryTemporalAxes = Type.Opaque<
  "::graph::temporal::QueryTemporalAxes",
  Type.Unknown
>;

/**
 * HashQL's `Entity` with unknown properties, the vertex type of {@link entities}, known by its name alone.
 *
 * The SDK does not describe its fields, so a predicate can project from an entity only with `$projectUnsafe`.
 */
export type Entity = Type.Opaque<
  "::graph::types::knowledge::entity::Entity",
  Type.Unknown
>;

/** The query {@link filter} returns: the graph it was given, requiring the graph's inputs and the predicate's. */
export type Filtered<
  G extends Expression.Expression.Any,
  P extends Expression.Value<Type.PrimitiveBoolean>,
> = Expression.Expression<
  Graph<Graph.Vertex<G>>,
  Input.Merge<Expression.Value.Inputs<G>, Expression.Value.Inputs<P>>
>;

/** The list {@link collect} returns: the graph's vertices, requiring the graph's inputs. */
export type Collected<G extends Expression.Expression.Any> =
  Expression.Expression<Type.List<Graph.Vertex<G>>, Expression.Value.Inputs<G>>;

/**
 * Starts a query from every entity at the temporal axes `axis`, emitting `::graph::head::entities`.
 *
 * The graph requires the inputs `axis` requires.
 *
 * @example <caption>Collect every entity at the axes an input supplies.</caption>
 * ```ts
 * import assert from "node:assert/strict";
 * import { JExpr, Program } from "@local/hashql";
 * import { Option, Result, pipe } from "effect";
 *
 * const { Expression, Query, TypeExpression } = Program;
 * const axes = TypeExpression.fromType<Program.Query.QueryTemporalAxes>(
 *   Option.getOrThrow(JExpr.Type.reference("::graph::temporal::QueryTemporalAxes")),
 * );
 * const everything = pipe(Expression.input("axis", axes), Query.entities, Query.collect);
 * assert.equal(
 *   JExpr.compile(Result.getOrThrow(Expression.toJExpr(everything))),
 *   '["::graph::tail::collect",["::graph::head::entities",["::kernel::special_form::input","axis","::graph::temporal::QueryTemporalAxes"]]]',
 * );
 * ```
 */
export const entities = <const A extends Expression.Value<QueryTemporalAxes>>(
  axis: A,
): Expression.Expression<Graph<Entity>, Expression.Value.Inputs<A>> =>
  pipe(
    axis,
    Expression.toJExpr,
    Result.map(
      (source) => new AST.Expr(JExpr.call("::graph::head::entities", source)),
    ),
    Expression.fromResult<Graph<Entity>, Expression.Value.Inputs<A>>,
  );

/**
 * Keeps the vertices of a graph that `predicate` accepts, emitting `::graph::body::filter` with a closure over one parameter.
 *
 * `name` becomes the closure's parameter, and `predicate` receives a reference to it typed as the graph's vertex. `predicate` runs once, immediately, unless the graph already carries a construction failure or `name` is not a HashQL identifier, which fails construction with `InvalidParameterName`. It returns a Boolean expression or a host boolean, whose input requirements the result keeps, and an exception it throws propagates to the caller. The reference names the parameter, so carrying it out of the predicate leaves it unbound.
 *
 * @example <caption>Keep the enabled vertices of a declared graph.</caption>
 * ```ts
 * import assert from "node:assert/strict";
 * import { JExpr, Program } from "@local/hashql";
 * import type { Type } from "@local/hashql";
 * import { Result, pipe } from "effect";
 *
 * const { Expression, Operators, Query } = Program;
 * type Vertex = Type.Struct<{ readonly enabled: Type.PrimitiveBoolean }>;
 * const entities = Expression.fromJExpr<
 *   Type.Function<readonly [], Program.Query.Graph<Vertex>>,
 *   Program.Inputs.Empty
 * >("entities");
 * const enabled = pipe(
 *   entities(),
 *   Query.filter("vertex", (vertex) => Operators.isTrue(vertex.enabled)),
 *   Query.collect,
 * );
 * assert.equal(
 *   JExpr.compile(Result.getOrThrow(Expression.toJExpr(enabled))),
 *   '["::graph::tail::collect",["::graph::body::filter",["entities"],["::kernel::special_form::fn",{"#tuple":[]},{"#struct":{"vertex":"_"}},"_",["::core::cmp::eq",["::kernel::special_form::access","vertex","enabled"],{"#literal":true}]]]]',
 * );
 * ```
 */
export const filter: {
  <
    const G extends Expression.Expression.Any,
    const P extends Expression.Value<Type.PrimitiveBoolean>,
  >(
    name: string,
    predicate: (
      vertex: Expression.Expression<Graph.Vertex<G>, Input.Empty>,
    ) => P,
  ): (graph: G & Graph.Check<G>) => Filtered<G, P>;
  <
    const G extends Expression.Expression.Any,
    const P extends Expression.Value<Type.PrimitiveBoolean>,
  >(
    graph: G & Graph.Check<G>,
    name: string,
    predicate: (
      vertex: Expression.Expression<Graph.Vertex<G>, Input.Empty>,
    ) => P,
  ): Filtered<G, P>;
} = Function.dual(
  // The data-first form starts with the graph, the data-last form with the parameter name.
  (args) => Expression.isExpression(args[0]),
  <
    const G extends Expression.Expression.Any,
    const P extends Expression.Value<Type.PrimitiveBoolean>,
  >(
    graph: G & Graph.Check<G>,
    name: string,
    predicate: (
      vertex: Expression.Expression<Graph.Vertex<G>, Input.Empty>,
    ) => P,
  ): Filtered<G, P> =>
    Result.gen(function* () {
      const source = yield* Expression.toJExpr(graph);
      const parameter = yield* pipe(
        JExpr.Ident.decodeResult(name),
        Result.mapError((cause) =>
          ProgramError.Construction.invalidParameterName(name, cause),
        ),
        Result.map(JExpr.Ident.compile),
      );
      const body = yield* pipe(
        parameter,
        Expression.fromJExpr<Graph.Vertex<G>, Input.Empty>,
        predicate,
        Expression.toJExpr,
      );

      return new AST.Expr(
        JExpr.call(
          "::graph::body::filter",
          source,
          JExpr.fn({ params: { [parameter]: JExpr.infer }, body }),
        ),
      );
    }).pipe(
      Expression.fromResult<
        Graph<Graph.Vertex<G>>,
        Input.Merge<Expression.Value.Inputs<G>, Expression.Value.Inputs<P>>
      >,
    ),
);

/** Ends a query, emitting `::graph::tail::collect`, as a list of the graph's vertices. See {@link filter} for an example. */
export const collect = <const G extends Expression.Expression.Any>(
  graph: G & Graph.Check<G>,
): Collected<G> =>
  pipe(
    graph,
    Expression.toJExpr,
    Result.map(
      (source) => new AST.Expr(JExpr.call("::graph::tail::collect", source)),
    ),
    Expression.fromResult<
      Type.List<Graph.Vertex<G>>,
      Expression.Value.Inputs<G>
    >,
  );
