/**
 * Shared names with separate module, type and value capabilities.
 *
 * A flattened name can be a value, a type constructor and a module at once. Type metadata wins property collisions, followed by module exports and then value projections. Explicit projection and indexing remain available through `$project` and `$index`. Rebinding a joined name moves every capability, rather than following property-lookup precedence.
 *
 * Draft's `$.prelude()`, `$.modules()` and `$.import(...)` return these flattened views. A name that only optional entries supply is optional, and a module also exposes its child exports directly, beside its own `modules`, `types` and `values` tables.
 *
 * @module
 */
// oxlint-disable max-lines -- capability joining and scope flattening share producer tracking, export lookup and rebinding machinery
import { Function, Result, pipe } from "effect";

import { Relocate } from "../internal/relocation.js";
import * as Expression from "./Expression.js";
import * as Module from "./Module.js";
import * as Structural from "./Structural.js";
import * as TypeExpression from "./TypeExpression.js";

import type { Relocatable } from "../internal/relocation.js";
import type { JExpr, Type } from "../main.js";
import type { Accessors } from "./ExpressionType.js";
import type * as ProgramError from "./ProgramError.js";
import type * as Scope from "./Scope.js";

/** A producer that retains a rebinding operation in its result. */
interface Capability extends Relocatable<Capability> {}

type RebindableEntry<E> = E extends Capability ? Relocatable<E> : E;

/**
 * Scope exports need string names and producers that preserve their properties during rebinding.
 *
 * Draft's `withPrelude` requires this of a custom prelude. An export extended through `Object.assign` fails it, because rebinding would drop the added properties.
 */
export type Rebindable<S extends Scope.Definition> = {
  readonly [N in keyof S]: N extends keyof Scope.Scope
    ? {
        readonly [K in keyof S[N]]: K extends symbol
          ? never
          : RebindableEntry<S[N][K]>;
      }
    : S[N];
};
const Components: unique symbol = Symbol("~hashql/NamespaceComponents");

// oxlint-disable-next-line typescript/no-generated-empty-object-type -- an absent capability contributes no properties
type Empty = Record<never, never>;
type Present<E> = E extends undefined ? Empty : E;
type Lookup<S, K extends PropertyKey> = K extends keyof S ? S[K] : undefined;

/** Keeps original producers available after repeated joins, including their generic call signatures. */
type Part<E, C> = E extends {
  readonly [Components]: readonly [infer L, infer R];
}
  ? Part<R, C> extends undefined
    ? Part<L, C>
    : Part<R, C>
  : E extends C
    ? E
    : undefined;

type Parts<L, R, C> = Part<R, C> extends undefined ? Part<L, C> : Part<R, C>;

type Metadata<M, T, V> = Omit<
  Present<M>,
  keyof Present<T> | (V extends Expression.Any ? ExpressionReserved : never)
> &
  Present<T>;

type ExpressionReserved = "$project" | "$index" | "~hashql/Expression";

/** Removes shadowed projections without discarding generic call signatures. */
type WithMetadata<V, M> = V extends Expression.Any
  ? M &
      (Expression.TypeOf<V> extends
        | Type.Function.Any
        | Type.GenericFunction.Any
        | Type.Primitive
        ? V
        : Expression.Handle<Expression.TypeOf<V>, Expression.Inputs<V>> &
            Omit<
              Accessors<Expression.TypeOf<V>, Expression.Inputs<V>>,
              Exclude<keyof M, ExpressionReserved>
            >)
  : M & V;

type Combined<L, R> = WithMetadata<
  Present<Parts<L, R, Expression.Any>>,
  Metadata<
    Parts<L, R, Module.Any>,
    Parts<L, R, TypeExpression.Export>,
    Parts<L, R, Expression.Any>
  >
>;

/**
 * One name carrying the capabilities of two exports, such as a value constructor and the type it constructs.
 *
 * Property reads follow the precedence the module introduction states. A call with type arguments reaches the type constructor, and a call with value arguments reaches the value. The last relocation signature returns the whole joined capability set.
 */
export type Joined<L, R> = Combined<L, R> & {
  readonly [Components]: readonly [L, R];
} & Relocatable<Joined<L, R>>;

/** Distributes over optional entries instead of intersecting their undefined alternatives. */
type Selected<L, R> = L extends undefined
  ? R
  : R extends undefined
    ? L
    : Joined<L, R>;

type ModuleView<M extends Module.Any> = M &
  Omit<Flatten<M>, keyof M> &
  Relocatable<ModuleView<M>>;

type Viewed<M> = M extends Module.Any ? ModuleView<M> : undefined;

type Member<M, T, V> = Selected<Selected<Viewed<M>, V>, T>;

type Keys<S extends Scope.Scope> =
  | keyof S["modules"]
  | keyof S["types"]
  | keyof S["values"];

type RequiredKeys<S> = {
  [K in keyof S]-?: undefined extends S[K] ? never : K;
}[keyof S];

type RequiredNames<S extends Scope.Scope> =
  | RequiredKeys<S["modules"]>
  | RequiredKeys<S["types"]>
  | RequiredKeys<S["values"]>;

/**
 * The single-object view of a scope, in which each name joins its module, type and value exports.
 *
 * A guaranteed export in any namespace makes the flattened name required. A name that only optional entries supply is optional. A module also exposes its child exports directly, beside its own `modules`, `types` and `values` tables.
 */
export type Flatten<S extends Scope.Scope> = {
  readonly [K in Keys<S> as K extends RequiredNames<S> ? K : never]: Member<
    Lookup<S["modules"], K>,
    Lookup<S["types"], K>,
    Lookup<S["values"], K>
  >;
} & {
  readonly [K in Keys<S> as K extends RequiredNames<S> ? never : K]?: Exclude<
    Member<
      Lookup<S["modules"], K>,
      Lookup<S["types"], K>,
      Lookup<S["values"], K>
    >,
    undefined
  >;
};

interface ModuleScope<S extends Scope.Scope> {
  readonly modules: S["modules"];
  readonly types: Empty;
  readonly values: Empty;
}
/** The flattened view of a scope's modules alone, each exposing its child exports directly. */
export type Modules<S extends Scope.Scope> = Flatten<ModuleScope<S>>;

const combinedHandles = new WeakMap<
  Capability,
  readonly [] | readonly [Capability, Capability]
>();

/** Finds the original producer rather than mistaking a combined marker for a second producer. */
const find = <E extends Capability>(
  candidate: Capability,
  predicate: (candidate: Capability) => candidate is E,
): E | undefined => {
  const components = combinedHandles.get(candidate);
  if (components?.length === 2) {
    return find(components[1], predicate) ?? find(components[0], predicate);
  }

  if (predicate(candidate)) {
    return candidate;
  }

  return undefined;
};

// Function intrinsics are not declared namespace exports. Joined proxies check their sources.
const hasExport = (candidate: Capability, key: PropertyKey): boolean => {
  if (combinedHandles.has(candidate)) {
    return key in candidate;
  }

  if (typeof candidate === "function") {
    return Object.prototype.propertyIsEnumerable.call(candidate, key);
  }

  return Object.hasOwn(candidate, key);
};

const expressionReserved = new Set<PropertyKey>([
  "$project",
  "$index",
  "~hashql/Expression",
]);

/**
 * Selects a callable capability from the runtime argument category.
 *
 * Proxy calls arrive without their generic argument tuple. The public intersection retains each source signature. This boundary invokes only the matching SDK callable. Its result is another SDK capability.
 */
const invoke = (
  candidate: Capability | undefined,
  // oxlint-disable-next-line typescript/no-restricted-types -- a proxy call receives unchecked host arguments
  args: readonly unknown[],
): Capability | undefined => {
  if (typeof candidate !== "function") {
    return undefined;
  }

  const typeCall =
    TypeExpression.isConstructor(candidate) &&
    args.every(Structural.isDefinition);

  const valueCall =
    Expression.isExpression(candidate) && args.every(Structural.isValue);

  if (!typeCall && !valueCall) {
    return undefined;
  }

  // SAFETY: each matching SDK callable returns a type or value handle.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- invocation erases the argument tuple at the proxy boundary
  return Reflect.apply(candidate, undefined, args) as Capability;
};

/** Joins concrete capability producers and rebinds both with their original result types. */
export const combine: {
  <R extends Capability & Relocatable<R>>(
    right: R,
  ): <L extends Capability & Relocatable<L>>(left: L) => Joined<L, R>;
  <
    L extends Capability & Relocatable<L>,
    R extends Capability & Relocatable<R>,
  >(
    left: L,
    right: R,
  ): Joined<L, R>;
} = Function.dual(
  2,
  <
    L extends Capability & Relocatable<L>,
    R extends Capability & Relocatable<R>,
  >(
    left: L,
    right: R,
  ): Joined<L, R> => {
    const leftSource: Relocatable<L> = left;
    const rightSource: Relocatable<R> = right;

    const rebind = (
      path: JExpr.Path.Path,
    ): Result.Result<Joined<L, R>, ProgramError.Construction> =>
      pipe(
        Result.all({
          left: leftSource[Relocate](path),
          right: rightSource[Relocate](path),
        }),
        Result.map((moved) => combine<L, R>(moved.left, moved.right)),
      );

    const type =
      find(right, TypeExpression.isExport) ??
      find(left, TypeExpression.isExport);

    const value =
      find(right, Expression.isExpression) ??
      find(left, Expression.isExpression);

    const module = find(right, Module.isModule) ?? find(left, Module.isModule);

    // oxlint-disable-next-line typescript/no-restricted-types -- proxy invocation selects a callable from the host arguments
    const callable = (...args: readonly unknown[]): Capability | undefined => {
      const first = invoke(type, args);
      const second = invoke(value, args);

      if (first === undefined) {
        return second;
      }

      if (second === undefined) {
        return first;
      }

      return combine<Capability, Capability>(first, second);
    };

    const components: readonly [L, R] = [left, right];

    let target: Relocatable<Joined<L, R>> = { [Relocate]: rebind };
    if (typeof left === "function" || typeof right === "function") {
      target = Object.assign(callable, target);
    }

    const proxy = new Proxy(target, {
      has: (_target, key): boolean =>
        key === Relocate ||
        key === Components ||
        hasExport(left, key) ||
        hasExport(right, key),
      // oxlint-disable-next-line typescript/no-restricted-types -- a property trap returns heterogeneous host properties
      get: (_target, key): unknown => {
        if (key === Components) {
          return components;
        }

        if (key === Relocate) {
          return rebind;
        }

        if (expressionReserved.has(key) && value !== undefined) {
          return Reflect.get(value, key);
        }

        if (type !== undefined && hasExport(type, key)) {
          return Reflect.get(type, key);
        }

        if (module !== undefined && hasExport(module, key)) {
          return Reflect.get(module, key);
        }

        if (value !== undefined) {
          return Reflect.get(value, key);
        }

        return Reflect.get(_target, key);
      },
    });

    combinedHandles.set(proxy, components);

    // SAFETY: property forwarding implements Combined<L, R>; rebind already returns Joined<L, R>.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Proxy cannot express forwarded properties or overloaded calls
    return proxy as Joined<L, R>;
  },
);

function select<
  L extends Capability | undefined,
  R extends Capability | undefined,
>(left: L, right: R): Selected<L, R>;
function select<
  L extends Capability & Relocatable<L>,
  R extends Capability & Relocatable<R>,
>(left: L | undefined, right: R | undefined): L | R | Joined<L, R> | undefined {
  if (left === undefined) {
    return right;
  }

  if (right === undefined) {
    return left;
  }

  return combine<L, R>(left, right);
}

/** A module view rebuilds its flattened children from the rebound module. */
function viewModule<M extends Module.Any>(module: M): ModuleView<M>;
function viewModule<M extends Module.Any & Relocatable<M>>(
  module: M,
): ModuleView<M> {
  // oxlint-disable-next-line eslint/no-use-before-define -- module views and child flattening are mutually recursive
  const children = flattenScope(module);
  const source: Relocatable<M> = module;

  const rebind = (
    path: JExpr.Path.Path,
  ): Result.Result<ModuleView<M>, ProgramError.Construction> =>
    pipe(
      source[Relocate](path),
      Result.map((moved) => viewModule<M>(moved)),
    );

  const target = { [Relocate]: rebind };
  const proxy = new Proxy(target, {
    has: (_target, key): boolean =>
      key === Relocate ||
      hasExport(module, key) ||
      Object.hasOwn(children, key),
    // oxlint-disable-next-line typescript/no-restricted-types -- a property trap returns heterogeneous host properties
    get: (_target, key): unknown => {
      if (key === Relocate) {
        return rebind;
      }
      if (hasExport(module, key)) {
        return Reflect.get(module, key);
      }
      return Reflect.get(children, key);
    },
  });

  combinedHandles.set(proxy, []);

  // SAFETY: module properties take precedence over children, exactly as ModuleView specifies.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Proxy does not model forwarded properties
  return proxy as ModuleView<M>;
}

function viewOptional<M extends Module.Any | undefined>(module: M): Viewed<M>;
function viewOptional<M extends Module.Any>(
  module: M | undefined,
): ModuleView<M> | undefined {
  if (module === undefined) {
    return undefined;
  }
  return viewModule<M>(module);
}

/** Resolves one key while retaining all three source export types. */
const member = <
  M extends Module.Any | undefined,
  T extends TypeExpression.Export | undefined,
  V extends Expression.Any | undefined,
>(
  module: M,
  type: T,
  value: V,
): Member<M, T, V> => select(select(viewOptional(module), value), type);

/** Reads own names to exclude inherited object properties from namespace declarations. */
function lookup<S extends Scope.Scope[keyof Scope.Scope], K extends string>(
  table: S,
  name: K,
): Lookup<S, K>;
function lookup<E extends Capability, K extends string>(
  table: Readonly<Record<string, E>>,
  name: K,
): E | undefined {
  if (Object.hasOwn(table, name)) {
    return table[name];
  }

  return undefined;
}

/** Per-key results before mapping absent alternatives to optional properties. */
type Members<S extends Scope.Scope> = {
  readonly [K in Keys<S>]: Member<
    Lookup<S["modules"], K>,
    Lookup<S["types"], K>,
    Lookup<S["values"], K>
  >;
};

/** Property definition preserves __proto__ without losing the key-to-value relationship. */
const define = <O, K extends keyof O>(
  table: Partial<O>,
  name: K,
  value: O[K],
): void => {
  Object.defineProperty(table, name, { value, enumerable: true });
};

/** Copies each namespace key once without introducing names from missing tables. */
const flattenScope = <S extends Scope.Scope>(scope: S): Flatten<S> => {
  const entries: Partial<Members<S>> = {};

  // oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- K ties three lookups to the same destination member
  const resolve = <K extends Keys<S> & string>(name: K): void => {
    const value = member(
      lookup<S["modules"], K>(scope.modules, name),
      lookup<S["types"], K>(scope.types, name),
      lookup<S["values"], K>(scope.values, name),
    );

    if (value !== undefined) {
      define<Members<S>, K>(entries, name, value);
    }
  };

  const names = new Set([
    ...Object.getOwnPropertyNames(scope.modules),
    ...Object.getOwnPropertyNames(scope.types),
    ...Object.getOwnPropertyNames(scope.values),
  ]);

  for (const name of names) {
    resolve(name);
  }

  // SAFETY: the loop checks each own key at Members<S>[K]. Absent alternatives become optional properties.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- completes the per-key mapped table after enumerating its names
  return Object.freeze(entries) as Flatten<S>;
};

/** Joins a checked scope. Module.define performs the same producer check for nested tables. */
export const flatten = <S extends Scope.Scope>(
  scope: S & Rebindable<S>,
): Flatten<S> => flattenScope<S>(scope);

/** Keeps only module names, with their child exports available directly. */
export const modules = <S extends Scope.Scope>(
  scope: S & Pick<Rebindable<S>, "modules">,
): Modules<S> =>
  flattenScope<ModuleScope<S>>({
    modules: scope.modules,
    types: {},
    values: {},
  });
