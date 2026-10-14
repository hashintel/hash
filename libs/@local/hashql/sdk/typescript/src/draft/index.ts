import type * as Expression from "../program/Expression.js";
import type * as Scope from "../program/Scope.js";
import type * as TypeExpression from "../program/TypeExpression.js";
import type * as Type from "../type/index.js";
import type { Result } from "effect";
import type { ReadonlyRecord } from "effect/Record";

export type Inputs = ReadonlyRecord<string, TypeExpression.Any>;

declare namespace Inputs {
  export type Empty = ReadonlyRecord<string, never>;

  export type ProgramInput<I> = I extends Inputs
    ? {
        readonly [Key in keyof I]: I[Key] extends TypeExpression.TypeExpression<
          infer Type
        >
          ? Expression.Expression<Type, never>
          : never;
      }
    : never;
}

type ScopeKeys<S extends Scope.Scope> =
  | keyof S["modules"]
  | keyof S["values"]
  | keyof S["types"];

/** `unknown` is the identity of `&`, so namespaces lacking the key drop out. */
type Lookup<Namespace, Key extends PropertyKey> = Key extends keyof Namespace
  ? Namespace[Key]
  : unknown;

type Prelude<S extends Scope.Scope> = {
  readonly [Key in ScopeKeys<S>]: Lookup<S["modules"], Key> &
    Lookup<S["values"], Key> &
    Lookup<S["types"], Key>;
};

type DefaultPrelude = Scope.Scope;

interface Context<P extends Scope.Scope> {
  readonly prelude: () => Prelude<P>;
  readonly let: <T extends Type.Any, Inputs>(
    name: string,
    value: Expression.Expression<T, Inputs>,
  ) => Expression.Expression<T, Inputs>;
  readonly newtype: <T extends Type.Any>(
    name: string,
    value: T,
  ) => Expression.Expression<T, never> & TypeExpression.TypeExpression<T>;
  readonly type: <T extends Type.Any>(
    name: string,
    value: T,
  ) => TypeExpression.TypeExpression<T>;
  readonly ifElse: (<T extends Type.Any>(
    condition: Expression.Expression<Type.PrimitiveBoolean, never>,
    then: ($: Context<P>) => Expression.Expression<T, never>,
    else: ($: Context<P>) => Expression.Expression<T, never>,
  ) => Expression.Expression<T, never> ) | (/* the other version lol */);

  readonly query: [...]
}

class DraftError {}

const programWithPrelude = <
  Prelude extends Scope.Scope,
  I extends Inputs,
  O extends Type.Any,
>(
  prelude: Prelude,
  inputs: I,
  draft: ($: Context<Prelude>, inputs: I) => Expression.Expression<O, never>,
): Result.Result<Expression.Expression<O, never>, DraftError> => {
  // todo!()
};

const program = <I extends Inputs, O extends Type.Any>(
  inputs: I,
  draft: (
    $: Context<DefaultPrelude>,
    inputs: I,
  ) => Expression.Expression<O, never>,
): Result.Result<Expression.Expression<O, never>, DraftError> =>
  programWithPrelude(Scope.empty, inputs, draft);
