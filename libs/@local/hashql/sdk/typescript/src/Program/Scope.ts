/**
 * Immutable tables of module, type and value exports.
 *
 * Missing namespace tables introduce no names. Optional tables contribute optional names instead of an arbitrary string index. Merging retains an earlier export when its replacement is optional, and snapshots include non-enumerable own exports without freezing the caller's records.
 *
 * Each scope holds the names available to a construction callback. The prelude supplies the first one, and each declaration step of the Do API merges its names into the scope of the steps after it. Do callbacks receive the value and type tables as separate arguments, while Draft's `$.prelude()` joins them into one object in which a name can hold a module, a type and a value at once.
 *
 * @module
 */
import type * as Expression from "./Expression.js";
import type * as Module from "./Module.js";
import type * as TypeExpression from "./TypeExpression.js";
import type { ReadonlyRecord } from "effect/Record";

/** A table of exports by name, in which an optional name can be absent. */
interface Universe<V> extends ReadonlyRecord<string, V | undefined> {}

/** The module, value and type tables of a construction scope. */
export interface Scope {
  /** Modules by local name, the starting points for imports and qualified references. */
  readonly modules: Universe<Module.Any>;
  /** Value expressions by name. */
  readonly values: Universe<Expression.Any>;
  /** Type expressions and generic type constructors by name. */
  readonly types: Universe<TypeExpression.Export>;
}

/**
 * Tables that supply a scope, such as a prelude.
 *
 * Each table is optional. A module record, the record `Module.root` returns and `Prelude.builtin` all fit.
 */
export interface Definition {
  readonly modules?: Scope["modules"];
  readonly values?: Scope["values"];
  readonly types?: Scope["types"];
}

// oxlint-disable-next-line typescript/no-generated-empty-object-type -- an empty namespace has no names
type EmptyNames = Record<never, never>;

/** The names one table of a definition contributes: none when omitted, optional when the table is optional. */
type Names<D extends Definition, K extends keyof Scope> = K extends keyof D
  ? undefined extends D[K]
    ? Partial<NonNullable<D[K]>>
    : NonNullable<D[K]>
  : EmptyNames;

/** The scope a definition supplies, with an empty table for each omitted one and optional names for each optional one. */
export interface From<D extends Definition> {
  readonly modules: Names<D, "modules">;
  readonly values: Names<D, "values">;
  readonly types: Names<D, "types">;
}

/** A scope with no names, which the default Do API starts from. */
export type Empty = From<EmptyNames>;

type RequiredKeys<S> = {
  [K in keyof S]-?: EmptyNames extends Pick<S, K> ? never : K;
}[keyof S];
type At<S, K extends PropertyKey> = K extends keyof S ? S[K] : undefined;
type Overridden<B, A, K extends PropertyKey> = K extends keyof A
  ? K extends RequiredKeys<A>
    ? A[K]
    : A[K] | At<B, K>
  : At<B, K>;

/** Optional replacements retain the earlier type as an alternative. */
export type Extend<B, A> = {
  readonly [K in RequiredKeys<B> | RequiredKeys<A>]: Overridden<B, A, K>;
} & {
  readonly [K in Exclude<
    keyof B | keyof A,
    RequiredKeys<B> | RequiredKeys<A>
  >]?: Overridden<B, A, K>;
};

/**
 * The scope that results from adding the names of `A` to `B`.
 *
 * In each table a name `A` guarantees replaces the earlier entry, and a name `A` declares as optional keeps the earlier entry as an alternative.
 */
export interface Merge<B extends Scope, A extends Definition> {
  readonly modules: Extend<B["modules"], Names<A, "modules">>;
  readonly values: Extend<B["values"], Names<A, "values">>;
  readonly types: Extend<B["types"], Names<A, "types">>;
}

/** Copies own exports, including non-enumerable names, without freezing the caller's table. */
export const snapshot = <E extends Scope[keyof Scope]>(
  entries: E,
): Readonly<E> => {
  const copy = { ...entries };

  for (const name of Object.getOwnPropertyNames(entries)) {
    Object.defineProperty(copy, name, {
      value: entries[name],
      enumerable: true,
    });
  }

  return Object.freeze(copy);
};

// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- combines separate namespaces rather than transforming the first argument
export const merge = <B extends Scope, const A extends Definition>(
  before: B,
  added: A,
): Merge<B, A> => {
  const combined = Object.freeze({
    modules: Object.freeze({
      ...snapshot(before.modules),
      ...snapshot(added.modules ?? {}),
    }),
    values: Object.freeze({
      ...snapshot(before.values),
      ...snapshot(added.values ?? {}),
    }),
    types: Object.freeze({
      ...snapshot(before.types),
      ...snapshot(added.types ?? {}),
    }),
  });

  // SAFETY: each namespace copies all own exports, replacing an earlier value only when the later table supplies that name.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- object spread cannot express per-key optional override alternatives
  return combined as Merge<B, A>;
};

export const empty: Empty = Object.freeze({
  modules: Object.freeze({}),
  values: Object.freeze({}),
  types: Object.freeze({}),
});
