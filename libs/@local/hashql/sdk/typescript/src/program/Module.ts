/**
 * Typed declarations bound to absolute HashQL paths.
 *
 * Modules keep type and value exports separate because a type and its constructor can share a name. Existing exports are aliases: selecting or regrouping one never changes its reference. Declarations supply trusted type information. The HashQL compiler checks the emitted query.
 *
 * @module
 */
import { Result } from "effect";

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
export interface Declaration<Export> {
  readonly [Declare]: (
    path: JExpr.Path.Path,
  ) => Result.Result<Export, ProgramError.Construction>;
}

/** An inspectable export table without fixing its concrete key set. */
interface Namespace<Export> extends ReadonlyRecord<string, Export> {}

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

type Entries<Shape, Key extends PropertyKey> = Key extends keyof Shape
  ? Shape[Key]
  : Empty;
type Exports<Declarations> = {
  readonly [Name in keyof Declarations]: Declarations[Name] extends Declaration<
    infer Export
  >
    ? Export
    : Declarations[Name];
};

/** An immutable module record preserving each export's concrete type. */
export interface Module<Shape extends Definition> {
  readonly [TypeId]: true;
  readonly path: JExpr.Path.Path;
  readonly modules: Readonly<Entries<Shape, "modules">>;
  readonly types: Exports<Entries<Shape, "types">>;
  readonly values: Exports<Entries<Shape, "values">>;
}

/** Recognizes a module assembled by this SDK. */
// oxlint-disable-next-line typescript/no-restricted-types -- this guard narrows unchecked environment entries
export const isModule = (value: unknown): value is Any =>
  typeof value === "object" && value !== null && TypeId in value;

/** Declares a value with trusted semantic type information. */
export const value = <T extends Type.Any>(): Declaration<
  Expression.Expression<T, Inputs.Empty>
> => ({
  [Declare]: (path) =>
    Result.succeed(
      Expression.fromJExpr<T, Inputs.Empty>(JExpr.Path.compile(path)),
    ),
});

/** Declares a named type without expanding it into its structural representation. */
export const type = <T extends Type.Any>(): Declaration<
  TypeExpression.TypeExpression<T>
> => ({
  [Declare]: (path) => Result.succeed(TypeExpression.reference<T>(path)),
});

/** Declares a named generic type with a type-level operation for its result. */
export const genericType = <Lambda extends Type.TypeConstructor>(
  arity: Lambda["arity"],
): Declaration<TypeExpression.Constructor<Lambda>> => ({
  [Declare]: (path) => TypeExpression.constructor<Lambda>(path, arity),
});

const memberName = (
  name: string,
): Result.Result<JExpr.Ident.Ident, ProgramError.Construction> =>
  Result.mapError(
    JExpr.Ident.decodeResult(name),
    (cause) =>
      new ProgramError.Construction({
        reason: ProgramError.Reason.InvalidExportName({ name, cause }),
      }),
  );

const bind = <Export>(
  parent: JExpr.Path.Path,
  entries: Namespace<Declaration<Export> | Export>,
): Result.Result<Namespace<Export>, ProgramError.Construction> =>
  Result.gen(function* () {
    const exports: [string, Export][] = [];

    for (const [name, entry] of Object.entries(entries)) {
      const ident = yield* memberName(name);
      const path: JExpr.Path.Path = {
        rooted: true,
        segments: [...parent.segments, ident],
      };

      if (typeof entry === "object" && entry !== null && Declare in entry) {
        exports.push([name, yield* entry[Declare](path)]);
      } else {
        exports.push([name, entry]);
      }
    }

    return Object.freeze(Object.fromEntries(exports));
  });

/**
 * Binds new declarations and retains existing exports by identity.
 *
 * Child modules retain their own paths, including when mounted under an alias. Copying and freezing the records prevents caller mutations from adding or replacing exports afterward.
 *
 * Invalid paths, export names and generic arities return construction failures.
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- the path names the module under construction
export const define = <const Shape extends Definition>(
  name: string,
  definition: Shape,
): Result.Result<Module<Shape>, ProgramError.Construction> =>
  Result.gen(function* () {
    const path = yield* Result.mapError(
      JExpr.Path.decodeResult(name),
      (cause) =>
        new ProgramError.Construction({
          reason: ProgramError.Reason.InvalidModulePath({ name, cause }),
        }),
    );

    if (!path.rooted) {
      return yield* Result.fail(
        new ProgramError.Construction({
          reason: ProgramError.Reason.RelativeModulePath({ name }),
        }),
      );
    }

    for (const child of Object.keys(definition.modules ?? {})) {
      yield* memberName(child);
    }

    const module = Object.freeze({
      [TypeId]: true,
      path,
      modules: Object.freeze({ ...definition.modules }),
      types: yield* bind<TypeExpression.Export>(path, definition.types ?? {}),
      values: yield* bind<Expression.Any>(path, definition.values ?? {}),
    });

    // SAFETY: binding changes each Declaration<A> into A without changing any key or existing export.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the heterogeneous mapping preserves each declaration result
    return module as Module<Shape>;
  });

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
      const ident = yield* JExpr.Ident.decodeResult(name).pipe(
        Result.mapError(
          (cause) =>
            new ProgramError.Construction({
              reason: ProgramError.Reason.InvalidExportName({ name, cause }),
            }),
        ),
      );

      modules.push([
        name,
        yield* relocate(child, {
          rooted: path.rooted,
          segments: [...path.segments, ident],
        }),
      ]);
    }

    for (const name of Object.keys(module.values)) {
      const ident = yield* JExpr.Ident.decodeResult(name).pipe(
        Result.mapError(
          (cause) =>
            new ProgramError.Construction({
              reason: ProgramError.Reason.InvalidExportName({ name, cause }),
            }),
        ),
      );

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
      const ident = yield* JExpr.Ident.decodeResult(name).pipe(
        Result.mapError(
          (cause) =>
            new ProgramError.Construction({
              reason: ProgramError.Reason.InvalidExportName({ name, cause }),
            }),
        ),
      );

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
export const root = <const Modules extends Namespace<Any>>(
  modules: Modules,
): Result.Result<
  { readonly modules: Readonly<Modules> },
  ProgramError.Construction
> =>
  Result.gen(function* () {
    for (const name of Object.keys(modules)) {
      yield* memberName(name);
    }

    return Object.freeze({ modules: Object.freeze({ ...modules }) });
  });
