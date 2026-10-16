/**
 * Type syntax annotated with its HashQL semantic meaning.
 *
 * A {@link TypeExpression} carries syntax or a construction failure alongside a type-level descriptor. A {@link Constructor} specializes a named generic type while preserving its semantic argument tuple. Declarations supply these descriptors, and the HashQL compiler validates their use in the emitted program.
 *
 * Type expressions come from module declarations, the built-in prelude, structural shorthand and the type aliases of the Do and Draft APIs. They appear wherever a program names a type, such as the type of an input. The operations here that annotate syntax or a path, {@link fromResult}, {@link fromType}, {@link reference} and {@link constructor}, attach the descriptor without checking it.
 *
 * A failed construction stays inside the type expression. It surfaces when a caller reads the syntax, either directly or through an expression or program that uses the type.
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
import type * as JExpr from "../JExpr/index.js";
import type * as Syntax from "../JExpr/Type/index.js";
import type * as Type from "../Type/index.js";
import type { Types } from "effect";

const TypeId: unique symbol = Symbol("~hashql/TypeExpression");
const ConstructorId: unique symbol = Symbol("~hashql/TypeConstructor");

/** A type expression with its semantic descriptor erased, for syntax-only operations. */
export interface Any extends Relocatable<Any> {
  /** The type syntax this handle emits, or the construction failure that prevented it. */
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

/** Maps each argument descriptor to the type expression accepted at that position. */
type Arguments<A extends readonly Type.Any[]> = {
  readonly [K in keyof A]: TypeExpression<A[K]>;
};

/**
 * A named generic type, specialized by supplying typed type expressions.
 *
 * The argument tuple carries semantic types, and `Arguments` maps each position to its handle. TypeScript infers the tuple from ordinary calls. A generic caller can also supply it explicitly without extracting and re-inferring types from already-normalized handles.
 *
 * A call emits a reference to the constructor's path with one generic argument per supplied type. The result's descriptor is `Type.Apply<F, A>`. TypeScript rejects a call with the wrong number of arguments. At runtime, such a call returns a type expression holding a `TypeArgumentCount` failure. An argument's construction failure becomes the result's failure.
 */
export interface Constructor<
  F extends Type.TypeConstructor,
> extends AnyConstructor {
  readonly [Relocate]: Relocatable<Constructor<F>>[typeof Relocate];

  <const A extends readonly Type.Any[]>(
    ...args: Arguments<A> & { readonly length: F["arity"] }
  ): TypeExpression<Type.Apply<F, A>>;
}

/** An entry of a type namespace: a concrete type expression or a generic type constructor. */
export type Export = Any | AnyConstructor;

/**
 * Recognizes concrete type expressions and generic type constructors.
 *
 * The guard checks for the SDK's marker properties and does not check a semantic descriptor. A joined namespace name that includes a type also passes.
 */
// oxlint-disable-next-line typescript/no-restricted-types -- this guard narrows unchecked environment entries
export const isExport = (value: unknown): value is Export =>
  Predicate.hasProperty(value, TypeId) ||
  Predicate.hasProperty(value, ConstructorId);

/** Recognizes generic type constructors by their marker property, including combined namespace handles. */
// oxlint-disable-next-line typescript/no-restricted-types -- the guard accepts unchecked host values
export const isConstructor = (value: unknown): value is AnyConstructor =>
  Predicate.hasProperty(value, ConstructorId);

/**
 * Annotates type syntax, or a construction failure, with a trusted semantic descriptor.
 *
 * The caller must ensure that successful syntax denotes `T`. A failure stays in the handle until something reads its syntax. Rebinding a successful result produces a reference to the new path, while a failed result keeps its failure.
 */
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

/** Reads the type syntax a type expression emits, or its construction failure. */
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

/**
 * Binds a trusted semantic declaration to a named type reference.
 *
 * The result emits `path` as a type reference and carries the descriptor `T`. Nothing checks that the path exists or has that meaning. `Module.type` creates the same reference for a declared export.
 */
export const reference = <T extends Type.Any>(
  path: JExpr.Path.Path,
): TypeExpression<T> => fromType({ _tag: "Reference", path, generics: [] });

/**
 * Binds a trusted generic declaration to its named type reference.
 *
 * Runtime checking covers arity alone. The declaration supplies the relationship between the argument types and the resulting semantic type.
 *
 * An `arity` that is not a non-negative safe integer returns an `InvalidTypeArity` failure. The successful constructor checks the argument count of each call as {@link Constructor} describes. `Module.genericType` declares the same constructor for a module export.
 *
 * @example <caption>Specialize a generic type and inspect an arity failure.</caption>
 * ```ts
 * import assert from "node:assert/strict";
 * import { Expression, JExpr, Prelude, TypeExpression } from "@local/hashql";
 * import type { Type } from "@local/hashql";
 * import { Result } from "effect";
 *
 * interface Pair extends Type.TypeConstructor {
 *   readonly arity: 2;
 *   readonly type: this["Target"] extends readonly [
 *     infer L extends Type.Any,
 *     infer R extends Type.Any,
 *   ]
 *     ? Type.Tuple<readonly [L, R]>
 *     : Type.Never;
 * }
 *
 * const path = Result.getOrThrow(JExpr.Path.decodeResult("::example::Pair"));
 * const pair = Result.getOrThrow(TypeExpression.constructor<Pair>(path, 2));
 * const { types } = Prelude.builtin;
 * const entry = Expression.input("entry", pair(types.String, types.Integer));
 * assert.equal(
 *   JExpr.compile(Result.getOrThrow(Expression.toJExpr(entry))),
 *   '["::kernel::special_form::input","entry","::example::Pair<::kernel::type::String, ::kernel::type::Integer>"]',
 * );
 *
 * const invalid = TypeExpression.constructor<Type.TypeConstructor>(path, -1);
 * assert.ok(Result.isFailure(invalid));
 * assert.equal(invalid.failure.reason._tag, "InvalidTypeArity");
 * ```
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

/**
 * Rebinds a type reference or generic constructor while retaining its declared capabilities.
 *
 * Rebinding turns a concrete type expression into a plain reference to `path`, whatever syntax it emitted before, including a structural type. For a constructor it keeps the arity and emits applications at `path`. The result keeps the descriptor and leaves the original handle as it was. A type expression holding a construction failure returns that failure. Imports and `Module.relocate` use this operation to move each type export. It accepts the handle first or last.
 */
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
 * The adapter receives the rebound declaration each time. Retaining only the first callable would leave later calls pointing at the old path, so build calls from the adapter's argument rather than from a captured constructor. The result keeps the constructor marker, so {@link isConstructor} accepts it and namespaces treat it as a type export. Copying the marker explicitly supports forwarding proxies that do not enumerate it. The built-in `List` and `Dict` use this to accept structural shorthand. It accepts the constructor first or last.
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
