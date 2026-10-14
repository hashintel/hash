/**
 * Type syntax annotated with its HashQL semantic meaning.
 *
 * A {@link TypeExpression} carries syntax or a construction failure alongside a type-level descriptor. A {@link Constructor} specializes a named generic type while preserving its semantic argument tuple. Declarations supply these descriptors, and the HashQL compiler validates their use in the emitted program.
 *
 * @module
 */
import { Predicate, Result, identity, pipe } from "effect";
import { dual } from "effect/Function";

import {
  Relocate,
  relocate as relocateHandle,
} from "../internal/relocation.js";
import * as ProgramError from "./ProgramError.js";

import type { Relocatable } from "../internal/relocation.js";
import type * as JExpr from "../jexpr/index.js";
import type * as Syntax from "../jexpr/type/index.js";
import type * as Type from "../type/index.js";
import type { Types } from "effect";

const TypeId: unique symbol = Symbol("~hashql/TypeExpression");
const ConstructorId: unique symbol = Symbol("~hashql/TypeConstructor");

/** Type construction with its semantic annotation erased. */
export interface Any extends Relocatable<Any> {
  readonly syntax: Result.Result<Syntax.Type, ProgramError.Construction>;
  readonly [TypeId]: Types.Covariant<Type.Any>;
}

/** Type syntax or its construction failure, annotated with its semantic type. */
export interface TypeExpression<T extends Type.Any> extends Any {
  readonly [TypeId]: Types.Covariant<T>;
  readonly [Relocate]: Relocatable<TypeExpression<T>>[typeof Relocate];
}

/** A generic type export with its parameterization erased. */
export interface AnyConstructor extends Relocatable<AnyConstructor> {
  readonly [ConstructorId]: {
    readonly path: JExpr.Path.Path;
    readonly arity: number;
  };
}

type Arguments<A extends readonly Type.Any[]> = {
  readonly [K in keyof A]: TypeExpression<A[K]>;
};

/**
 * A named generic type, specialized by supplying typed type expressions.
 *
 * The argument tuple carries semantic types, and `Arguments` maps each position to its handle. TypeScript infers the tuple from ordinary calls. A generic caller can also supply it explicitly without extracting and re-inferring types from already-normalized handles.
 */
export interface Constructor<
  F extends Type.TypeConstructor,
> extends AnyConstructor {
  readonly [Relocate]: Relocatable<Constructor<F>>[typeof Relocate];

  <const A extends readonly Type.Any[]>(
    ...args: Arguments<A> & { readonly length: F["arity"] }
  ): TypeExpression<Type.Apply<F, A>>;
}

/** A type namespace contains both concrete types and generic type constructors. */
export type Export = Any | AnyConstructor;

/** Recognizes concrete type expressions and generic type constructors. */
// oxlint-disable-next-line typescript/no-restricted-types -- this guard narrows unchecked environment entries
export const isExport = (value: unknown): value is Export =>
  Predicate.hasProperty(value, TypeId) ||
  Predicate.hasProperty(value, ConstructorId);

/** Recognizes generic type constructors, including combined namespace handles. */
// oxlint-disable-next-line typescript/no-restricted-types -- the guard accepts unchecked host values
export const isConstructor = (value: unknown): value is AnyConstructor =>
  Predicate.hasProperty(value, ConstructorId);

export const fromResult = <T extends Type.Any>(
  syntax: Result.Result<Syntax.Type, ProgramError.Construction>,
): TypeExpression<T> => ({
  syntax,
  [TypeId]: identity<T>,
  [Relocate]: (path) =>
    pipe(
      syntax,
      Result.map(() =>
        fromResult<T>(
          Result.succeed({ _tag: "Reference", path, generics: [] }),
        ),
      ),
    ),
});

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
): TypeExpression<T> => pipe(syntax, Result.succeed, fromResult<T>);

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
export const constructor = <F extends Type.TypeConstructor>(
  path: JExpr.Path.Path,
  arity: F["arity"],
): Result.Result<Constructor<F>, ProgramError.Construction> => {
  if (!Number.isSafeInteger(arity) || arity < 0) {
    return Result.fail(ProgramError.Construction.invalidTypeArity(arity));
  }

  const instantiate = <const A extends readonly Type.Any[]>(
    ...args: Arguments<A> & { readonly length: F["arity"] }
  ): TypeExpression<Type.Apply<F, A>> => {
    if (args.length !== arity) {
      return pipe(
        ProgramError.Construction.typeArgumentCount(arity, args.length),
        Result.fail,
        fromResult<Type.Apply<F, A>>,
      );
    }

    return pipe(
      args,
      (arguments_) => arguments_.map(toType),
      Result.all,
      Result.map(
        (arguments_): Syntax.Type => ({
          _tag: "Reference",
          path,
          generics: arguments_.map((bound) => ({
            _tag: "GenericArgument",
            bound,
          })),
        }),
      ),
      fromResult<Type.Apply<F, A>>,
    );
  };

  return Result.succeed(
    Object.assign(instantiate, {
      [ConstructorId]: { path, arity },
      [Relocate]: (next: JExpr.Path.Path) => constructor<F>(next, arity),
    }),
  );
};

/** Rebinds a type reference or generic constructor while retaining its declared capabilities. */
export const relocate: {
  (
    path: JExpr.Path.Path,
  ): <E extends Export>(
    self: Export & Relocatable<E>,
  ) => Result.Result<E, ProgramError.Construction>;
  <E extends Export>(
    self: Export & Relocatable<E>,
    path: JExpr.Path.Path,
  ): Result.Result<E, ProgramError.Construction>;
} = relocateHandle;

/** An adapted callable retains both its signature and its rebinding operation. */
type Adapted<C> = C &
  AnyConstructor & {
    readonly [Relocate]: Relocatable<Adapted<C>>[typeof Relocate];
  };

/**
 * Adapts a named constructor while retaining its argument normalization after rebinding.
 *
 * The adapter receives the rebound declaration each time. Retaining only the first callable would leave later calls pointing at the old path. Copying the marker explicitly supports forwarding proxies that do not enumerate it.
 */
export const adaptConstructor: {
  <S extends AnyConstructor, C extends (...args: never[]) => Any>(
    adapt: (self: S) => C,
  ): (self: S & Relocatable<S>) => Adapted<C>;
  <S extends AnyConstructor, C extends (...args: never[]) => Any>(
    self: S & Relocatable<S>,
    adapt: (self: S) => C,
  ): Adapted<C>;
} = dual(
  2,
  <S extends AnyConstructor, C extends (...args: never[]) => Any>(
    self: S & Relocatable<S>,
    adapt: (self: S) => C,
  ): Adapted<C> => {
    const build = (source: S): Adapted<C> =>
      Object.assign(adapt(source), {
        [ConstructorId]: source[ConstructorId],
        [Relocate]: (
          path: JExpr.Path.Path,
        ): Result.Result<Adapted<C>, ProgramError.Construction> =>
          pipe(relocateHandle<S>(self, path), Result.map(build)),
      });

    return build(self);
  },
);
