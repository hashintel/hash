/**
 * Typed declarations bound to absolute HashQL paths.
 *
 * A module record describes exports that the HashQL environment provides under one path. Defining it emits no syntax and creates nothing in HashQL. Its declarations emit references beneath that path for the HashQL compiler to resolve.
 *
 * Modules keep type and value exports separate because a type and its constructor can share a name. Each export table has no prototype, so a name the module does not export reads as `undefined`, even a name such as `toString`. An existing export is an alias, a claim that HashQL also exports the item under this module's path. It keeps the reference it already emits until {@link relocate} moves the module. Declarations supply trusted type information. The HashQL compiler checks the emitted query.
 *
 * Expected construction failures, such as an invalid path or export name, arrive in a `Result`.
 *
 * @module
 */
import { Equal, Hash, Pipeable, Predicate, Record, Result, pipe } from "effect";

import { emptyTable } from "../internal/record.js";
import {
  Relocate,
  relocate as relocateHandle,
} from "../internal/relocation.js";
import * as JExpr from "../JExpr/index.js";
import * as Deferred from "./Declaration.js";
import * as ProgramError from "./ProgramError.js";

import type { StringKeyed } from "../internal/record.js";
import type * as Relocation from "../internal/relocation.js";
import type { Declaration } from "./Declaration.js";
import type * as Expression from "./Expression.js";
import type * as TypeExpression from "./TypeExpression.js";

export { genericType, type, value } from "./Declaration.js";
export type { Declaration } from "./Declaration.js";

export type TypeId = "~hashql/Module";
const TypeId: TypeId = "~hashql/Module";

/** An inspectable export table without fixing its concrete key set. */
interface Namespace<E> extends Record.ReadonlyRecord<string, E> {}

/** Reverse mapping lets each declaration retain the type of the export it creates. */
type Declarations<E> = {
  readonly [K in keyof E]: Declaration<E[K]> | E[K];
};

/**
 * Named declarations and existing exports to assemble into a module.
 *
 * Each table is optional. The type and value tables accept declarations or existing exports, and the module table accepts modules that are already bound.
 */
export interface Definition {
  readonly modules?: Namespace<Module.Any>;
  readonly types?: Namespace<
    Declaration<TypeExpression.Export> | TypeExpression.Export
  >;
  readonly values?: Namespace<
    Declaration<Expression.Expression.Any> | Expression.Expression.Any
  >;
}

export declare namespace Definition {
  /** Broad input tables with no concrete export names retained. */
  export interface Any extends Definition {}
}

// oxlint-disable-next-line typescript/no-generated-empty-object-type -- an absent namespace intentionally has no known members
type Empty = Record<never, never>;

/** Models omission as optional named exports. A broad string index already permits missing names. */
type Entries<S, K extends PropertyKey> = K extends keyof S
  ? undefined extends S[K]
    ? string extends keyof NonNullable<S[K]>
      ? NonNullable<S[K]>
      : Partial<NonNullable<S[K]>>
    : S[K]
  : Empty;

/** Distributes over alternatives so an optional declaration also unwraps when present. */
type Export<D> = D extends Declaration<infer E> ? E : D;

type Exports<D> = {
  readonly [K in keyof D]: Export<D[K]>;
};

/** Each entry must retain its own rebinding result, not merely a common export type. */
type Rebindings<E> = { readonly [K in keyof E]: Relocation.Relocatable<E[K]> };

/** A declared or existing export must preserve its promised capabilities when imported. */
type Rebindable<E> =
  E extends Declaration<infer T>
    ? Declaration<T & Relocation.Relocatable<T>>
    : E extends undefined
      ? undefined
      : E & Relocation.Relocatable<E>;

type RebindableEntries<E> = StringKeyed<{
  readonly [K in keyof E]: Rebindable<E[K]>;
}>;

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
 *
 * Equality and hashing compare the path and all three export tables. Members use their existing Effect equality, not their printed syntax, so two binding calls need not produce equal exports. Construction freezes the records and tables but shares alias members and paths. Treat those values as immutable after comparison or hashing, because Effect caches its results.
 */
export interface Module<S extends Definition>
  extends Equal.Equal, Pipeable.Pipeable, Relocation.Relocatable<Module<S>> {
  readonly [TypeId]: TypeId;

  readonly path: JExpr.Path.Path;
  readonly modules: Readonly<Entries<S, "modules">>;
  readonly types: Exports<Entries<S, "types">>;
  readonly values: Exports<Entries<S, "values">>;
}

export declare namespace Module {
  /**
   * A module with its concrete export names erased.
   *
   * The type and value tables are separate namespaces, so one name can hold both a type and its value constructor.
   */
  export interface Any extends Module<Definition.Any> {}

  /** The string export names of a module across its three tables. */
  export type Items<M extends Any> = Extract<
    keyof M["modules"] | keyof M["values"] | keyof M["types"],
    string
  >;
}

/**
 * Recognizes a module assembled by this SDK.
 *
 * The guard checks for the module marker property. The record {@link root} returns does not pass.
 */
// oxlint-disable-next-line typescript/no-restricted-types -- this guard narrows unchecked environment entries
export const isModule = (value: unknown): value is Module.Any =>
  Predicate.hasProperty(value, TypeId);

const memberName = (
  name: string,
): Result.Result<JExpr.Ident.Ident, ProgramError.Construction> =>
  pipe(
    name,
    JExpr.Ident.decodeResult,
    Result.mapError((cause) =>
      ProgramError.Construction.invalidExportName(name, cause),
    ),
  );

/** Maps each enumerable own name from S[K] to E[K], retaining its export type instead of an entry union. */
const mapEntries = <
  E extends Namespace<
    Module.Any | TypeExpression.Export | Expression.Expression.Any
  >,
  S extends Declarations<E>,
>(
  entries: S,
  resolve: <K extends keyof E & string>(
    name: K,
    entry: S[K],
    ident: JExpr.Ident.Ident,
  ) => Result.Result<E[K], ProgramError.Construction>,
): Result.Result<Readonly<E>, ProgramError.Construction> => {
  const member = <K extends keyof E & string>(
    name: K,
  ): Result.Result<E[K], ProgramError.Construction> =>
    pipe(
      name,
      memberName,
      Result.flatMap((ident) => resolve(name, entries[name], ident)),
    );

  return Result.gen(function* () {
    const exports = emptyTable<E>();

    for (const name of Record.keys(entries)) {
      const bound = yield* member(name);

      // Defining the property also preserves the ordinary export name __proto__.
      Object.defineProperty(exports, name, { value: bound, enumerable: true });
    }

    // SAFETY: the loop fills each enumerable own string key at its original E[K] type. TypeScript cannot prove that coverage.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- completes a per-key checked Partial<E>, without changing any export type
    return Object.freeze(exports as E);
  });
};

const copyModules = <M extends Namespace<Module.Any>>(
  modules: M,
): Result.Result<Readonly<M>, ProgramError.Construction> =>
  mapEntries<M, M>(modules, (_name, entry) => Result.succeed(entry));

/** Resolves each declaration without widening its semantic descriptor. */
const bind = <
  E extends Namespace<TypeExpression.Export | Expression.Expression.Any>,
>(
  parent: JExpr.Path.Path,
  entries: Declarations<E> | undefined,
): Result.Result<Readonly<E> | Empty, ProgramError.Construction> => {
  if (entries === undefined) {
    return Result.succeed(Object.freeze(emptyTable<Empty>()));
  }

  const resolve = <K extends keyof E & string>(
    _name: K,
    entry: Declaration<E[K]> | E[K],
    ident: JExpr.Ident.Ident,
  ): Result.Result<E[K], ProgramError.Construction> => {
    if (Deferred.isDeclaration<E[K]>(entry)) {
      return entry[Deferred.Declare](
        JExpr.Path.make({
          rooted: parent.rooted,
          segments: [...parent.segments, { name: ident, arguments: [] }],
        }),
      );
    }

    return Result.succeed(entry);
  };

  return mapEntries<E, Declarations<E>>(entries, resolve);
};

/** Rebinds each member using the result type retained by that member's producer. */
const rebase = <
  E extends Namespace<
    Module.Any | TypeExpression.Export | Expression.Expression.Any
  > &
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
    relocateHandle<E[K]>(
      sources[name],
      JExpr.Path.make({
        rooted: path.rooted,
        segments: [...path.segments, { name: ident, arguments: [] }],
      }),
    );

  return mapEntries<E, E>(entries, resolve);
};

/** Owns typed export tables and rebinds each member without erasing its result type. */
class ModuleImpl<
  M extends Namespace<Module.Any> & Rebindings<M>,
  T extends Namespace<TypeExpression.Export> & Rebindings<T>,
  V extends Namespace<Expression.Expression.Any> & Rebindings<V>,
>
  extends Pipeable.Class
{
  readonly [TypeId]: TypeId = TypeId;

  readonly path: JExpr.Path.Path;
  readonly modules: Readonly<M>;
  readonly types: Readonly<T>;
  readonly values: Readonly<V>;

  constructor(
    path: JExpr.Path.Path,
    {
      modules,
      types,
      values,
    }: { readonly modules: M; readonly types: T; readonly values: V },
  ) {
    super();

    this.path = path;
    this.modules = modules;
    this.types = types;
    this.values = values;
    Object.freeze(this);
  }

  [Relocate](
    next: JExpr.Path.Path,
  ): Result.Result<ModuleImpl<M, T, V>, ProgramError.Construction> {
    return pipe(
      {
        modules: rebase<M>(next, this.modules),
        types: rebase<T>(next, this.types),
        values: rebase<V>(next, this.values),
      },
      Result.all,
      Result.map((exports) => new ModuleImpl<M, T, V>(next, exports)),
    );
  }

  [Equal.symbol](that: Equal.Equal): boolean {
    return (
      isModule(that) &&
      Equal.equals(this.path, that.path) &&
      Equal.equals(this.modules, that.modules) &&
      Equal.equals(this.types, that.types) &&
      Equal.equals(this.values, that.values)
    );
  }

  [Hash.symbol](): number {
    return Hash.hash([this.path, this.modules, this.types, this.values]);
  }
}

/**
 * Binds new declarations and retains existing exports by identity.
 *
 * `name` must be an absolute path such as `::core::math`. Each declaration binds to that path extended by its key, so a value declared as `rem` emits `::core::math::rem`. An existing type expression, expression or module keeps its identity and the syntax it already emits. Child modules retain their own paths, including when mounted under an alias. Copying and freezing the records prevents caller mutations from adding or replacing exports afterward. The caller's tables are not frozen.
 *
 * Every enumerable own string key becomes an export, including `__proto__`. A non-enumerable key exports nothing. A key must be a HashQL identifier. Emitted paths quote an operator name such as `%`, as in `` ::core::math::`%` ``.
 *
 * Invalid paths, export names and generic arities return a {@link ProgramError.Construction} failure. Its reason is `InvalidModulePath` for a malformed path, `RelativeModulePath` for a relative path, `InvalidExportName` for a key that is not an identifier and `InvalidTypeArity` for an invalid generic arity. Binding stops at the first failure, checking the module, type and value tables in that order.
 *
 * TypeScript keeps the namespaces apart: a value declaration cannot enter `types`, and a type declaration cannot enter `values`. It also rejects a symbol key, which cannot name an export. Each existing export must rebind to its own type. TypeScript rejects a handle extended through `Object.assign`, because rebinding would drop the added properties.
 *
 * @example <caption>Declare a type and its value constructor under one name.</caption>
 * ```ts
 * import assert from "node:assert/strict";
 * import { JExpr, Program } from "@local/hashql";
 * import type { Type } from "@local/hashql";
 * import { Result } from "effect";
 *
 * const { Expression, Module } = Program;
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
  M extends Namespace<Module.Any> & Rebindings<M>,
  T extends Namespace<TypeExpression.Export> & Rebindings<T>,
  V extends Namespace<Expression.Expression.Any> & Rebindings<V>,
>(
  name: string,
  definition: {
    readonly modules?: M;
    readonly types?: Declarations<T>;
    readonly values?: Declarations<V>;
  },
): Result.Result<
  ModuleImpl<M | Empty, T | Empty, V | Empty>,
  ProgramError.Construction
> {
  return Result.gen(function* () {
    const path = yield* pipe(
      name,
      JExpr.Path.decodeResult,
      Result.mapError((cause) =>
        ProgramError.Construction.invalidModulePath(name, cause),
      ),
    );

    if (!path.rooted) {
      return yield* Result.fail(
        ProgramError.Construction.relativeModulePath(name),
      );
    }

    let modules: Readonly<M> | Empty = Object.freeze(emptyTable<Empty>());
    if (definition.modules !== undefined) {
      modules = yield* copyModules(definition.modules);
    }

    const types = yield* bind<T>(path, definition.types);
    const values = yield* bind<V>(path, definition.values);

    return new ModuleImpl<M | Empty, T | Empty, V | Empty>(path, {
      modules,
      types,
      values,
    });
  });
}

/**
 * Rebinds a module tree while preserving each export's declared type.
 *
 * Every export becomes a reference to its name under `path`, including aliases of exports from other modules, because an alias claims that HashQL exports the item under the module's path. Child modules are rebound recursively beneath it. The path can be relative, such as a local name for the module. Each export keeps its descriptor and input requirements even though its syntax becomes a reference. The original module keeps its paths. The first export that cannot be rebound, such as a value whose construction failed, returns its failure. It accepts the module first or last.
 *
 * @example <caption>Rebind an alias and a child module.</caption>
 * ```ts
 * import assert from "node:assert/strict";
 * import { JExpr, Program } from "@local/hashql";
 * import type { Type } from "@local/hashql";
 * import { Result } from "effect";
 *
 * const { Expression, Module } = Program;
 * const compile = (value: Program.Expression.Expression.Any): string =>
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
  ): <M extends Module.Any>(
    self: Module.Any & Relocation.Relocatable<M>,
  ) => Result.Result<M, ProgramError.Construction>;
  <M extends Module.Any>(
    self: Module.Any & Relocation.Relocatable<M>,
    path: JExpr.Path.Path,
  ): Result.Result<M, ProgramError.Construction>;
} = relocateHandle;

/**
 * Assembles already-bound modules without rebasing their references.
 *
 * The result is a frozen `{ modules }` record keyed by the supplied names. It is not a module: it has no path, and {@link isModule} rejects it. Each child keeps its identity and its own path. The record fits any parameter that takes a scope definition, such as a prelude. Names follow the rules and failures of the module table of {@link define}.
 */
export const root = <const M extends Namespace<Module.Any>>(
  modules: M & StringKeyed<M>,
): Result.Result<
  { readonly modules: Readonly<M> },
  ProgramError.Construction
> =>
  pipe(
    modules,
    copyModules,
    Result.map((bound) => Object.freeze({ modules: bound })),
  );
