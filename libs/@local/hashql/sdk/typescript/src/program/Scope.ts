/**
 * Immutable tables of module, type and value exports.
 *
 * Missing namespace tables introduce no names. Optional tables contribute optional names instead of an arbitrary string index. Merging retains an earlier export when its replacement is optional, and snapshots include non-enumerable own exports without freezing the caller's records.
 *
 * @module
 */
import type * as Expression from "./Expression.js";
import type * as Module from "./Module.js";
import type * as TypeExpression from "./TypeExpression.js";
import type { ReadonlyRecord } from "effect/Record";

interface Universe<V> extends ReadonlyRecord<string, V | undefined> {}

export interface Scope {
  readonly modules: Universe<Module.Any>;
  readonly values: Universe<Expression.Any>;
  readonly types: Universe<TypeExpression.Export>;
}

export interface Definition {
  readonly modules?: Scope["modules"];
  readonly values?: Scope["values"];
  readonly types?: Scope["types"];
}

// oxlint-disable-next-line typescript/no-generated-empty-object-type -- an empty namespace has no names
type EmptyNames = Record<never, never>;

type Names<D extends Definition, K extends keyof Scope> = K extends keyof D
  ? undefined extends D[K]
    ? Partial<NonNullable<D[K]>>
    : NonNullable<D[K]>
  : EmptyNames;

export interface From<D extends Definition> {
  readonly modules: Names<D, "modules">;
  readonly values: Names<D, "values">;
  readonly types: Names<D, "types">;
}

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
