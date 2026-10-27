/**
 * Immutable tables of module, type and value exports.
 *
 * Missing namespace tables introduce no names. Optional tables contribute optional names instead of an arbitrary string index. Merging retains an earlier export when its replacement is optional.
 *
 * Tables are ordinary export records. Merging copies their enumerable own properties before freezing the copies, leaving the caller's records unchanged.
 *
 * A scope holds the names available during construction.
 *
 * @module
 */
import {
  Function,
  Inspectable,
  Pipeable,
  Predicate,
  Record,
  identity,
} from "effect";

import type * as Expression from "./Expression.js";
import type * as Module from "./Module.js";
import type * as TypeExpression from "./TypeExpression.js";
import type { Types } from "effect";

export type TypeId = "~hashql/Scope";
const TypeId: TypeId = "~hashql/Scope";

/** A table of exports by name, in which an optional name can be absent. */
interface Universe<V> extends Record.ReadonlyRecord<string, V | undefined> {}

export const universeKeys = <U extends Universe<V>, V>(
  universe: U,
): (string & keyof U)[] => Record.keys<string & keyof U, U[keyof U]>(universe);

/**
 * Tables that supply a scope, such as a prelude.
 *
 * Each table is optional. A module record, the record `Module.root` returns and `Prelude.builtin` all fit.
 */
export interface Definition<S extends Scope.Any> extends Definition.Base<
  S["modules"],
  S["values"],
  S["types"]
> {}

export declare namespace Definition {
  /** Optional namespace tables retaining their concrete export names. */
  export interface Base<M, V, T> {
    readonly modules?: M;
    readonly values?: V;
    readonly types?: T;
  }

  /** Input tables with their concrete export names erased. */
  export interface Any extends Base<
    Universe<Module.Module.Any>,
    Universe<Expression.Expression.Any>,
    Universe<TypeExpression.Export>
  > {}
}

/** The names one table of a definition contributes: none when omitted, optional when the table is optional. */
type Names<
  D extends Definition.Any,
  K extends keyof Definition.Any,
> = K extends keyof D
  ? undefined extends D[K]
    ? Partial<NonNullable<D[K]>>
    : NonNullable<D[K]>
  : Names.Empty;

declare namespace Names {
  // oxlint-disable-next-line typescript/no-generated-empty-object-type -- an empty namespace has no names
  export type Empty = Record<never, never>;
}

type RequiredKeys<S> = {
  [K in keyof S]-?: Names.Empty extends Pick<S, K> ? never : K;
}[keyof S];
type At<S, K extends PropertyKey> = K extends keyof S ? S[K] : undefined;
type Overridden<B, A, K extends PropertyKey> = K extends keyof A
  ? K extends RequiredKeys<A>
    ? A[K]
    : A[K] | At<B, K>
  : At<B, K>;

/** The module, value and type tables of a construction scope. */
export interface Scope<D extends Definition.Any> extends Scope.Base<
  Names<D, "modules">,
  Names<D, "values">,
  Names<D, "types">
> {}

export declare namespace Scope {
  interface Variance<M, V, T> {
    readonly _M: Types.Covariant<M>;
    readonly _V: Types.Covariant<V>;
    readonly _T: Types.Covariant<T>;
  }

  /** A scope retaining each namespace's table type. */
  export interface Base<M, V, T>
    extends Pipeable.Pipeable, Inspectable.Inspectable {
    readonly [TypeId]: Variance<M, V, T>;
    /** Modules by local name, the starting points for imports and qualified references. */
    readonly modules: Readonly<M>;
    /** Value expressions by name. */
    readonly values: Readonly<V>;
    /** Type expressions and generic type constructors by name. */
    readonly types: Readonly<T>;
  }

  /** A scope with its concrete export names erased. */
  export interface Any extends Base<
    Universe<Module.Module.Any>,
    Universe<Expression.Expression.Any>,
    Universe<TypeExpression.Export>
  > {}

  /** A scope with no names. */
  export type Empty = Scope<Names.Empty>;

  /** Optional replacements retain the earlier type as an alternative. */
  export type Extend<B, A> = {
    readonly [K in RequiredKeys<B> | RequiredKeys<A>]: Overridden<B, A, K>;
  } & {
    readonly [
      K in Exclude<keyof B | keyof A, RequiredKeys<B> | RequiredKeys<A>>
    ]?: Overridden<B, A, K>;
  };

  /**
   * The scope that results from adding the names of `A` to `B`.
   *
   * In each table a name `A` guarantees replaces the earlier entry, and a name `A` declares as optional keeps the earlier entry as an alternative.
   */
  export interface Merge<B extends Any, A extends Definition.Any> extends Base<
    Extend<B["modules"], Names<A, "modules">>,
    Extend<B["values"], Names<A, "values">>,
    Extend<B["types"], Names<A, "types">>
  > {}
}

class ScopeImpl<M, V, T>
  extends Inspectable.Class
  implements Scope.Base<M, V, T>
{
  readonly [TypeId]: Scope.Variance<M, V, T>;
  readonly #modules: Readonly<M>;
  readonly #values: Readonly<V>;
  readonly #types: Readonly<T>;

  declare readonly pipe: Pipeable.Pipeable["pipe"];

  static {
    Object.assign(ScopeImpl.prototype, Pipeable.Prototype);
  }

  constructor({
    modules,
    values,
    types,
  }: {
    readonly modules: M;
    readonly values: V;
    readonly types: T;
  }) {
    super();

    this[TypeId] = { _M: identity, _V: identity, _T: identity };
    this.#modules = Object.freeze(modules);
    this.#values = Object.freeze(values);
    this.#types = Object.freeze(types);
    Object.freeze(this);
  }

  get modules(): Readonly<M> {
    return this.#modules;
  }

  get values(): Readonly<V> {
    return this.#values;
  }

  get types(): Readonly<T> {
    return this.#types;
  }

  toJSON(): Pick<Scope.Base<M, V, T>, keyof Definition.Any> {
    return {
      modules: this.#modules,
      values: this.#values,
      types: this.#types,
    };
  }
}

/** Recognizes the scope marker without validating the export tables. */
// oxlint-disable-next-line typescript/no-restricted-types -- this guard accepts unchecked host values
export const isScope = (value: unknown): value is Scope.Any =>
  Predicate.hasProperty(value, TypeId);

/** Replaces an omitted namespace with an empty table. */
const names = <D extends Definition.Any, K extends keyof Definition.Any>(
  definition: D,
  key: K,
): Names<D, K> =>
  // SAFETY: an omitted namespace has no names. A present table keeps its original entries.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Names models this exact omitted-or-present namespace choice
  (definition[key] ?? {}) as Names<D, K>;

/**
 * Copies and merges scope tables, with later enumerable own names replacing earlier ones.
 *
 * Accepts the original scope first or last. Optional added names retain the earlier export as a type alternative. The operation neither freezes nor mutates either input.
 */
export const merge: {
  <const D extends Definition.Any>(
    added: D,
  ): <S extends Scope.Any>(before: S) => Scope.Merge<S, D>;
  <S extends Scope.Any, const D extends Definition.Any>(
    before: S,
    added: D,
  ): Scope.Merge<S, D>;
} = Function.dual(
  2,
  <B extends Scope.Any, const A extends Definition.Any>(
    before: B,
    added: A,
  ): Scope.Merge<B, A> => {
    const combined = new ScopeImpl({
      modules: {
        ...before.modules,
        ...names(added, "modules"),
      },
      values: {
        ...before.values,
        ...names(added, "values"),
      },
      types: {
        ...before.types,
        ...names(added, "types"),
      },
    });

    // SAFETY: export records supply enumerable own entries. Spreading retains their types, with later names replacing earlier ones as Merge models.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- spread cannot express per-key optional replacement alternatives
    return combined as Scope.Merge<B, A>;
  },
);

/** An immutable scope with no exported names. */
export const empty: Scope.Empty = new ScopeImpl({
  modules: {},
  values: {},
  types: {},
});
