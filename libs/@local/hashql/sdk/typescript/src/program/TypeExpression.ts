import { Result, identity } from "effect";

import * as ProgramError from "./ProgramError.js";

import type * as JExpr from "../jexpr/index.js";
import type * as Syntax from "../jexpr/type/index.js";
import type * as Type from "../type/index.js";
import type { Types } from "effect";

const TypeId: unique symbol = Symbol("~hashql/TypeExpression");
const ConstructorId: unique symbol = Symbol("~hashql/TypeConstructor");

/** Type construction with its semantic annotation erased. */
export interface Any {
  readonly syntax: Result.Result<Syntax.Type, ProgramError.Construction>;
  readonly [TypeId]: (value: never) => Type.Any;
}

/** Type syntax or its construction failure, annotated with its semantic type. */
export interface TypeExpression<T extends Type.Any> extends Any {
  readonly [TypeId]: Types.Invariant<T>;
}

type ArgumentTypes<Arguments extends readonly Any[]> = {
  readonly [Index in keyof Arguments]: Arguments[Index] extends TypeExpression<
    infer T
  >
    ? T
    : never;
};

/** A named generic type, specialized by supplying typed type expressions. */
export interface Constructor<Lambda extends Type.TypeConstructor> {
  readonly [ConstructorId]: {
    readonly path: JExpr.Path.Path;
    readonly arity: number;
  };
  <const Arguments extends readonly Any[]>(
    ...args: Arguments & { readonly length: Lambda["arity"] }
  ): TypeExpression<Type.Apply<Lambda, ArgumentTypes<Arguments>>>;
}

/** A generic type export with its parameterization erased. */
export interface AnyConstructor {
  readonly [ConstructorId]: {
    readonly path: JExpr.Path.Path;
    readonly arity: number;
  };
}

/** A type namespace contains both concrete types and generic type constructors. */
export type Export = Any | AnyConstructor;

/** Recognizes concrete type expressions and generic type constructors. */
// oxlint-disable-next-line typescript/no-restricted-types -- this guard narrows unchecked environment entries
export const isExport = (value: unknown): value is Export =>
  ((typeof value === "object" && value !== null) ||
    typeof value === "function") &&
  (TypeId in value || ConstructorId in value);

export const fromResult = <T extends Type.Any>(
  syntax: Result.Result<Syntax.Type, ProgramError.Construction>,
): TypeExpression<T> => ({ syntax, [TypeId]: identity<T> });

export const toType = (
  type: Any,
): Result.Result<Syntax.Type, ProgramError.Construction> => type.syntax;

/**
 * Annotates syntax supplied by a trusted type declaration.
 *
 * The caller must ensure that `syntax` denotes `T`, because the annotation performs no runtime type check.
 */
export const fromType = <T extends Type.Any>(
  syntax: Syntax.Type,
): TypeExpression<T> => fromResult(Result.succeed(syntax));

/** Binds a trusted semantic declaration to a named type reference. */
export const reference = <T extends Type.Any>(
  path: JExpr.Path.Path,
): TypeExpression<T> => fromType({ _tag: "Reference", path, generics: [] });

/**
 * Binds a trusted generic declaration to its named type reference.
 *
 * Runtime checking covers arity alone. The declaration supplies the relationship between the argument types and the resulting semantic type.
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- the path names the reference under construction
export const constructor = <Lambda extends Type.TypeConstructor>(
  path: JExpr.Path.Path,
  arity: Lambda["arity"],
): Result.Result<Constructor<Lambda>, ProgramError.Construction> => {
  if (!Number.isSafeInteger(arity) || arity < 0) {
    return Result.fail(
      new ProgramError.Construction({
        reason: ProgramError.Reason.InvalidTypeArity({ arity }),
      }),
    );
  }

  const instantiate = <const Arguments extends readonly Any[]>(
    ...args: Arguments & { readonly length: Lambda["arity"] }
  ): TypeExpression<Type.Apply<Lambda, ArgumentTypes<Arguments>>> => {
    if (args.length !== arity) {
      return fromResult(
        Result.fail(
          new ProgramError.Construction({
            reason: ProgramError.Reason.TypeArgumentCount({
              expected: arity,
              received: args.length,
            }),
          }),
        ),
      );
    }

    return fromResult(
      Result.map(Result.all(args.map(toType)), (arguments_) => ({
        _tag: "Reference",
        path,
        generics: arguments_.map((bound) => ({
          _tag: "GenericArgument",
          bound,
        })),
      })),
    );
  };

  return Result.succeed(
    Object.assign(instantiate, { [ConstructorId]: { path, arity } }),
  );
};

/** Rebinds an imported type name without changing its declared meaning. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- constructs a reference at the imported path
export const relocate = (
  type: Export,
  path: JExpr.Path.Path,
): Result.Result<Export, ProgramError.Construction> => {
  if (ConstructorId in type) {
    return constructor(path, type[ConstructorId].arity);
  }

  return Result.map(toType(type), () => reference(path));
};
