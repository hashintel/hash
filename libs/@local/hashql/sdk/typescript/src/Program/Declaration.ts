/** Deferred module exports and their three runtime binding behaviors. @module */
import {
  Equal,
  Hash,
  Pipeable,
  Predicate,
  Result,
  flow,
  identity,
} from "effect";

import * as JExpr from "../JExpr/index.js";
import * as Expression from "./Expression.js";
import * as TypeExpression from "./TypeExpression.js";

import type * as Type from "../Type.js";
import type * as Inputs from "./Inputs.js";
import type * as ProgramError from "./ProgramError.js";
import type { Types } from "effect";

export const Declare: unique symbol = Symbol("~hashql/ModuleDeclaration");
const TypeId = "~hashql/Declaration";

/**
 * An export waiting for a module to supply its absolute path.
 *
 * The produced export `E` is covariant. Equality compares factory behavior and generic arity, not the erased TypeScript descriptor. Binding is the first operation that emits syntax or validates arity.
 */
export interface Declaration<out E> extends Equal.Equal, Pipeable.Pipeable {
  readonly [TypeId]: Types.Covariant<E>;
  readonly [Declare]: (
    path: JExpr.Path.Path,
  ) => Result.Result<E, ProgramError.Construction>;
}

export declare namespace Declaration {
  /** A declaration with its produced export type erased. */
  export interface Any extends Declaration<
    TypeExpression.Export | Expression.Expression.Any
  > {}
}

interface ValueBehavior {
  readonly _tag: "value";
}

interface TypeBehavior {
  readonly _tag: "type";
}

interface GenericTypeBehavior {
  readonly _tag: "genericType";
  readonly arity: number;
}

/** The runtime behavior available from the three declaration factories. */
type Behavior = ValueBehavior | TypeBehavior | GenericTypeBehavior;

/** Compares factory behavior rather than fresh binding closure identities. */
class DeclarationImpl<E> extends Pipeable.Class implements Declaration<E> {
  readonly [TypeId]: Types.Covariant<E> = identity;
  readonly [Declare]: Declaration<E>[typeof Declare];
  readonly #behavior: Behavior;

  constructor(behavior: Behavior, bind: Declaration<E>[typeof Declare]) {
    super();
    this.#behavior = Object.freeze(behavior);
    this[Declare] = bind;
    Object.freeze(this);
  }

  [Equal.symbol](that: Equal.Equal): boolean {
    return (
      that instanceof DeclarationImpl &&
      Equal.equals(this.#behavior, that.#behavior)
    );
  }

  [Hash.symbol](): number {
    return Hash.hash(this.#behavior);
  }
}

/** Recognizes a declaration by its marker property, without checking its binding operation. */
export const isDeclaration = <E>(
  entry: Declaration<E> | E,
): entry is Declaration<E> => Predicate.hasProperty(entry, TypeId);

/**
 * Declares a value with trusted semantic type information.
 *
 * The bound export emits its absolute path, such as `::core::math::rem`, and requires no inputs. `T` decides which calls, projections and indexing TypeScript accepts, and a function descriptor makes the export callable. Nothing checks that the HashQL value has this type.
 */
export const value = <T extends Type.Any>(): Declaration<
  Expression.Expression<T, Inputs.Empty>
> =>
  new DeclarationImpl(
    { _tag: "value" },
    flow(
      JExpr.Path.compile,
      Expression.fromJExpr<T, Inputs.Empty>,
      Result.succeed,
    ),
  );

/**
 * Declares a named type without expanding it into its structural representation.
 *
 * Once bound, the export emits a reference to its absolute path, such as `::core::uuid::Uuid`. TypeScript takes its descriptor `T` on trust.
 */
export const type = <T extends Type.Any>(): Declaration<
  TypeExpression.TypeExpression<T>
> =>
  new DeclarationImpl(
    { _tag: "type" },
    flow(TypeExpression.reference<T>, Result.succeed),
  );

/**
 * Declares a named generic type with a type-level operation for its result.
 *
 * TypeScript requires `arity` to equal `F["arity"]`. Binding returns a {@link ProgramError.Construction} failure with reason `InvalidTypeArity` for an arity that is not a non-negative safe integer. The bound constructor emits applications of the export's path and checks the argument count of each call.
 */
export const genericType = <F extends Type.TypeConstructor>(
  arity: F["arity"],
): Declaration<TypeExpression.Constructor<F>> =>
  new DeclarationImpl({ _tag: "genericType", arity }, (path) =>
    TypeExpression.constructor<F>(path, arity),
  );
