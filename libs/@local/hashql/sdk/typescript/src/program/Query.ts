/**
 * Query operations derived from a declared graph-producing function.
 *
 * The graph marker carries the vertex descriptor through filtering and collection. Both authoring APIs read that descriptor from EntityFunction rather than maintaining a separate graph schema.
 *
 * @module
 */
import { Result, pipe } from "effect";

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

export type Query<
  T extends Type.Any,
  Vertex extends Type.Any,
  Requirements,
> = Expression.Expression<T, Requirements> & {
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
  readonly collect: () => Expression.Expression<
    Type.List<Vertex>,
    Requirements
  >;
};

// oxlint-disable-next-line typescript/no-generated-empty-object-type -- a scope without an entities declaration has no query entry point
type Empty = Record<never, never>;

/** Reads one function's arguments, result, requirements and graph vertex from its semantic metadata. */
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
          const body = yield* Expression.toJExpr(
            predicate(Expression.fromJExpr(parameter)),
          );

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
