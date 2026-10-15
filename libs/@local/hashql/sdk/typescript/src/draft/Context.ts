/**
 * Typed construction operations inside a synchronous Draft callback.
 *
 * Context preserves each operation's semantic type and input requirements. It does not select an input policy: the program callback contract checks declarations against its explicit input schema. Nested callbacks receive fresh declaration collectors with the same prelude.
 *
 * @module
 */
import type { Relocatable, Relocate } from "../internal/relocation.js";
import type {
  Expression,
  Inputs,
  Module,
  Operators,
  Type,
  TypeExpression,
} from "../main.js";
import type { ArgumentInputs, Arguments } from "../program/ExpressionType.js";
import type * as Import from "../program/Import.js";
import type * as Namespace from "../program/Namespace.js";
import type * as QueryTypes from "../program/Query.js";
import type * as Scope from "../program/Scope.js";
import type * as Structural from "../program/Structural.js";

export type NominalCall<N extends symbol, T extends Type.Any> = <
  const V extends Structural.Value<T> & Structural.AnyValue,
>(
  value: Structural.Exact<T, V>,
) => Expression.Expression<Type.Opaque<N, T>, Structural.Requirements<V>>;

/** Each constructor has one rebinding result rather than an intersection of recursive overloads. */
export interface NominalValue<N extends symbol, T extends Type.Any>
  extends Expression.Any, NominalCall<N, T> {
  readonly "~hashql/Expression": Expression.Handle<
    Type.Function<readonly [T], Type.Opaque<N, T>>,
    Inputs.Empty
  >["~hashql/Expression"];
  readonly [Relocate]: Relocatable<NominalValue<N, T>>[typeof Relocate];
}

export type Nominal<N extends symbol, T extends Type.Any> = Namespace.Joined<
  NominalValue<N, T>,
  TypeExpression.TypeExpression<Type.Opaque<N, T>>
>;

export type Query<
  S extends Scope.Scope,
  T extends Type.Any,
  V extends Type.Any,
  I,
> = Expression.Expression<T, I> & {
  readonly filter: <const P extends Expression.Value<Type.PrimitiveBoolean>>(
    name: string,
    predicate: (
      $: Context<S>,
      vertex: Expression.Expression<V, Inputs.Empty>,
    ) => P,
  ) => Query<S, T, V, Inputs.Merge<I, Expression.Inputs<P>>>;
  readonly collect: () => Expression.Expression<Type.List<V>, I>;
};

export type EntityFunction<S extends Scope.Scope> =
  QueryTypes.EntityFunction<S>;

export type Entities<S extends Scope.Scope> = <
  const A extends readonly Expression.AnyValue[] &
    Arguments<EntityFunction<S>["args"]>,
>(
  ...args: A
) => Query<
  S,
  EntityFunction<S>["returns"],
  EntityFunction<S>["vertex"],
  Inputs.Merge<EntityFunction<S>["inputs"], ArgumentInputs<A>>
>;

export type QueryContext<S extends Scope.Scope> = [EntityFunction<S>] extends [
  never,
]
  ? // oxlint-disable-next-line typescript/no-generated-empty-object-type -- a scope without a graph declaration supplies no query entry point
    Record<never, never>
  : { readonly entities: Entities<S> };

export type Branches<
  S extends Scope.Scope,
  T extends Expression.AnyValue,
  E extends Expression.AnyValue,
> =
  | readonly [branches: { readonly then: T; readonly else: E }]
  | readonly [then: ($: Context<S>) => T, otherwise: ($: Context<S>) => E];

export type Conditional<
  C extends Expression.Value<Type.PrimitiveBoolean>,
  T extends Expression.AnyValue,
  E extends Expression.AnyValue,
> = Expression.Expression<
  Expression.Conditional<Expression.TypeOf<T>, Expression.TypeOf<E>>,
  Inputs.Merge<
    Expression.Inputs<C>,
    Inputs.Merge<Expression.Inputs<T>, Expression.Inputs<E>>
  >
>;

export interface Context<S extends Scope.Scope> extends Operators.Operations {
  readonly prelude: () => Namespace.Flatten<S>;
  readonly modules: () => Namespace.Modules<S>;
  readonly import: {
    <M extends Module.Any>(
      module: M & Import.Rebindable<M>,
    ): Namespace.Flatten<Import.Imported<M, "*">>;
    <M extends Module.Any, const I extends Import.Selection<M>>(
      module: M & Import.Rebindable<M>,
      selection: I,
    ): Namespace.Flatten<Import.Imported<M, I>>;
  };
  readonly literal: typeof Expression.literal;
  readonly integer: typeof Expression.integer;
  readonly number: typeof Expression.number;
  readonly assume: typeof Expression.assume;
  readonly input: typeof Expression.input;
  readonly query: QueryContext<S>;
  readonly let: <const E extends Expression.AnyValue>(
    name: string,
    value: E,
  ) => Expression.Expression<Expression.TypeOf<E>, Expression.Inputs<E>>;
  readonly type: <const D extends Structural.Definition>(
    name: string,
    definition: D,
  ) => TypeExpression.TypeExpression<Structural.TypeOf<D>>;
  readonly newtype: <
    const N extends symbol,
    const D extends Structural.Definition,
  >(
    name: string,
    identity: symbol extends N ? never : N,
    definition: D,
  ) => Nominal<N, Structural.TypeOf<D>>;
  readonly ifElse: <
    const C extends Expression.Value<Type.PrimitiveBoolean>,
    const T extends Expression.AnyValue,
    const E extends Expression.AnyValue,
  >(
    condition: C,
    ...branches: Branches<S, T, E>
  ) => Conditional<C, T, E>;
}
