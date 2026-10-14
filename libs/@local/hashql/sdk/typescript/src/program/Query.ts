import { Result } from "effect";

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

export type Context<S extends Scope.Scope> = S["values"] extends {
  readonly entities: Expression.Handle<
    Type.Function<infer Parameters, infer Returns>,
    infer Requirements
  >;
}
  ? Returns extends Graph<infer Vertex>
    ? {
        readonly entities: <const Values extends Arguments<Parameters>>(
          ...args: Values
        ) => Query<
          Returns,
          Vertex,
          Inputs.Merge<Requirements, ArgumentInputs<Values>>
        >;
      }
    : Empty
  : Empty;

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
  const entities = scope.values["entities"];
  if (entities === undefined) {
    // SAFETY: no entities declaration means this context has no query entry point.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the conditional type follows the supplied scope
    return {} as Context<S>;
  }

  const context = {
    entities: (
      ...args: readonly Expression.AnyValue[]
    ): Query<Type.Any, Type.Any, never> =>
      chain(
        Result.all({
          callee: Expression.toJExpr(entities),
          args: Result.all(args.map(Expression.toJExpr)),
        }).pipe(
          Result.map(
            ({ callee, args }) => new AST.Expr(JExpr.call(callee, ...args)),
          ),
          Expression.fromResult,
        ),
      ),
  };

  // oxlint-disable-next-line typescript/no-restricted-types -- the runtime driver erases each declared function signature
  const erased: unknown = context;

  // SAFETY: the declaration supplies its argument types and its graph vertex type.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- runtime scope traversal erases the declaration's signature
  return erased as Context<S>;
};
