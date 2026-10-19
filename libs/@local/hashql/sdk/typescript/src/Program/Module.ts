/**
 * Typed declarations bound to absolute HashQL paths.
 *
 * A module record describes exports that the HashQL environment provides under one path. Defining it emits no syntax and creates nothing in HashQL. Its declarations emit references beneath that path for the HashQL compiler to resolve, and importing a module emits a `use` of its path.
 *
 * Modules keep type and value exports separate because a type and its constructor can share a name. Existing exports are aliases: selecting or regrouping one never changes its reference. Declarations supply trusted type information. The HashQL compiler checks the emitted query.
 *
 * Expected construction failures, such as an invalid path or export name, arrive in a `Result`.
 *
 * @module
 */
import { Predicate, Result, flow, pipe } from "effect";

import {
  Relocate,
  relocate as relocateHandle,
} from "../internal/relocation.js";
import * as JExpr from "../JExpr/index.js";
import * as Expression from "./Expression.js";
import * as ProgramError from "./ProgramError.js";
import * as TypeExpression from "./TypeExpression.js";

import type { Relocatable } from "../internal/relocation.js";
import type * as Type from "../Type/index.js";
import type * as Inputs from "./Inputs.js";
import type { ReadonlyRecord } from "effect/Record";

const Declare: unique symbol = Symbol("~hashql/ModuleDeclaration");
const TypeId: unique symbol = Symbol("~hashql/Module");

/**
 * A declaration waiting for the module to supply its absolute export path.
 *
 * {@link value}, {@link type} and {@link genericType} create declarations. {@link define} binds each one to the export `E` it describes.
 */
export interface Declaration<E> {
  readonly [Declare]: (
    path: JExpr.Path.Path,
  ) => Result.Result<E, ProgramError.Construction>;
}

/** An inspectable export table without fixing its concrete key set. */
interface Namespace<E> extends ReadonlyRecord<string, E> {}

/** Reverse mapping lets each declaration retain the type of the export it creates. */
type Declarations<E> = {
  readonly [K in keyof E]: Declaration<E[K]> | E[K];
};

/**
 * A module with its concrete export names erased.
 *
 * The type and value tables are separate namespaces, so one name can hold both a type and its value constructor.
 */
export interface Any extends Relocatable<Any> {
  readonly [TypeId]: true;
  /** The path under which the module binds its exports. */
  readonly path: JExpr.Path.Path;
  /** Child modules by local name. */
  readonly modules: Namespace<Any>;
  /** Type expressions and generic type constructors by export name. */
  readonly types: Namespace<TypeExpression.Export>;
  /** Value expressions by export name. */
  readonly values: Namespace<Expression.Any>;
}

/**
 * Named declarations and existing exports to assemble into a module.
 *
 * Each table is optional. The type and value tables accept declarations or existing exports, and the module table accepts modules that are already bound.
 */
export interface Definition {
  readonly modules?: Namespace<Any>;
  readonly types?: Namespace<
    Declaration<TypeExpression.Export> | TypeExpression.Export
  >;
  readonly values?: Namespace<Declaration<Expression.Any> | Expression.Any>;
}

/** A table with no names. */
// oxlint-disable-next-line typescript/no-generated-empty-object-type -- an absent namespace intentionally has no known members
type Empty = Record<never, never>;

/** Models possible namespace omission as optional members of an always-present table. */
type Entries<S, K extends PropertyKey> = K extends keyof S
  ? undefined extends S[K]
    ? Partial<NonNullable<S[K]>>
    : S[K]
  : Empty;

/** Distributes over alternatives so an optional declaration also unwraps when present. */
type Export<D> = D extends Declaration<infer E> ? E : D;

/** Replaces each declaration in a table with the export it binds to. */
type Exports<D> = {
  readonly [K in keyof D]: Export<D[K]>;
};

/** Bound tables retain their key-to-export relationships independently of the source declarations. */
interface Bound<M, T, V> extends Relocatable<Bound<M, T, V>> {
  readonly [TypeId]: true;
  /** The path under which the module binds its exports. */
  readonly path: JExpr.Path.Path;
  /** Child modules by local name. */
  readonly modules: Readonly<M>;
  /** Type expressions and generic type constructors by export name. */
  readonly types: Readonly<T>;
  /** Value expressions by export name. */
  readonly values: Readonly<V>;
}

/** Each entry must retain its own rebinding result, not merely a common export type. */
type Rebindings<E> = { readonly [K in keyof E]: Relocatable<E[K]> };

/** A declared or existing export must preserve its promised capabilities when imported. */
type Rebindable<E> =
  E extends Declaration<infer T>
    ? Declaration<T & Relocatable<T>>
    : E extends undefined
      ? undefined
      : E & Relocatable<E>;

/** Applies the rebinding requirement to every entry of a table. */
type RebindableEntries<E> = { readonly [K in keyof E]: Rebindable<E[K]> };

/** Requires every table of a module definition to hold rebindable entries. */
type RebindableDefinition<S> = {
  readonly [K in keyof S]: K extends keyof Definition
    ? RebindableEntries<S[K]>
    : S[K];
};

/**
 * An immutable module record preserving each export's concrete type.
 *
 * An omitted table becomes an empty table, and the names of an optional table become optional exports.
 */
export interface Module<S extends Definition> extends Bound<
  Entries<S, "modules">,
  Exports<Entries<S, "types">>,
  Exports<Entries<S, "values">>
> {}

/**
 * Recognizes a module assembled by this SDK.
 *
 * The guard checks for the module marker property. A joined namespace name that includes a module also passes, while the record {@link root} returns does not.
 */
// oxlint-disable-next-line typescript/no-restricted-types -- this guard narrows unchecked environment entries
export const isModule = (value: unknown): value is Any =>
  Predicate.hasProperty(value, TypeId);

/**
 * Declares a value with trusted semantic type information.
 *
 * The bound export emits its absolute path, such as `::core::math::rem`, and requires no inputs. `T` decides which calls, projections and indexing TypeScript accepts, and a function descriptor makes the export callable. Nothing checks that the HashQL value has this type.
 */
export const value = <T extends Type.Any>(): Declaration<
  Expression.Expression<T, Inputs.Empty>
> => ({
  [Declare]: flow(
    JExpr.Path.compile,
    Expression.fromJExpr<T, Inputs.Empty>,
    Result.succeed,
  ),
});

/**
 * Declares a named type without expanding it into its structural representation.
 *
 * Once bound, the export emits a reference to its absolute path, such as `::core::uuid::Uuid`. TypeScript takes its descriptor `T` on trust.
 */
export const type = <T extends Type.Any>(): Declaration<
  TypeExpression.TypeExpression<T>
> => ({
  [Declare]: flow(TypeExpression.reference<T>, Result.succeed),
});

/**
 * Declares a named generic type with a type-level operation for its result.
 *
 * TypeScript requires `arity` to equal `F["arity"]`. Binding returns an `InvalidTypeArity` failure for an arity that is not a non-negative safe integer. The bound constructor emits applications of the export's path and checks the argument count of each call.
 */
export const genericType = <F extends Type.TypeConstructor>(
  arity: F["arity"],
): Declaration<TypeExpression.Constructor<F>> => ({
  [Declare]: (path) => TypeExpression.constructor<F>(path, arity),
});

const memberName = (
  name: string,
): Result.Result<JExpr.Ident.Ident, ProgramError.Construction> =>
  pipe(
    JExpr.Ident.decodeResult(name),
    Result.mapError(
      (cause) =>
        new ProgramError.Construction({
          reason: ProgramError.Reason.InvalidExportName({ name, cause }),
        }),
    ),
  );

/** Symbol keys cannot appear in HashQL paths and must not disappear during binding. */
const requireStringKeys = (
  symbols: readonly symbol[],
): Result.Result<void, ProgramError.Construction> => {
  const [name] = symbols;

  if (name !== undefined) {
    return Result.fail(ProgramError.Construction.symbolExportName(name));
  }

  return Result.void;
};

/**
 * Maps each own name at its corresponding export type.
 *
 * The callback is generic in K: it must produce E[K] from S[K] for the same key. This preserves the relationship that a callback over an entry union would lose. The source may contain declarations, while the destination contains bound exports.
 */
const mapEntries = <
  E extends Namespace<Any | TypeExpression.Export | Expression.Any>,
  S extends Declarations<E>,
>(
  entries: S,
  resolve: <K extends keyof E & string>(
    name: K,
    entry: S[K],
    ident: JExpr.Ident.Ident,
  ) => Result.Result<E[K], ProgramError.Construction>,
): Result.Result<Readonly<E>, ProgramError.Construction> =>
  Result.gen(function* () {
    yield* pipe(entries, Object.getOwnPropertySymbols, requireStringKeys);
    const exports: Partial<E> = {};
    const member = <K extends keyof E & string>(
      name: K,
    ): Result.Result<E[K], ProgramError.Construction> =>
      pipe(
        memberName(name),
        Result.flatMap((ident) => resolve(name, entries[name], ident)),
      );

    for (const name of Object.getOwnPropertyNames(entries)) {
      const bound = yield* member(name);
      // Defining the property also preserves the ordinary export name __proto__.
      Object.defineProperty(exports, name, { value: bound, enumerable: true });
    }

    // SAFETY: the loop fills each own string key at its original E[K] type. TypeScript cannot prove that coverage.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- completes a per-key checked Partial<E>, without changing any export type
    return Object.freeze(exports as E);
  });

const copyModules = <M extends Namespace<Any>>(
  modules: M,
): Result.Result<Readonly<M>, ProgramError.Construction> =>
  mapEntries<M, M>(modules, (_name, entry) => Result.succeed(entry));

const isDeclaration = <E>(entry: Declaration<E> | E): entry is Declaration<E> =>
  Predicate.hasProperty(entry, Declare);

/** Resolves each declaration without widening its semantic descriptor. */
const bind = <E extends Namespace<TypeExpression.Export | Expression.Any>>(
  parent: JExpr.Path.Path,
  entries: Declarations<E> | undefined,
): Result.Result<Readonly<E> | Empty, ProgramError.Construction> => {
  if (entries === undefined) {
    return Result.succeed(Object.freeze({}));
  }

  const resolve = <K extends keyof E & string>(
    _name: K,
    entry: Declaration<E[K]> | E[K],
    ident: JExpr.Ident.Ident,
  ): Result.Result<E[K], ProgramError.Construction> => {
    if (isDeclaration<E[K]>(entry)) {
      return entry[Declare]({
        rooted: parent.rooted,
        segments: [...parent.segments, ident],
      });
    }

    return Result.succeed(entry);
  };

  return mapEntries<E, Declarations<E>>(entries, resolve);
};

/** Rebinds each member using the result type retained by that member's producer. */
const rebase = <
  E extends Namespace<Any | TypeExpression.Export | Expression.Any> &
    Rebindings<E>,
>(
  path: JExpr.Path.Path,
  entries: E,
): Result.Result<Readonly<E>, ProgramError.Construction> => {
  const sources: Rebindings<E> = entries;
  const resolve = <K extends keyof E & string>(
    name: K,
    _entry: E[K],
    ident: JExpr.Ident.Ident,
  ): Result.Result<E[K], ProgramError.Construction> =>
    relocateHandle<E[K]>(sources[name], {
      rooted: path.rooted,
      segments: [...path.segments, ident],
    });

  return mapEntries<E, E>(entries, resolve);
};

/** Captures typed export tables so rebinding preserves each member's result type. */
const bound = <
  M extends Namespace<Any> & Rebindings<M>,
  T extends Namespace<TypeExpression.Export> & Rebindings<T>,
  V extends Namespace<Expression.Any> & Rebindings<V>,
>(
  path: JExpr.Path.Path,
  entries: { readonly modules: M; readonly types: T; readonly values: V },
): Bound<M, T, V> =>
  Object.freeze({
    [TypeId]: true as const,
    path,
    ...entries,
    [Relocate]: (
      next: JExpr.Path.Path,
    ): Result.Result<Bound<M, T, V>, ProgramError.Construction> =>
      pipe(
        {
          modules: rebase<M>(next, entries.modules),
          types: rebase<T>(next, entries.types),
          values: rebase<V>(next, entries.values),
        },
        Result.all,
        Result.map((exports) => bound<M, T, V>(next, exports)),
      ),
  });

/**
 * Binds new declarations and retains existing exports by identity.
 *
 * `name` must be an absolute path such as `::core::math`. Each declaration binds to that path extended by its key, so a value declared as `rem` emits `::core::math::rem`. An existing type expression, expression or module keeps its identity and the syntax it already emits. Child modules retain their own paths, including when mounted under an alias. Copying and freezing the records prevents caller mutations from adding or replacing exports afterward. The caller's tables are not frozen.
 *
 * Every own string key becomes an export, including non-enumerable keys and `__proto__`. A key must be a HashQL identifier. Emitted paths quote an operator name such as `%`, as in `` ::core::math::`%` ``.
 *
 * Invalid paths, export names and generic arities return construction failures. A malformed path returns `InvalidModulePath`, a relative path `RelativeModulePath`, a key that is not an identifier `InvalidExportName`, a symbol key `SymbolExportName` and an invalid generic arity `InvalidTypeArity`. Binding stops at the first failure, checking the module, type and value tables in that order.
 *
 * TypeScript keeps the namespaces apart: a value declaration cannot enter `types`, and a type declaration cannot enter `values`. Each existing export must rebind to its own type. TypeScript rejects a handle extended through `Object.assign`, because rebinding would drop the added properties.
 *
 * @example <caption>Declare a type and its value constructor under one name.</caption>
 * ```ts
 * import assert from "node:assert/strict";
 * import { Expression, JExpr, Module } from "@local/hashql";
 * import type { Type } from "@local/hashql";
 * import { Result } from "effect";
 *
 * type Uuid = Type.Opaque<"::core::uuid::Uuid", Type.PrimitiveString>;
 *
 * const uuid = Result.getOrThrow(
 *   Module.define("::core::uuid", {
 *     types: { Uuid: Module.type<Uuid>() },
 *     values: {
 *       Uuid: Module.value<
 *         Type.Function<readonly [Type.PrimitiveString], Uuid>
 *       >(),
 *     },
 *   }),
 * );
 * const id = Expression.input("id", uuid.types.Uuid, uuid.values.Uuid("fallback"));
 * assert.equal(
 *   JExpr.compile(Result.getOrThrow(Expression.toJExpr(id))),
 *   '["::kernel::special_form::input","id","::core::uuid::Uuid",["::core::uuid::Uuid",{"#literal":"fallback"}]]',
 * );
 *
 * const relative = Module.define("core::uuid", {});
 * assert.ok(Result.isFailure(relative));
 * assert.equal(relative.failure.reason._tag, "RelativeModulePath");
 * ```
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- the path names the module under construction
export function define<const S extends Definition>(
  name: string,
  definition: S & RebindableDefinition<S>,
): Result.Result<Module<S>, ProgramError.Construction>;
export function define<
  M extends Namespace<Any> & Rebindings<M>,
  T extends Namespace<TypeExpression.Export> & Rebindings<T>,
  V extends Namespace<Expression.Any> & Rebindings<V>,
>(
  name: string,
  definition: {
    readonly modules?: M;
    readonly types?: Declarations<T>;
    readonly values?: Declarations<V>;
  },
): Result.Result<
  Bound<M | Empty, T | Empty, V | Empty>,
  ProgramError.Construction
> {
  return Result.gen(function* () {
    const path = yield* pipe(
      JExpr.Path.decodeResult(name),
      Result.mapError(
        (cause) =>
          new ProgramError.Construction({
            reason: ProgramError.Reason.InvalidModulePath({ name, cause }),
          }),
      ),
    );

    if (!path.rooted) {
      return yield* Result.fail(
        new ProgramError.Construction({
          reason: ProgramError.Reason.RelativeModulePath({ name }),
        }),
      );
    }

    let modules: Readonly<M> | Empty = Object.freeze({});
    if (definition.modules !== undefined) {
      modules = yield* copyModules(definition.modules);
    }

    return bound<M | Empty, T | Empty, V | Empty>(path, {
      modules,
      types: yield* bind<T>(path, definition.types),
      values: yield* bind<V>(path, definition.values),
    });
  });
}

/**
 * Rebinds a module tree while preserving each export's declared type.
 *
 * Every export becomes a reference to its name under `path`, including aliases of exports from other modules. Child modules are rebound recursively beneath it. The path can be relative, as it is when an import binds a module under a local name. Each export keeps its descriptor and input requirements even though its syntax becomes a reference. The original module keeps its paths. The first export that cannot be rebound, such as a value whose construction failed, returns its failure. It accepts the module first or last.
 *
 * @example <caption>Rebind an alias and a child module.</caption>
 * ```ts
 * import assert from "node:assert/strict";
 * import { Expression, JExpr, Module } from "@local/hashql";
 * import type { Type } from "@local/hashql";
 * import { Result } from "effect";
 *
 * const compile = (value: Expression.Any): string =>
 *   JExpr.compile(Result.getOrThrow(Expression.toJExpr(value)));
 * const config = Result.getOrThrow(
 *   Module.define("::core::config", {
 *     values: { limit: Module.value<Type.PrimitiveInteger>() },
 *   }),
 * );
 * const app = Result.getOrThrow(
 *   Module.define("::app", {
 *     modules: { settings: config },
 *     values: { maximum: config.values.limit },
 *   }),
 * );
 * assert.equal(compile(app.values.maximum), '"::core::config::limit"');
 *
 * const local = Result.getOrThrow(
 *   Module.relocate(app, Result.getOrThrow(JExpr.Path.decodeResult("local"))),
 * );
 * assert.equal(compile(local.values.maximum), '"local::maximum"');
 * assert.equal(
 *   compile(local.modules.settings.values.limit),
 *   '"local::settings::limit"',
 * );
 * ```
 */
export const relocate: {
  (
    path: JExpr.Path.Path,
  ): <M extends Any>(
    self: Any & Relocatable<M>,
  ) => Result.Result<M, ProgramError.Construction>;
  <M extends Any>(
    self: Any & Relocatable<M>,
    path: JExpr.Path.Path,
  ): Result.Result<M, ProgramError.Construction>;
} = relocateHandle;

/**
 * Assembles already-bound modules without rebasing their references.
 *
 * The result is a frozen `{ modules }` record keyed by the supplied names. It is not a module: it has no path, and {@link isModule} rejects it. Each child keeps its identity and its own path. The record fits any parameter that takes a scope definition, such as a Draft prelude. Names follow the rules and failures of the module table of {@link define}.
 */
export const root = <const M extends Namespace<Any>>(
  modules: M,
): Result.Result<
  { readonly modules: Readonly<M> },
  ProgramError.Construction
> =>
  pipe(
    modules,
    copyModules,
    Result.map((bound) => Object.freeze({ modules: bound })),
  );
