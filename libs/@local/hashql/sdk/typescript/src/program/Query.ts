/**
 * Query operations derived from a declared graph-producing function.
 *
 * Authoring contexts expose `query.entities` when their value declarations contain an `entities` function returning the recognized graph descriptor. The graph marker carries the vertex type through filtering and collection. These operations construct query syntax without contacting a graph service.
 *
 * @module
 */
import { Cause, Result, pipe } from "effect";

import * as JExpr from "../jexpr/index.js";
import * as AST from "./ast/index.js";
import * as Expression from "./Expression.js";
import * as ProgramError from "./ProgramError.js";

import type * as Type from "../type/index.js";
import type { ArgumentInputs, Arguments } from "./ExpressionType.js";
import type * as Inputs from "./Inputs.js";
import type * as Scope from "./Scope.js";

type Graph<Vertex extends Type.Any> = Type.Opaque<
  "::graph::Graph",
  Type.Struct<{ readonly "'marker": Vertex }>
>;

/**
 * A graph expression with filtering and collection operations that retain its vertex descriptor.
 *
 * Binding gives an ordinary expression without query methods. Complete filtering and collection before binding the result. The vertex descriptor comes from the declared `entities` function, not from inspecting stored graph data.
 *
 * @example <caption>Build a filtered collection with a declared graph function.</caption>
 * ```ts
 * import assert from "node:assert/strict";
 * import { Expression } from "@local/hashql";
 * import type { Inputs, Type } from "@local/hashql";
 * import { withPrelude } from "@local/hashql/do";
 * import { Result } from "effect";
 *
 * type Vertex = Type.Struct<{ readonly active: Type.PrimitiveBoolean }>;
 * type Graph = Type.Opaque<
 *   "::graph::Graph",
 *   Type.Struct<{ readonly "'marker": Vertex }>
 * >;
 * const { Do } = withPrelude({ values: {
 *   entities: Expression.fromJExpr<Type.Function<readonly [], Graph>, Inputs.Empty>("entities"),
 * } });
 * let calls = 0;
 * const result = Do(($) => $.query.entities().filter("item", (item) => {
 *   calls += 1;
 *   return item.active;
 * }).collect());
 * const syntax = Result.getOrThrow(Result.flatMap(result, Expression.toJExpr));
 * assert.equal(calls, 1);
 * assert.ok(Array.isArray(syntax));
 * assert.equal(syntax[0], "::graph::tail::collect");
 * ```
 */
export type Query<
  T extends Type.Any,
  Vertex extends Type.Any,
  Requirements,
> = Expression.Expression<T, Requirements> & {
  /**
   * Adds a named predicate callback, invoked once during successful construction rather than once per stored vertex.
   *
   * An invalid graph expression or parameter name skips the callback. A synchronous callback exception becomes a `CallbackException` construction failure. Captured expressions contribute their input requirements. The name identifies the emitted HashQL function's parameter. The compiler owns lexical resolution.
   */
  readonly filter: <
    const Predicate extends Expression.Value<Type.PrimitiveBoolean>,
  >(
    name: string,
    predicate: (
      vertex: Expression.Expression<Vertex, Inputs.Empty>,
    ) => Predicate,
  ) => Query<
    T,
    Vertex,
    Inputs.Merge<Requirements, Expression.Inputs<Predicate>>
  >;
  /** Constructs collection into a list of vertices, retaining query inputs and construction failures without executing it. */
  readonly collect: () => Expression.Expression<
    Type.List<Vertex>,
    Requirements
  >;
};

// oxlint-disable-next-line typescript/no-generated-empty-object-type -- a scope without an entities declaration has no query entry point
type Empty = Record<never, never>;

/** Reads the declared `entities` function's arguments, result, requirements and graph vertex, or resolves to `never` when its descriptor does not match. */
export type EntityFunction<S extends Scope.Scope> = S["values"] extends {
  readonly entities: infer E extends Expression.Any;
}
  ? Expression.TypeOf<E> extends Type.Function<infer A, infer R>
    ? R extends Graph<infer V>
      ? {
          readonly args: A;
          readonly returns: R;
          readonly vertex: V;
          readonly inputs: Inputs.Conservative<Expression.Inputs<E>>;
        }
      : never
    : never
  : never;

type Entities<S extends Scope.Scope> = <
  const A extends readonly Expression.AnyValue[] &
    Arguments<EntityFunction<S>["args"]>,
>(
  ...args: A
) => Query<
  EntityFunction<S>["returns"],
  EntityFunction<S>["vertex"],
  Inputs.Merge<EntityFunction<S>["inputs"], ArgumentInputs<A>>
>;

/** Query entry points available from a scope's declared graph function, or an empty type for an absent or incompatible declaration. */
export type Context<S extends Scope.Scope> = [EntityFunction<S>] extends [never]
  ? Empty
  : { readonly entities: Entities<S> };

const chain = <T extends Type.Any, Vertex extends Type.Any, Requirements>(
  expression: Expression.Expression<T, Requirements>,
): Query<T, Vertex, Requirements> => {
  const methods = {
    filter: <const Predicate extends Expression.Value<Type.PrimitiveBoolean>>(
      name: string,
      predicate: (
        vertex: Expression.Expression<Vertex, Inputs.Empty>,
      ) => Predicate,
    ): Query<
      T,
      Vertex,
      Inputs.Merge<Requirements, Expression.Inputs<Predicate>>
    > =>
      chain(
        Result.gen(function* () {
          const graph = yield* Expression.toJExpr(expression);
          const ident = yield* JExpr.Ident.decodeResult(name).pipe(
            Result.mapError(
              (cause) =>
                new ProgramError.Construction({
                  reason: ProgramError.Reason.InvalidParameterName({
                    name,
                    cause,
                  }),
                }),
            ),
          );

          const parameter = JExpr.Ident.compile(ident);
          const condition = yield* Result.try({
            try: () => predicate(Expression.fromJExpr(parameter)),
            catch: (error) =>
              ProgramError.Construction.callbackException(
                new Cause.UnknownError(error),
              ),
          });
          const body = yield* Expression.toJExpr(condition);

          return new AST.Expr(
            JExpr.call(
              "::graph::body::filter",
              graph,
              JExpr.fn({ params: { [parameter]: JExpr.infer }, body }),
            ),
          );
        }).pipe(
          Expression.fromResult<
            T,
            Inputs.Merge<Requirements, Expression.Inputs<Predicate>>
          >,
        ),
      ),
    collect: (): Expression.Expression<Type.List<Vertex>, Requirements> =>
      Expression.fromResult(
        Expression.toJExpr(expression).pipe(
          Result.map(
            (graph) =>
              new AST.Expr(JExpr.call("::graph::tail::collect", graph)),
          ),
        ),
      ),
  };

  const proxy = new Proxy(expression, {
    // oxlint-disable-next-line typescript/no-restricted-types -- a proxy can return expression members or query methods
    get(target, property, receiver): unknown {
      if (property === "filter") {
        return methods.filter;
      }
      if (property === "collect") {
        return methods.collect;
      }
      return Reflect.get(target, property, receiver);
    },
  });

  // SAFETY: the proxy preserves the expression's identity and supplies both query methods.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Proxy cannot express added members in its return type
  return proxy as Query<T, Vertex, Requirements>;
};

export const make = <S extends Scope.Scope>(scope: S): Context<S> => {
  const declaration = scope.values["entities"];
  if (declaration === undefined) {
    return {};
  }

  const entities: Entities<S> = <
    const A extends readonly Expression.AnyValue[] &
      Arguments<EntityFunction<S>["args"]>,
  >(
    ...args: A
  ) =>
    pipe(
      {
        callee: Expression.toJExpr(declaration),
        args: Result.all(args.map(Expression.toJExpr)),
      },
      Result.all,
      Result.map(
        ({ callee, args: values }) =>
          new AST.Expr(JExpr.call(callee, ...values)),
      ),
      Expression.fromResult<
        EntityFunction<S>["returns"],
        Inputs.Merge<EntityFunction<S>["inputs"], ArgumentInputs<A>>
      >,
      chain<
        EntityFunction<S>["returns"],
        EntityFunction<S>["vertex"],
        Inputs.Merge<EntityFunction<S>["inputs"], ArgumentInputs<A>>
      >,
    );

  return { entities };
};
