/**
 * Type syntax annotated with its HashQL semantic meaning.
 *
 * A {@link TypeExpression} carries syntax or a construction failure alongside a type-level descriptor. A {@link Constructor} specializes a named generic type while preserving its semantic argument tuple. Declarations supply these descriptors, and the HashQL compiler validates their use in the emitted program.
 *
 * Use {@link fromType} for existing J-Expr type syntax, {@link reference} for a named type and {@link constructor} for a generic type. These operations and {@link fromResult} attach a trusted descriptor without checking it against the syntax.
 *
 * A failed construction stays inside the type expression. Read the syntax or its failure with {@link toType}.
 *
 * @module
 */
import { Array, Predicate, Result, identity, pipe } from "effect";
import { dual } from "effect/Function";

import {
  Relocate,
  relocate as relocateHandle,
} from "../internal/relocation.js";
import * as ProgramError from "./ProgramError.js";

import type { Relocatable } from "../internal/relocation.js";
import type * as JExpr from "../JExpr/index.js";
import type * as Syntax from "../JExpr/Type/index.js";
import type * as Type from "../Type.js";
import type { Types } from "effect";

const TypeId: unique symbol = Symbol("~hashql/TypeExpression");
const ConstructorId: unique symbol = Symbol("~hashql/TypeConstructor");

/** Type syntax or its construction failure, annotated with its semantic type. */
export interface TypeExpression<T extends Type.Any> extends TypeExpression.Any {
  readonly [TypeId]: Types.Covariant<T>;
  readonly [Relocate]: Relocatable<TypeExpression<T>>[typeof Relocate];
}

export declare namespace TypeExpression {
  /** A type expression with its semantic descriptor erased, for syntax-only operations. */
  export interface Any extends Relocatable<Any> {
    readonly [TypeId]: Types.Covariant<Type.Any>;

    /** The type syntax this handle emits, or the construction failure that prevented it. */
    readonly syntax: Result.Result<Syntax.Type, ProgramError.Construction>;
  }
}

/**
 * A named generic type, specialized by supplying typed type expressions.
 *
 * The argument tuple carries semantic types, and `Arguments` maps each position to its handle. TypeScript infers the tuple from ordinary calls. A generic caller can also supply it explicitly without extracting and re-inferring types from already-normalized handles.
 *
 * A call emits a reference to the constructor's path with one generic argument per supplied type. The result's descriptor is `Type.Apply<F, A>`. TypeScript rejects a call with the wrong number of arguments. At runtime, such a call returns a type expression holding a `TypeArgumentCountMismatch` failure. An argument's construction failure becomes the result's failure.
 */
export interface Constructor<F extends Type.TypeConstructor>
  extends Constructor.Any {
  readonly [Relocate]: Relocatable<Constructor<F>>[typeof Relocate];

  <const A extends readonly Type.Any[]>(
    ...args: Constructor.Arguments<A> & { readonly length: F["arity"] }
  ): TypeExpression<Type.Apply<F, A>>;
}

export declare namespace Constructor {
  /** Maps each argument descriptor to the type expression accepted at that position. */
  type Arguments<A extends readonly Type.Any[]> = {
    readonly [K in keyof A]: TypeExpression<A[K]>;
  };

  /** A generic type export with its parameterization erased. */
  export interface Any extends Relocatable<Any> {
    readonly [ConstructorId]: {
      readonly path: JExpr.Path.Path;
      readonly arity: number;
    };
  }
}

/** An entry of a type namespace: a concrete type expression or a generic type constructor. */
export type Export = TypeExpression.Any | Constructor.Any;

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
export const isConstructor = (value: unknown): value is Constructor.Any =>
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
        fromResult<T>(Result.succeed({ _tag: "Reference", path })),
      ),
    ),
});

/** Reads the type syntax a type expression emits, or its construction failure. */
export const toType = (
  type: TypeExpression.Any,
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
 * The result emits `path` as a type reference and carries the descriptor `T`. Nothing checks that the path exists or has that meaning.
 */
export const reference = <T extends Type.Any>(
  path: JExpr.Path.Path,
): TypeExpression<T> => fromType({ _tag: "Reference", path });

/**
 * Binds a trusted generic declaration to its named type reference.
 *
 * Runtime checking covers arity alone. The declaration supplies the relationship between the argument types and the resulting semantic type.
 *
 * An `arity` that is not a non-negative safe integer returns an `InvalidTypeArity` failure. The successful constructor checks the argument count of each call as {@link Constructor} describes. Application arguments append to the final path segment's existing arguments, preserving earlier segment arguments.
 *
 * @example <caption>Specialize a generic type and inspect an arity failure.</caption>
 * ```ts
 * import assert from "node:assert/strict";
 * import { JExpr, Program } from "@local/hashql";
 * import type { Type } from "@local/hashql";
 * import { Result } from "effect";
 *
 * const { TypeExpression } = Program;
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
 * const text = TypeExpression.reference<Type.PrimitiveString>(
 *   Result.getOrThrow(JExpr.Path.decodeResult("::kernel::type::String")),
 * );
 * const integer = TypeExpression.reference<Type.PrimitiveInteger>(
 *   Result.getOrThrow(JExpr.Path.decodeResult("::kernel::type::Integer")),
 * );
 * const syntax = Result.getOrThrow(TypeExpression.toType(pair(text, integer)));
 * assert.equal(
 *   JExpr.Type.compile(syntax),
 *   "::example::Pair<::kernel::type::String, ::kernel::type::Integer>",
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
    ...args: Constructor.Arguments<A> & { readonly length: F["arity"] }
  ): TypeExpression<Type.Apply<F, A>> => {
    if (args.length !== arity) {
      return pipe(
        ProgramError.Construction.typeArgumentCount(arity, args.length),
        Result.fail,
        fromResult<Type.Apply<F, A>>,
      );
    }

    return pipe(
      // SAFETY: args are already TypeExpression.Any[]
      args as readonly TypeExpression.Any[],
      Array.map(toType),
      Result.all,
      Result.map((args): Syntax.Type => ({
        _tag: "Reference",
        path: {
          rooted: path.rooted,
          segments: Array.modifyLastNonEmpty(
            path.segments,
            (segment): JExpr.Path.Segment => ({
              name: segment.name,
              arguments: [
                ...segment.arguments,
                ...args.map((bound): JExpr.Path.SegmentArgument => ({
                  _tag: "GenericArgument",
                  bound,
                })),
              ],
            }),
          ),
        },
      })),
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
 * Refers to the same semantic type through another HashQL path.
 *
 * Use this when an import or type alias gives an existing type another name in the program. The returned {@link TypeExpression} emits that name while keeping its semantic descriptor. Relocation does not declare the alias or check that the new path denotes the same type: the caller must establish that relationship.
 *
 * A concrete type expression becomes a plain reference to `path`, replacing its previous syntax even if it described a tuple or struct. A generic {@link Constructor} keeps its arity and applies future arguments at the new path. The original remains unchanged. A type expression holding a construction failure returns that failure. It accepts the type expression or constructor first or last.
 *
 * @example <caption>Use a local alias without repeating the semantic type.</caption>
 * ```ts
 * import assert from "node:assert/strict";
 * import { JExpr, Program } from "@local/hashql";
 * import type { Type } from "@local/hashql";
 * import { Result, pipe } from "effect";
 *
 * const { TypeExpression } = Program;
 * const string = TypeExpression.reference<Type.PrimitiveString>(
 *   Result.getOrThrow(JExpr.Path.decodeResult("::kernel::type::String")),
 * );
 *
 * // Assume the program declares Text as an alias for the kernel's String.
 * const text = Result.getOrThrow(
 *   TypeExpression.relocate(
 *     string,
 *     Result.getOrThrow(JExpr.Path.decodeResult("Text")),
 *   ),
 * );
 * assert.equal(
 *   pipe(text, TypeExpression.toType, Result.getOrThrow, JExpr.Type.compile),
 *   "Text",
 * );
 * assert.equal(
 *   pipe(string, TypeExpression.toType, Result.getOrThrow, JExpr.Type.compile),
 *   "::kernel::type::String",
 * );
 * ```
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
  Constructor.Any & {
    readonly [Relocate]: Relocatable<Adapted<C>>[typeof Relocate];
  };

/**
 * Adds a calling convention to a generic type constructor that survives relocation.
 *
 * Use this to fix some type arguments or accept shorthand before calling a {@link Constructor}. For example, a string-keyed pair helper can accept only the value type. An ordinary wrapper closes over the original constructor and has no relocation operation. This adapter keeps the helper callable through {@link relocate}, so an imported alias can use the same convenience API.
 *
 * The `adapt` callback runs immediately and again after each successful relocation, receiving the constructor at its new path. Build the callable from that argument rather than capturing the original constructor, or it will keep emitting the old path. The result retains the callback's call signature and {@link isConstructor} recognizes it. It accepts the constructor first or last.
 *
 * @example <caption>Keep a string-keyed pair helper when importing its constructor under an alias.</caption>
 * ```ts
 * import assert from "node:assert/strict";
 * import { JExpr, Program } from "@local/hashql";
 * import type { Type } from "@local/hashql";
 * import { Result, pipe } from "effect";
 *
 * const { TypeExpression } = Program;
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
 * const pair = Result.getOrThrow(TypeExpression.constructor<Pair>(
 *   Result.getOrThrow(JExpr.Path.decodeResult("::collections::Pair")),
 *   2,
 * ));
 * const string = TypeExpression.reference<Type.PrimitiveString>(
 *   Result.getOrThrow(JExpr.Path.decodeResult("::kernel::type::String")),
 * );
 * const integer = TypeExpression.reference<Type.PrimitiveInteger>(
 *   Result.getOrThrow(JExpr.Path.decodeResult("::kernel::type::Integer")),
 * );
 * const entry = TypeExpression.adaptConstructor(pair, (current) =>
 *   <T extends Type.Any>(value: Program.TypeExpression.TypeExpression<T>) =>
 *     current(string, value),
 * );
 *
 * // Assume the program imports ::collections::Pair as Pair.
 * const localEntry = pipe(
 *   entry,
 *   TypeExpression.relocate(Result.getOrThrow(JExpr.Path.decodeResult("Pair"))),
 *   Result.getOrThrow,
 * );
 * assert.equal(
 *   pipe(localEntry(integer), TypeExpression.toType, Result.getOrThrow, JExpr.Type.compile),
 *   "Pair<::kernel::type::String, ::kernel::type::Integer>",
 * );
 * assert.equal(
 *   pipe(entry(integer), TypeExpression.toType, Result.getOrThrow, JExpr.Type.compile),
 *   "::collections::Pair<::kernel::type::String, ::kernel::type::Integer>",
 * );
 * ```
 */
export const adaptConstructor: {
  <
    S extends Constructor.Any,
    C extends (...args: never[]) => TypeExpression.Any,
  >(
    adapt: (self: S) => C,
  ): (self: S & Relocatable<S>) => Adapted<C>;
  <
    S extends Constructor.Any,
    C extends (...args: never[]) => TypeExpression.Any,
  >(
    self: S & Relocatable<S>,
    adapt: (self: S) => C,
  ): Adapted<C>;
} = dual(
  2,
  <
    S extends Constructor.Any,
    C extends (...args: never[]) => TypeExpression.Any,
  >(
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
