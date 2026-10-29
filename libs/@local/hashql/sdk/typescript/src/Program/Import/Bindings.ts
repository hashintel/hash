/**
 * The names an import binds, with the module and selection that produced them.
 *
 * An import selects module, type and value exports from one module under local names. Its bindings keep each selected export's type. The type of their marker records the source module and the selection. {@link @local/hashql!Program.Namespace.Flatten | Namespace.Flatten} reads that type to keep capabilities that arrive together under one source name. No runtime code reads the marker.
 *
 * @module
 */

import { identity } from "effect";

import type * as Module from "../Module.js";
import type * as Scope from "../Scope.js";
import type { Types } from "effect";

export type TypeId = "~hashql/Bindings";
const TypeId: TypeId = "~hashql/Bindings";

/** Filters and renames a table, requiring only names present in every selection alternative. */
export type Selected<E, I> = Selected.Merge<Selected.Branch<E, I>>;

declare namespace Selected {
  /** Distributes the sentinel conversion over alias alternatives. */
  type Name<K, A> = A extends "_" ? K : A extends string ? A : never;

  /** A required tuple position guarantees its name only when that position has no other alternative. */
  type Includes<I, K> = I extends readonly [infer H, ...infer T]
    ? [H] extends [K]
      ? true
      : Includes<T, K>
    : false;

  type Names<E, I> = {
    readonly [K in keyof E as K extends keyof I ? Name<K, I[K]> : never]?: E[K];
  };

  /** A source and its alias must both be present, and every alias alternative must resolve to A. */
  type RequiredAlias<E, I, A> = {
    [K in keyof E]-?: K extends keyof I
      ? undefined extends E[K] | I[K]
        ? never
        : [Name<K, I[K]>] extends [A]
          ? K
          : never
      : never;
  }[keyof E];

  type Aliased<E, I> = {
    readonly [
      A in keyof Names<E, I> as RequiredAlias<E, I, A> extends never ? never : A
    ]-?: Exclude<Names<E, I>[A], undefined>;
  } & Names<E, I>;

  type Listed<E, I extends readonly string[]> = {
    readonly [
      K in keyof E as K extends I[number]
        ? Includes<I, K> extends true
          ? K
          : never
        : never
    ]: E[K];
  } & {
    readonly [
      K in keyof E as K extends I[number]
        ? Includes<I, K> extends true
          ? never
          : K
        : never
    ]?: E[K];
  };

  type Branch<E, I> = I extends "*"
    ? E
    : I extends readonly string[]
      ? Listed<E, I>
      : Aliased<E, I>;

  type Keys<T> = T extends T ? keyof T : never;
  type Value<T, K> = T extends T ? (K extends keyof T ? T[K] : never) : never;

  /** Merge alternatives without hiding their distinct names or promising mutually exclusive members. */
  type Merge<T> = {
    readonly [
      K in Keys<T> as [T] extends [Readonly<Record<K, Value<T, K>>>] ? K : never
    ]: Value<T, K>;
  } & {
    readonly [
      K in Keys<T> as [T] extends [Readonly<Record<K, Value<T, K>>>] ? never : K
    ]?: Exclude<Value<T, K>, undefined>;
  };
}

/**
 * The module, type and value tables an import adds to a scope, keyed by local name.
 *
 * Flattening keeps the capabilities that one source name supplies together, without treating independently optional exports as required. A destination with more than one possible source name keeps the independent view, as does a scope without the marker.
 *
 * The flattened type trusts the marker. A copy that keeps the marker while replacing a table flattens as an import's result, as does a record written with the marker by hand. Its flattened type can then claim a capability the object lacks. The import freezes the bindings and their tables.
 */
export interface Bindings<M extends Module.Module.Any, I> {
  readonly [TypeId]: Bindings.Variance<M, I>;
  readonly modules: Selected<M["modules"], I>;
  readonly types: Selected<M["types"], I>;
  readonly values: Selected<M["values"], I>;
}

export declare namespace Bindings {
  /** The marker's type, recording the source module and the selection. */
  interface Variance<M, I> {
    readonly _M: Types.Covariant<M>;
    readonly _I: Types.Covariant<I>;
  }

  /** Different source alternatives cannot establish joint presence at a shared alias. */
  type Single<T, All = T> = T extends T
    ? [All] extends [T]
      ? T
      : never
    : never;

  /** Each local name, mapped to the source export names the selection can bind to it. */
  type Origins<M extends Module.Module.Any, I> = Selected<
    {
      readonly [K in Module.Module.Items<M>]: K;
    },
    I
  >;

  /** The one source export name that local name `K` can come from, or `never` when the selection allows more than one. */
  type Origin<M extends Module.Module.Any, I, K> = Single<
    Exclude<Origins<M, I>[K & keyof Origins<M, I>], undefined>
  >;

  /** The namespaces in which module `M` guarantees an export named `K`. */
  type RequiredAt<M extends Module.Module.Any, K> = [K] extends [never]
    ? never
    : {
        [N in keyof Scope.Definition.Any]: K extends keyof M[N]
          ? undefined extends M[N][K]
            ? never
            : N
          : never;
      }[keyof Scope.Definition.Any];

  /** Namespaces guaranteed after selecting a destination's sole possible source. Ordinary scopes and ambiguous aliases establish no such relationship. */
  type RequiredNamespaces<S, K> =
    S extends Bindings<infer M, infer I>
      ? RequiredAt<M, Origin<M, I, K>>
      : never;

  /** An entry after guarding its flattened destination, retaining independently optional source exports. Scopes without import bindings use their table entry unchanged. */
  type Entry<
    S extends Required<Scope.Definition.Any>,
    N extends keyof Scope.Definition.Any,
    K extends PropertyKey,
  > = K extends keyof S[N]
    ? N extends RequiredNamespaces<S, K>
      ? Exclude<S[N][K], undefined>
      : S[N][K]
    : undefined;
}

/** The module, type and value tables that one selection produces. */
type Tables<M extends Module.Module.Any, I> = Pick<
  Bindings<M, I>,
  "modules" | "types" | "values"
>;

/** Holds tables selected together from one module and freezes them with their marker. */
class BindingsImpl<M extends Module.Module.Any, I> implements Bindings<M, I> {
  readonly [TypeId]: Bindings.Variance<M, I> = { _M: identity, _I: identity };
  readonly modules: Bindings<M, I>["modules"];
  readonly types: Bindings<M, I>["types"];
  readonly values: Bindings<M, I>["values"];

  constructor({ modules, types, values }: Tables<M, I>) {
    this.modules = modules;
    this.types = types;
    this.values = values;
    Object.freeze(this);
  }
}

/**
 * Marks tables selected together from one module as that module's bindings.
 *
 * The package exports only this module's types, so the import is the only caller. It passes tables it selected with one plan.
 */
export const make = <M extends Module.Module.Any, I>(
  tables: Tables<M, I>,
): Bindings<M, I> => new BindingsImpl<M, I>(tables);
