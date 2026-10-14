/**
 * The explicit-input policy of a Draft program callback.
 *
 * Every operation that emits a value checks its requirements, including discarded let initializers and nested callback bodies. This policy belongs to the program boundary rather than Context: the constructor implementation can accept more values than a particular program permits. The result conservatively requires the entire supplied schema, including unused entries.
 *
 * @module
 */
import type * as Expression from "../program/Expression.js";
import type { ArgumentInputs, Arguments } from "../program/ExpressionType.js";
import type * as Input from "../program/Inputs.js";
import type * as Scope from "../program/Scope.js";
import type * as TypeExpression from "../program/TypeExpression.js";
import type * as Type from "../type/index.js";
import type * as Construction from "./Context.js";
import type { ReadonlyRecord } from "effect/Record";

export type Inputs = ReadonlyRecord<string, TypeExpression.Any>;
type TypeInputs<I extends Inputs> = {
  readonly [K in keyof I]: I[K] extends TypeExpression.TypeExpression<infer T>
    ? T
    : never;
};
export type Requirements<I extends Inputs> = Input.Conservative<TypeInputs<I>>;
export type Handle<K extends PropertyKey, D extends TypeExpression.Any> =
  D extends TypeExpression.TypeExpression<infer T>
    ? Expression.Expression<T, Readonly<Record<K, T>>>
    : never;
export type Handles<I extends Inputs> = {
  readonly [K in keyof I]: Handle<K, I[K]>;
};

// oxlint-disable-next-line typescript/no-restricted-types -- distributes the check over host alternatives without erasing any input record
type Mismatches<S, I> = I extends unknown
  ? {
      [K in keyof I]-?: K extends keyof S
        ? [S[K]] extends [Exclude<I[K], undefined>]
          ? [Exclude<I[K], undefined>] extends [S[K]]
            ? never
            : K
          : K
        : K;
    }[keyof I]
  : never;

/** All host alternatives must fit the schema. Erased requirements cannot prove that. */
export type Check<S, I> = [I] extends [never]
  ? never
  : [Mismatches<S, Input.Conservative<I>>] extends [never]
    ? // oxlint-disable-next-line typescript/no-restricted-types -- unknown is the identity of an accepted intersection constraint
      unknown
    : never;
type Accept<I, E> = Check<I, Expression.Inputs<E>>;

type Query<
  S extends Scope.Scope,
  I,
  T extends Type.Any,
  V extends Type.Any,
  R,
> = Expression.Expression<T, R> & {
  readonly filter: <const P extends Expression.Value<Type.PrimitiveBoolean>>(
    name: string,
    predicate: (
      $: Context<S, I>,
      vertex: Expression.Expression<V, Input.Empty>,
    ) => P & Accept<I, P>,
  ) => Query<S, I, T, V, Input.Merge<R, Expression.Inputs<P>>>;
  readonly collect: () => Expression.Expression<Type.List<V>, R>;
};

type EntityFunction<S extends Scope.Scope> = Construction.EntityFunction<S>;
type QueryContext<S extends Scope.Scope, I> = [EntityFunction<S>] extends [
  never,
]
  ? // oxlint-disable-next-line typescript/no-generated-empty-object-type -- no graph declaration means no query entry point
    Record<never, never>
  : {
      readonly entities: <
        const A extends readonly Expression.AnyValue[] &
          Arguments<EntityFunction<S>["args"]>,
      >(
        ...args: A &
          Check<I, Input.Merge<EntityFunction<S>["inputs"], ArgumentInputs<A>>>
      ) => Query<
        S,
        I,
        EntityFunction<S>["returns"],
        EntityFunction<S>["vertex"],
        Input.Merge<EntityFunction<S>["inputs"], ArgumentInputs<A>>
      >;
    };

/** A restricted view that the unrestricted constructor implements. */
export interface Context<S extends Scope.Scope, I> extends Omit<
  Construction.Context<S>,
  "let" | "ifElse" | "query"
> {
  readonly let: <const E extends Expression.AnyValue>(
    name: string,
    value: E & Accept<I, E>,
  ) => Expression.Expression<Expression.TypeOf<E>, Expression.Inputs<E>>;
  readonly query: QueryContext<S, I>;
  readonly ifElse: {
    <
      const C extends Expression.Value<Type.PrimitiveBoolean>,
      const T extends Expression.AnyValue,
      const E extends Expression.AnyValue,
    >(
      condition: C & Accept<I, C>,
      branches: {
        readonly then: T & Accept<I, T>;
        readonly else: E & Accept<I, E>;
      },
    ): Construction.Conditional<C, T, E>;
    <
      const C extends Expression.Value<Type.PrimitiveBoolean>,
      const T extends Expression.AnyValue,
      const E extends Expression.AnyValue,
    >(
      condition: C & Accept<I, C>,
      then: ($: Context<S, I>) => T & Accept<I, T>,
      otherwise: ($: Context<S, I>) => E & Accept<I, E>,
    ): Construction.Conditional<C, T, E>;
  };
}

export type Body<
  S extends Scope.Scope,
  I extends Inputs,
  O extends Expression.AnyValue & Expression.Any,
> = (
  $: Context<S, Requirements<I>>,
  inputs: Handles<I>,
) => O & Check<NoInfer<Requirements<I>>, Expression.Inputs<O>>;

export type WithoutInputs<
  S extends Scope.Scope,
  I extends Inputs,
  O extends Expression.AnyValue & Expression.Any,
> = ($: Context<S, Requirements<I>>) => ReturnType<Body<S, I, O>>;
