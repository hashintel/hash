/**
 * Graph queries: keep the vertices a predicate accepts, then collect them into a list.
 *
 * A query is syntax like any other expression and reads no graph. It starts from an expression of type {@link Graph}: {@link entities}, or a call to another declared graph function. Each step wraps that expression in a call to the matching `::graph` function, and the vertex type travels through every step.
 *
 * @module
 */
import { Function, Result, pipe } from "effect";

import * as Referential from "../internal/referential.js";
import * as JExpr from "../JExpr/index.js";
import * as AST from "./AST/index.js";
import * as Expression from "./Expression.js";
import * as ProgramError from "./ProgramError.js";
import * as TAST from "./TAST/index.js";

import type * as Type from "../Type.js";
import type * as Input from "./Inputs.js";

// TODO(BE-1013): take `Graph`, `QueryTemporalAxes` and `Entity` from the generated standard-library declarations and delete these, so the standard library declares each type once.
/** HashQL's graph of vertices of type `V`, which graph functions return and query steps take. */
export type Graph<V extends Type.Any> = Type.Opaque<
  "::graph::Graph",
  Type.Struct<{ readonly "'marker": V }>
>;

export declare namespace Graph {
  /** The vertex type of a graph expression, or `never` for an expression of any other type. */
  export type Vertex<E extends Expression.Value.Any> =
    Expression.Value.Type<E> extends Graph<infer V> ? V : never;

  /** Accepts a graph expression and rejects any other: it is `unknown` when `E` is a graph expression and `never` otherwise. Intersected with a value's type, `unknown` changes nothing and `never` rejects the value. */
  export type Check<E extends Expression.Value.Any> = [Vertex<E>] extends [
    never,
  ]
    ? never
    : // oxlint-disable-next-line typescript/no-restricted-types -- unknown is the identity of an accepted intersection constraint
      unknown;
}

/**
 * HashQL's `QueryTemporalAxes`, the time axes a query reads the graph at, known by its name alone.
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

/** The query {@link filter} returns: the graph it received, requiring the graph's inputs and the predicate's. */
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

/** The type `_`, which a filter closure writes for its parameter and its result so that HashQL infers them. */
const inferred = new TAST.Syntax(JExpr.Type.infer());

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
    Expression.toNode,
    Result.map(
      (source) =>
        new AST.Call(new AST.Expr("::graph::head::entities"), [source]),
    ),
    Expression.fromResult<Graph<Entity>, Expression.Value.Inputs<A>>,
  );

/**
 * Keeps the vertices of a graph that `predicate` accepts, emitting `::graph::body::filter` with a closure over one parameter.
 *
 * `name` becomes the closure's parameter, and `predicate` receives a reference to it typed as the graph's vertex. `predicate` runs once, when `filter` receives the graph: at the call in the data-first form, and when a caller applies the returned function in the data-last form. It does not run when the graph already carries a construction failure. It does not run either when `name` is not a HashQL identifier, and construction then fails with `InvalidParameterName`. It returns a Boolean expression or a host boolean, whose input requirements the result keeps, and an exception it throws propagates to the caller. The reference names the parameter, so outside the predicate it would read another binding of that name or none, and a program that carries it out fails with the `StaleReference` reason.
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
      const source = yield* Expression.toNode(graph);
      const ident = yield* pipe(
        JExpr.Ident.decodeResult(name),
        Result.mapError((cause) =>
          ProgramError.Construction.invalidParameterName(name, cause),
        ),
      );
      // Each closure makes its parameter's id from its own source, so the reference names this closure's parameter.
      const parameter = Referential.referenceProducer(Symbol("~hashql/Query"))(
        "value",
        ident,
      );
      const body = yield* pipe(
        new AST.Path(Referential.bare(ident), parameter),
        Expression.fromNode<Graph.Vertex<G>, Input.Empty>,
        predicate,
        Expression.toNode,
      );

      return new AST.Call(new AST.Expr("::graph::body::filter"), [
        source,
        new AST.Closure(
          {
            generics: [],
            parameters: [{ id: parameter, type: inferred }],
            returns: inferred,
          },
          body,
        ),
      ]);
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
    Expression.toNode,
    Result.map(
      (source) =>
        new AST.Call(new AST.Expr("::graph::tail::collect"), [source]),
    ),
    Expression.fromResult<
      Type.List<Graph.Vertex<G>>,
      Expression.Value.Inputs<G>
    >,
  );
