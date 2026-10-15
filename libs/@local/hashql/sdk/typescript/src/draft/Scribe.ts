/**
 * Collects declarations while a synchronous callback constructs an expression.
 *
 * Handles retain semantic parameters until conversion to syntax. Only the declaration wrappers are heterogeneous: each is already an AST operation, so their collection needs no type recovery. A child collector prevents branch and predicate declarations from escaping their lexical body. Callback exceptions retain their original cause inside construction failures.
 *
 * @module
 */
import { Cause, Data, Result, pipe } from "effect";

import {
  Expression,
  JExpr,
  Operators,
  ProgramError,
  Structural,
  TypeExpression,
} from "../main.js";
import * as AST from "../program/ast/index.js";
import * as Import from "../program/Import.js";
import * as Namespace from "../program/Namespace.js";

import type * as Syntax from "../jexpr/type/index.js";
import type { Inputs, Module, Type } from "../main.js";
import type { ArgumentInputs, Arguments } from "../program/ExpressionType.js";
import type * as Scope from "../program/Scope.js";
import type * as Body from "./Body.js";
import type * as Context from "./Context.js";

type Wrap = (child: AST.Node) => AST.Node;

/** Adds structural argument normalization without losing the nominal identity on relocation. */
const nominalValue = <N extends symbol, T extends Type.Any>(
  expression: Expression.Expression<
    Type.Function<readonly [T], Type.Opaque<N, T>>,
    Inputs.Empty
  >,
): Context.NominalValue<N, T> =>
  Expression.adaptCallable(expression, (self) => {
    const construct: Context.NominalCall<N, T> = <
      const V extends Structural.Value<T> & Structural.AnyValue,
    >(
      value: Structural.Exact<T, V>,
    ): Expression.Expression<Type.Opaque<N, T>, Structural.Requirements<V>> =>
      pipe(
        {
          callee: Expression.toJExpr(self),
          argument: Structural.toJExpr(value),
        },
        Result.all,
        Result.map(
          ({ callee, argument }) => new AST.Expr(JExpr.call(callee, argument)),
        ),
        Expression.fromResult<Type.Opaque<N, T>, Structural.Requirements<V>>,
      );

    return construct;
  });

const nominal = <N extends symbol, T extends Type.Any>(
  binding: Result.Result<AST.Binding<Syntax.Type>, ProgramError.Construction>,
): Context.Nominal<N, T> => {
  const type = pipe(
    binding,
    Result.map(
      (bound): Syntax.Type => ({
        _tag: "Reference",
        path: { rooted: false, segments: [bound.name] },
        generics: [],
      }),
    ),
    TypeExpression.fromResult<Type.Opaque<N, T>>,
  );

  const value = pipe(
    binding,
    Result.map((bound) => new AST.Expr(JExpr.Ident.compile(bound.name))),
    Expression.fromResult<
      Type.Function<readonly [T], Type.Opaque<N, T>>,
      Inputs.Empty
    >,
    nominalValue<N, T>,
  );

  return Namespace.combine<
    Context.NominalValue<N, T>,
    TypeExpression.TypeExpression<Type.Opaque<N, T>>
  >(value, type);
};

/** Stops a callback when an import cannot supply its promised handles. */
const ConstructionFailure = Data.TaggedError("DraftConstructionFailure")<{
  readonly failure: ProgramError.Construction;
}>;

class ContextImpl<S extends Scope.Scope> implements Context.Context<S> {
  readonly #scope: S & Namespace.Rebindable<S>;
  readonly #prelude: Namespace.Flatten<S>;
  readonly #modules: Namespace.Modules<S>;
  readonly #wrappers: Result.Result<Wrap, ProgramError.Construction>[] = [];
  readonly query: Context.QueryContext<S>;
  readonly literal = Expression.literal;
  readonly integer = Expression.integer;
  readonly number = Expression.number;
  readonly assume = Expression.assume;
  readonly input = Expression.input;
  readonly eq = Operators.eq;
  readonly ne = Operators.ne;
  readonly and = Operators.and;
  readonly or = Operators.or;
  readonly not = Operators.not;
  readonly isTrue = Operators.isTrue;
  readonly isFalse = Operators.isFalse;
  readonly isNone = Operators.isNone;

  constructor(scope: S & Namespace.Rebindable<S>) {
    this.#scope = scope;
    this.#prelude = Namespace.flatten<S>(scope);
    this.#modules = Namespace.modules<S>(scope);
    this.query = this.#queries();
  }

  prelude(): Namespace.Flatten<S> {
    return this.#prelude;
  }
  modules(): Namespace.Modules<S> {
    return this.#modules;
  }

  import<M extends Module.Any>(
    module: M & Import.Rebindable<M>,
  ): Namespace.Flatten<Import.Imported<M, "*">>;
  import<M extends Module.Any, const I extends Import.Selection<M>>(
    module: M & Import.Rebindable<M>,
    selection: I,
  ): Namespace.Flatten<Import.Imported<M, I>>;
  import<M extends Module.Any, const I extends Import.Selection<M>>(
    module: M & Import.Rebindable<M>,
    // oxlint-disable-next-line hash/prefer-options-object -- the optional argument is the import selection itself
    selection: I | "*" = "*",
  ): Namespace.Flatten<Import.Imported<M, I | "*">> {
    const declaration = Import.bind<M, I | "*">(module, selection);
    this.#wrappers.push(
      pipe(
        declaration,
        Result.map((imported) => imported.wrap),
      ),
    );
    // Keep the failure in the collector even if host code catches the private control-flow exception.
    const imported = Result.getOrThrowWith(
      declaration,
      (failure) => new ConstructionFailure({ failure }),
    );
    return Namespace.flatten<Import.Imported<M, I | "*">>(imported.scope);
  }

  let<const E extends Expression.AnyValue>(
    name: string,
    value: E,
  ): Expression.Expression<Expression.TypeOf<E>, Expression.Inputs<E>> {
    const binding = pipe(
      Expression.toNode(value),
      Result.flatMap((node) => AST.make(name, node)),
    );

    this.#wrappers.push(
      pipe(
        binding,
        Result.map(
          (bound): Wrap =>
            (child) =>
              new AST.Let(bound, child),
        ),
      ),
    );

    return pipe(
      binding,
      Result.map((bound) => new AST.Expr(JExpr.Ident.compile(bound.name))),
      Expression.fromResult<Expression.TypeOf<E>, Expression.Inputs<E>>,
    );
  }

  type<const D extends Structural.Definition>(
    name: string,
    definition: D,
  ): TypeExpression.TypeExpression<Structural.TypeOf<D>> {
    const binding = pipe(
      definition,
      Structural.type,
      TypeExpression.toType,
      Result.flatMap((syntax) => AST.make(name, syntax)),
    );

    this.#wrappers.push(
      pipe(
        binding,
        Result.map(
          (bound): Wrap =>
            (child) =>
              new AST.Type(bound, child),
        ),
      ),
    );

    return pipe(
      binding,
      Result.map(
        (bound): Syntax.Type => ({
          _tag: "Reference",
          path: { rooted: false, segments: [bound.name] },
          generics: [],
        }),
      ),
      TypeExpression.fromResult<Structural.TypeOf<D>>,
    );
  }

  readonly newtype: Context.Context<S>["newtype"] = <
    const N extends symbol,
    const D extends Structural.Definition,
  >(
    name: string,
    _identity: symbol extends N ? never : N,
    definition: D,
  ): Context.Nominal<N, Structural.TypeOf<D>> => {
    const binding = pipe(
      definition,
      Structural.type,
      TypeExpression.toType,
      Result.flatMap((syntax) => AST.make(name, syntax)),
    );

    this.#wrappers.push(
      pipe(
        binding,
        Result.map(
          (bound): Wrap =>
            (child) =>
              new AST.Newtype(bound, child),
        ),
      ),
    );

    return nominal<N, Structural.TypeOf<D>>(binding);
  };

  if<
    const C extends Expression.Value<Type.PrimitiveBoolean>,
    const T extends Expression.AnyValue,
    const E extends Expression.AnyValue,
  >(
    condition: C,
    ...branches: Context.Branches<S, T, E>
  ): Context.Conditional<C, T, E> {
    const resolve = (): {
      readonly consequent: Result.Result<AST.Node, ProgramError.Construction>;
      readonly alternate: Result.Result<AST.Node, ProgramError.Construction>;
    } => {
      if (branches.length === 2) {
        return {
          consequent: new ContextImpl<S>(this.#scope).build(branches[0]),
          alternate: new ContextImpl<S>(this.#scope).build(branches[1]),
        };
      }

      return {
        consequent: Expression.toNode(branches[0].then),
        alternate: Expression.toNode(branches[0].else),
      };
    };

    const { consequent, alternate } = resolve();
    return pipe(
      { condition: Expression.toNode(condition), consequent, alternate },
      Result.all,
      Result.map(
        (nodes) =>
          new AST.If(nodes.condition, nodes.consequent, nodes.alternate),
      ),
      Expression.fromResult<
        Expression.Conditional<Expression.TypeOf<T>, Expression.TypeOf<E>>,
        Inputs.Merge<
          Expression.Inputs<C>,
          Inputs.Merge<Expression.Inputs<T>, Expression.Inputs<E>>
        >
      >,
    );
  }

  #query<T extends Type.Any, V extends Type.Any, I>(
    expression: Expression.Expression<T, I>,
  ): Context.Query<S, T, V, I> {
    const filter = <const P extends Expression.Value<Type.PrimitiveBoolean>>(
      name: string,
      predicate: (
        $: Context.Context<S>,
        vertex: Expression.Expression<V, Inputs.Empty>,
      ) => P,
    ): Context.Query<S, T, V, Inputs.Merge<I, Expression.Inputs<P>>> => {
      const scope = this.#scope;
      const node = Result.gen(function* () {
        const graph = yield* Expression.toJExpr(expression);
        const ident = yield* pipe(
          JExpr.Ident.decodeResult(name),
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
        const vertex = Expression.fromJExpr<V, Inputs.Empty>(parameter);
        const body = yield* new ContextImpl<S>(scope).build(($) =>
          predicate($, vertex),
        );

        return new AST.Expr(
          JExpr.call(
            "::graph::body::filter",
            graph,
            JExpr.fn({
              params: { [parameter]: JExpr.infer },
              body: body.compile(),
            }),
          ),
        );
      });

      return this.#query<T, V, Inputs.Merge<I, Expression.Inputs<P>>>(
        Expression.fromResult(node),
      );
    };

    const collect = (): Expression.Expression<Type.List<V>, I> =>
      pipe(
        expression,
        Expression.toJExpr,
        Result.map(
          (graph) => new AST.Expr(JExpr.call("::graph::tail::collect", graph)),
        ),
        Expression.fromResult<Type.List<V>, I>,
      );

    const proxy = new Proxy(expression, {
      // oxlint-disable-next-line typescript/no-restricted-types -- proxy forwarding can return any expression property
      get: (target, property, receiver): unknown => {
        if (property === "filter") {
          return filter;
        }

        if (property === "collect") {
          return collect;
        }

        return Reflect.get(target, property, receiver);
      },
    });

    // SAFETY: the typed handle retains its semantic type and input requirements. The filter and collect methods retain the vertex type and propagate requirements.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Proxy does not express the two supplied query methods
    return proxy as Context.Query<S, T, V, I>;
  }

  #queries(): Context.QueryContext<S> {
    const declaration = this.#scope.values["entities"];
    if (declaration === undefined) {
      return {};
    }

    const entities: Context.Entities<S> = <
      const A extends readonly Expression.AnyValue[] &
        Arguments<Context.EntityFunction<S>["args"]>,
    >(
      ...args: A
    ) => {
      const expression = pipe(
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
          Context.EntityFunction<S>["returns"],
          Inputs.Merge<Context.EntityFunction<S>["inputs"], ArgumentInputs<A>>
        >,
      );

      return this.#query<
        Context.EntityFunction<S>["returns"],
        Context.EntityFunction<S>["vertex"],
        Inputs.Merge<Context.EntityFunction<S>["inputs"], ArgumentInputs<A>>
      >(expression);
    };

    return { entities };
  }

  build(
    body: ($: Context.Context<S>) => Expression.AnyValue,
  ): Result.Result<AST.Node, ProgramError.Construction> {
    try {
      const expression = body(this);
      if (
        !Expression.isExpression(expression) &&
        !(
          expression === null ||
          ["string", "number", "bigint", "boolean"].includes(typeof expression)
        )
      ) {
        return Result.fail(ProgramError.Construction.invalidBodyResult());
      }

      return pipe(
        {
          wrappers: Result.all(this.#wrappers),
          node: Expression.toNode(expression),
        },
        Result.all,
        Result.map(({ wrappers, node }) => {
          let root = node;
          for (const wrap of wrappers.toReversed()) {
            root = wrap(root);
          }

          return root;
        }),
      );
    } catch (error) {
      if (error instanceof ConstructionFailure) {
        return Result.fail(error.failure);
      }

      return Result.fail(
        ProgramError.Construction.callbackException(
          new Cause.UnknownError(error),
        ),
      );
    }
  }
}

/** Evaluates only callbacks checked against the complete explicit-input policy. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- the scope and callback construct a new program
export const evaluate = <
  S extends Scope.Scope,
  I extends Body.Inputs,
  O extends Expression.AnyValue & Expression.Any,
>(
  scope: S & Namespace.Rebindable<S>,
  body: Body.WithoutInputs<S, I, O>,
): Result.Result<
  Expression.Expression<Expression.TypeOf<O>, Body.Requirements<I>>,
  ProgramError.Construction
> =>
  pipe(
    new ContextImpl<S>(scope).build(($) => {
      const expression = body($);
      if (Expression.isExpression(expression)) {
        return expression;
      }
      return Expression.fromResult<Expression.TypeOf<O>, Body.Requirements<I>>(
        Result.fail(ProgramError.Construction.invalidBodyResult()),
      );
    }),
    Result.map(Expression.fromNode<Expression.TypeOf<O>, Body.Requirements<I>>),
  );
