/**
 * Typed declarations bound to absolute HashQL paths.
 *
 * Modules keep type and value exports separate because a type and its constructor can share a name. Existing exports are aliases: selecting or regrouping one never changes its reference. Declarations supply trusted type information. The HashQL compiler checks the emitted query.
 *
 * @module
 */
import { Predicate, Result, flow, pipe } from "effect";

import * as JExpr from "../jexpr/index.js";
import * as Expression from "./Expression.js";
import * as ProgramError from "./ProgramError.js";
import * as TypeExpression from "./TypeExpression.js";

import type * as Type from "../type/index.js";
import type * as Inputs from "./Inputs.js";
import type { ReadonlyRecord } from "effect/Record";

const Declare: unique symbol = Symbol("~hashql/ModuleDeclaration");
const TypeId: unique symbol = Symbol("~hashql/Module");

/** A declaration waiting for the module to supply its absolute export path. */
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

/** A module with its concrete export names erased. */
export interface Any {
  readonly [TypeId]: true;
  readonly path: JExpr.Path.Path;
  readonly modules: Namespace<Any>;
  readonly types: Namespace<TypeExpression.Export>;
  readonly values: Namespace<Expression.Any>;
}

/** Named declarations and existing exports to assemble into a module. */
export interface Definition {
  readonly modules?: Namespace<Any>;
  readonly types?: Namespace<
    Declaration<TypeExpression.Export> | TypeExpression.Export
  >;
  readonly values?: Namespace<Declaration<Expression.Any> | Expression.Any>;
}

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

type Exports<D> = {
  readonly [K in keyof D]: Export<D[K]>;
};

/** Bound tables retain their key-to-export relationships independently of the source declarations. */
interface Bound<M, T, V> {
  readonly [TypeId]: true;
  readonly path: JExpr.Path.Path;
  readonly modules: Readonly<M>;
  readonly types: Readonly<T>;
  readonly values: Readonly<V>;
}

/** An immutable module record preserving each export's concrete type. */
export interface Module<S extends Definition> extends Bound<
  Entries<S, "modules">,
  Exports<Entries<S, "types">>,
  Exports<Entries<S, "values">>
> {}

/** Recognizes a module assembled by this SDK. */
// oxlint-disable-next-line typescript/no-restricted-types -- this guard narrows unchecked environment entries
export const isModule = (value: unknown): value is Any =>
  Predicate.hasProperty(value, TypeId);

/** Declares a value with trusted semantic type information. */
export const value = <T extends Type.Any>(): Declaration<
  Expression.Expression<T, Inputs.Empty>
> => ({
  [Declare]: flow(
    JExpr.Path.compile,
    Expression.fromJExpr<T, Inputs.Empty>,
    Result.succeed,
  ),
});

/** Declares a named type without expanding it into its structural representation. */
export const type = <T extends Type.Any>(): Declaration<
  TypeExpression.TypeExpression<T>
> => ({
  [Declare]: flow(TypeExpression.reference<T>, Result.succeed),
});

/** Declares a named generic type with a type-level operation for its result. */
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

/**
 * Binds new declarations and retains existing exports by identity.
 *
 * Child modules retain their own paths, including when mounted under an alias. Copying and freezing the records prevents caller mutations from adding or replacing exports afterward.
 *
 * Invalid paths, export names and generic arities return construction failures.
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- the path names the module under construction
export function define<const S extends Definition>(
  name: string,
  definition: S,
): Result.Result<Module<S>, ProgramError.Construction>;
export function define<
  M extends Namespace<Any>,
  T extends Namespace<TypeExpression.Export>,
  V extends Namespace<Expression.Any>,
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

    return Object.freeze({
      [TypeId]: true as const,
      path,
      modules,
      types: yield* bind<T>(path, definition.types),
      values: yield* bind<V>(path, definition.values),
    });
  });
}

/** Rebinds a module and its exports beneath a locally imported module name. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- internal module rebinding requires both the module and its local path
export const relocate = (
  module: Any,
  path: JExpr.Path.Path,
): Result.Result<Any, ProgramError.Construction> =>
  Result.gen(function* () {
    const modules: [string, Any][] = [];
    const values: [string, Expression.Any][] = [];
    const types: [string, TypeExpression.Export][] = [];

    for (const [name, child] of Object.entries(module.modules)) {
      const ident = yield* memberName(name);

      modules.push([
        name,
        yield* relocate(child, {
          rooted: path.rooted,
          segments: [...path.segments, ident],
        }),
      ]);
    }

    for (const name of Object.keys(module.values)) {
      const ident = yield* memberName(name);

      values.push([
        name,
        Expression.fromJExpr(
          JExpr.Path.compile({
            rooted: path.rooted,
            segments: [...path.segments, ident],
          }),
        ),
      ]);
    }

    for (const [name, type] of Object.entries(module.types)) {
      const ident = yield* memberName(name);

      types.push([
        name,
        yield* TypeExpression.relocate(type, {
          rooted: path.rooted,
          segments: [...path.segments, ident],
        }),
      ]);
    }

    return Object.freeze({
      [TypeId]: true as const,
      path,
      modules: Object.freeze(Object.fromEntries(modules)),
      values: Object.freeze(Object.fromEntries(values)),
      types: Object.freeze(Object.fromEntries(types)),
    });
  });

/** Assembles already-bound modules without rebasing their references. */
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
