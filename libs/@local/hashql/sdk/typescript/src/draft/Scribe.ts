/**
 * Collects declarations while a synchronous callback constructs an expression.
 *
 * Handles retain semantic parameters until conversion to syntax. Only the declaration wrappers are heterogeneous: each is already an AST operation, so their collection needs no type recovery. A child collector prevents branch declarations from escaping their lexical body. Callback exceptions retain their original cause inside construction failures.
 *
 * @module
 */
// oxlint-disable import/max-dependencies -- the collector composes every construction module
import { Cause, Data, Option, Result, pipe } from "effect";

import * as JExpr from "../JExpr/index.js";
import * as AST from "../Program/AST/index.js";
import * as Expression from "../Program/Expression.js";
import * as Import from "../Program/Import/index.js";
import * as Namespace from "../Program/Namespace.js";
import * as Operators from "../Program/Operators.js";
import * as ProgramError from "../Program/ProgramError.js";
import * as Structural from "../Program/Structural.js";
import * as TypeExpression from "../Program/TypeExpression.js";

import type * as Syntax from "../JExpr/Type/index.js";
import type * as Inputs from "../Program/Inputs.js";
import type * as Module from "../Program/Module.js";
import type * as Scope from "../Program/Scope.js";
import type * as Type from "../Type.js";
import type * as Body from "./Body.js";
import type * as Context from "./Context.js";

type Wrap = (child: AST.Node) => AST.Node;

/** Refers to a declaration by its bare name. */
const reference = (bound: AST.Binding<Syntax.Type>): Syntax.Type => ({
  _tag: "Reference",
  path: JExpr.Path.make({
    rooted: false,
    segments: [{ name: bound.name, arguments: [] }],
  }),
});

/** Adds structural argument normalization without losing the nominal identity on relocation. */
const nominalValue = <N extends string, T extends Type.Any>(
  expression: Expression.Expression<
    Type.Function<readonly [T], Type.Opaque<N, T>>,
    Inputs.Empty
  >,
): Context.NominalValue<N, T> =>
  Expression.adaptCallable(
    expression,
    (self): Context.NominalCall<N, T> =>
      <const V extends Structural.Value<T> & Structural.Value.Any>(
        value: Structural.Value.Exact<T, V>,
      ): Expression.Expression<
        Type.Opaque<N, T>,
        Structural.Value.Requirements<V>
      > =>
        pipe(
          {
            callee: Expression.toJExpr(self),
            argument: Structural.toJExpr(value),
          },
          Result.all,
          Result.map(
            ({ callee, argument }) =>
              new AST.Expr(JExpr.call(callee, argument)),
          ),
          Expression.fromResult<
            Type.Opaque<N, T>,
            Structural.Value.Requirements<V>
          >,
        ),
  );

const nominal = <N extends string, T extends Type.Any>(
  binding: Result.Result<AST.Binding<Syntax.Type>, ProgramError.Construction>,
): Context.Nominal<N, T> => {
  const type = pipe(
    binding,
    Result.map(reference),
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

class ContextImpl<S extends Scope.Scope.Any> implements Context.Context<S> {
  readonly #scope: S & Namespace.Rebindable<S>;
  readonly #prelude: Namespace.Flatten<S>;
  readonly #modules: Namespace.Modules<S>;
  readonly #wrappers: Result.Result<Wrap, ProgramError.Construction>[] = [];
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

    // make sure that destructuring `$` works as expected by binding `this` to each method
    this.prelude = this.prelude.bind(this);
    this.modules = this.modules.bind(this);
    this.import = this.import.bind(this);
    this.let = this.let.bind(this);
    this.type = this.type.bind(this);
    this.newtype = this.newtype.bind(this);
    this.if = this.if.bind(this);
  }

  prelude(): Namespace.Flatten<S> {
    return this.#prelude;
  }
  modules(): Namespace.Modules<S> {
    return this.#modules;
  }

  import<M extends Module.Module.Any>(
    module: M & Import.Rebindable<M>,
  ): Namespace.Flatten<Import.Bindings.Bindings<M, "*">>;
  import<
    M extends Module.Module.Any,
    const I extends Import.Selection<M, keyof I & (string | number)>,
  >(
    module: M & Import.Rebindable<M>,
    selection: I & Import.Selection.Valid<M, I>,
  ): Namespace.Flatten<Import.Bindings.Bindings<M, I>>;
  import<
    M extends Module.Module.Any,
    const I extends Import.Selection<M, keyof I & (string | number)>,
  >(
    module: M & Import.Rebindable<M>,
    // oxlint-disable-next-line hash/prefer-options-object -- the optional argument is the import selection itself
    selection: (I & Import.Selection.Valid<M, I>) | "*" = "*",
  ): Namespace.Flatten<Import.Bindings.Bindings<M, I | "*">> {
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
    return Namespace.flatten<Import.Bindings.Bindings<M, I | "*">>(
      imported.scope,
    );
  }

  let<const E extends Expression.Value.Any>(
    name: string,
    value: E,
  ): Expression.Expression<
    Expression.Value.Type<E>,
    Expression.Value.Inputs<E>
  > {
    const binding = pipe(
      Expression.toNode(value),
      Result.flatMap((node) => AST.make(name, node)),
    );

    this.#wrappers.push(
      Result.map(
        binding,
        (bound): Wrap =>
          (child) =>
            new AST.Let(bound, child),
      ),
    );

    return pipe(
      binding,
      Result.map((bound) => new AST.Expr(JExpr.Ident.compile(bound.name))),
      Expression.fromResult<
        Expression.Value.Type<E>,
        Expression.Value.Inputs<E>
      >,
    );
  }

  type<const D extends Structural.Definition>(
    name: string,
    definition: D,
  ): TypeExpression.TypeExpression<Structural.Definition.Type<D>> {
    const binding = pipe(
      definition,
      Structural.type,
      Result.flatMap(TypeExpression.toType),
      Result.flatMap((syntax) => AST.make(name, syntax)),
    );

    this.#wrappers.push(
      Result.map(
        binding,
        (bound): Wrap =>
          (child) =>
            new AST.Type(bound, child),
      ),
    );

    return pipe(
      binding,
      Result.map(reference),
      TypeExpression.fromResult<Structural.Definition.Type<D>>,
    );
  }

  newtype<const N extends string, const D extends Structural.Definition>(
    name: string extends N ? never : N,
    definition: D,
  ): Context.Nominal<N, Structural.Definition.Type<D>> {
    const binding = pipe(
      definition,
      Structural.type,
      Result.flatMap(TypeExpression.toType),
      Result.flatMap((syntax) => AST.make(name, syntax)),
    );

    this.#wrappers.push(
      Result.map(
        binding,
        (bound): Wrap =>
          (child) =>
            new AST.Newtype(bound, child),
      ),
    );

    return nominal<N, Structural.Definition.Type<D>>(binding);
  }

  if<
    const C extends Expression.Value<Type.PrimitiveBoolean>,
    const T extends Expression.Value.Any,
    const E extends Expression.Value.Any,
  >(
    condition: C,
    branches: {
      readonly then: ($: Context.Context<S>) => T;
      readonly else: ($: Context.Context<S>) => E;
    },
  ): Context.Conditional<C, T, E>;
  if<
    const C extends Expression.Value<Type.PrimitiveBoolean>,
    const T extends Expression.Value.Any,
  >(
    condition: C,
    branches: { readonly then: ($: Context.Context<S>) => T },
  ): Context.Optional<C, T>;
  if(
    condition: Expression.Value<Type.PrimitiveBoolean>,
    branches: {
      readonly then: ($: Context.Context<S>) => Expression.Value.Any;
      readonly else?: ($: Context.Context<S>) => Expression.Value.Any;
    },
  ): Expression.Expression.Any {
    const consequent = new ContextImpl<S>(this.#scope).build(branches.then);
    const alternate = Result.transposeMapOption(
      Option.fromUndefinedOr(branches.else),
      (body) => new ContextImpl<S>(this.#scope).build(body),
    );

    return pipe(
      { condition: Expression.toNode(condition), consequent, alternate },
      Result.all,
      Result.map(
        (nodes) =>
          new AST.If(
            nodes.condition,
            nodes.consequent,
            Option.getOrUndefined(nodes.alternate),
          ),
      ),
      Expression.fromResult<Type.Any, Inputs.Empty>,
    );
  }

  build(
    body: ($: Context.Context<S>) => Expression.Value.Any,
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
  S extends Scope.Scope.Any,
  I extends Body.Inputs,
  O extends Expression.Value.Any & Expression.Expression.Any,
>(
  scope: S & Namespace.Rebindable<S>,
  body: Body.WithoutInputs<S, I, O>,
): Result.Result<
  Expression.Expression<Expression.Value.Type<O>, Body.Requirements<I>>,
  ProgramError.Construction
> =>
  pipe(
    new ContextImpl<S>(scope).build(($) => {
      const expression = body($);
      if (Expression.isExpression(expression)) {
        return expression;
      }
      return Expression.fromResult<
        Expression.Value.Type<O>,
        Body.Requirements<I>
      >(Result.fail(ProgramError.Construction.invalidBodyResult()));
    }),
    Result.map(
      Expression.fromNode<Expression.Value.Type<O>, Body.Requirements<I>>,
    ),
  );
