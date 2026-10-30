/**
 * Type syntax annotated with its HashQL semantic meaning.
 *
 * A {@link TypeExpression} carries syntax or a construction failure alongside a type-level descriptor. A {@link Constructor} specializes a named generic type while preserving its semantic argument tuple. Declarations supply these descriptors. The HashQL compiler validates their use in the emitted program.
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
  head,
  relocate as relocateHandle,
} from "../internal/relocation.js";
import * as ProgramError from "./ProgramError.js";
import * as TAST from "./TAST/index.js";

import type * as Referential from "../internal/referential.js";
import type { Bound, Relocatable } from "../internal/relocation.js";
import type * as JExpr from "../JExpr/index.js";
import type * as Syntax from "../JExpr/Type/index.js";
import type * as Type from "../Type.js";
import type { Types } from "effect";

export type { Relocatable } from "../internal/relocation.js";

/** The string key that marks a type expression, which {@link isTypeExpression} and {@link isExport} check. */
export type TypeId = "~hashql/TypeExpression";
const TypeId: TypeId = "~hashql/TypeExpression";

/** The string key that marks a generic type constructor, which {@link isConstructor} and {@link isExport} check. */
export type ConstructorId = "~hashql/TypeConstructor";
const ConstructorId: ConstructorId = "~hashql/TypeConstructor";

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

    /** The type node this handle emits, which keeps the ids of the program's bindings its syntax names. */
    readonly [TAST.Node]: Result.Result<
      TAST.TypeNode.Any,
      ProgramError.Construction
    >;
  }
}

/**
 * A named generic type, specialized by supplying typed type expressions.
 *
 * The argument tuple carries semantic types, and `Arguments` maps each position to its handle. TypeScript infers the tuple from ordinary calls. A generic caller can also supply it explicitly without extracting and re-inferring types from already-normalized handles.
 *
 * A call emits a reference to the constructor's path with one generic argument per supplied type. The result's descriptor is `Type.TypeLambda.Apply<F, A>`. TypeScript rejects a call with the wrong number of arguments. At runtime, such a call returns a type expression holding a `TypeArgumentCountMismatch` failure. An argument's construction failure becomes the result's failure.
 */
export interface Constructor<F extends Type.TypeConstructor>
  extends Constructor.Any {
  readonly [Relocate]: Relocatable<Constructor<F>>[typeof Relocate];

  <const A extends readonly Type.Any[]>(
    ...args: Constructor.Arguments<A> & { readonly length: F["arity"] }
  ): TypeExpression<Type.TypeLambda.Apply<F, A>>;
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

/** Recognizes concrete type expressions by their marker property, without checking the stored syntax or the semantic descriptor. */
// oxlint-disable-next-line typescript/no-restricted-types -- the guard accepts unchecked host values
export const isTypeExpression = (value: unknown): value is TypeExpression.Any =>
  Predicate.hasProperty(value, TypeId);

/** Recognizes generic type constructors by their marker property, including combined namespace handles. */
// oxlint-disable-next-line typescript/no-restricted-types -- the guard accepts unchecked host values
export const isConstructor = (value: unknown): value is Constructor.Any =>
  Predicate.hasProperty(value, ConstructorId);

/**
 * Reads the number of type arguments a generic type constructor takes.
 *
 * An adapted constructor reports the arity of the constructor it adapts, whatever its own signature takes.
 */
export const arity = (constructor: Constructor.Any): number =>
  constructor[ConstructorId].arity;

/**
 * Annotates a type node, or a construction failure, with a trusted semantic descriptor.
 *
 * The caller must ensure that the node's syntax denotes `T`. A failure stays in the handle until something reads its syntax. Rebinding a successful result produces a reference to the new path. Rebinding a failed result returns its failure.
 */
export const fromNode = <T extends Type.Any>(
  node: Result.Result<TAST.TypeNode.Any, ProgramError.Construction>,
): TypeExpression<T> => ({
  get syntax(): Result.Result<Syntax.Type, ProgramError.Construction> {
    return Result.map(node, TAST.compile);
  },
  [TAST.Node]: node,
  [TypeId]: identity<T>,
  [Relocate]: (path, bound) =>
    pipe(
      node,
      Result.map(() =>
        fromNode<T>(
          Result.succeed(
            new TAST.Reference(path, [], head(path, "type", bound)),
          ),
        ),
      ),
    ),
});

/**
 * Annotates type syntax, or a construction failure, with a trusted semantic descriptor.
 *
 * The caller must ensure that successful syntax denotes `T`. A failure stays in the handle until something reads its syntax. Rebinding a successful result produces a reference to the new path. Rebinding a failed result returns its failure.
 */
export const fromResult = <T extends Type.Any>(
  syntax: Result.Result<Syntax.Type, ProgramError.Construction>,
): TypeExpression<T> =>
  pipe(
    syntax,
    Result.map((syntax) => new TAST.Syntax(syntax)),
    fromNode<T>,
  );

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
): TypeExpression<T> =>
  pipe(new TAST.Reference(path, []), Result.succeed, fromNode<T>);

/** A constructor at `path` whose applications keep `reference`, the binding the path's first segment resolves to. */
const constructorAt = <F extends Type.TypeConstructor>(
  path: JExpr.Path.Path,
  arity: F["arity"],
  reference?: Referential.ReferenceId,
): Constructor<F> => {
  const instantiate = <const A extends readonly Type.Any[]>(
    ...args: Constructor.Arguments<A> & { readonly length: F["arity"] }
  ): TypeExpression<Type.TypeLambda.Apply<F, A>> => {
    if (args.length !== arity) {
      return pipe(
        ProgramError.Construction.typeArgumentCount(arity, args.length),
        Result.fail,
        fromResult<Type.TypeLambda.Apply<F, A>>,
      );
    }

    // SAFETY: `Arguments<A>` maps every position to a type expression. `Array.map` cannot read that through the generic `A` and types the elements as `unknown`.
    const handles = args as readonly TypeExpression.Any[];

    return pipe(
      handles,
      Array.map((handle) => handle[TAST.Node]),
      Result.all,
      Result.flatMap((arguments_) => TAST.apply(path, arguments_, reference)),
      fromNode<Type.TypeLambda.Apply<F, A>>,
    );
  };

  return Object.assign(instantiate, {
    [ConstructorId]: { path, arity },
    [Relocate]: (next: JExpr.Path.Path, bound?: Bound) =>
      Result.succeed(constructorAt<F>(next, arity, head(next, "type", bound))),
  });
};

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

  return Result.succeed(constructorAt<F>(path, arity));
};

/**
 * Refers to the same semantic type through another HashQL path.
 *
 * Use this when an import or type alias gives an existing type another name in the program. The returned {@link TypeExpression} emits that name while keeping its semantic descriptor. Relocation does not declare the alias or check that the new path denotes the same type. The caller must establish that relationship.
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

/**
 * A constructor adapted by {@link adaptConstructor}, callable with the callback's call signatures.
 *
 * It keeps the constructor's marker. Relocating it runs the callback again at the new path.
 */
export type Adapted<C> = C &
  Constructor.Any & {
    readonly [Relocate]: Relocatable<Adapted<C>>[typeof Relocate];
  };

/**
 * Adds a calling convention to a generic type constructor that survives relocation.
 *
 * Use this to fix some type arguments or accept shorthand before calling a {@link Constructor}. For example, a string-keyed pair helper can accept only the value type. An ordinary wrapper closes over the original constructor and has no relocation operation. This adapter keeps the helper callable through {@link relocate}, so an imported alias can use the same convenience API.
 *
 * The `adapt` callback runs immediately and again after each successful relocation. Each run receives the constructor at its current path. Build the callable from that argument rather than capturing the original constructor. A callable that captures the original keeps emitting the old path. The result is a new function with the callback's call signatures. The callback may therefore return an existing callable, including its argument. {@link isConstructor} recognizes the result. It accepts the constructor first or last.
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
    const relocatable: Relocatable<S> = self;
    const build = (source: S): Adapted<C> => {
      // The markers go on a fresh function, because `adapt` may return an object that other code holds, such as `source` itself. Assigning to that object would make its relocation call itself.
      const adapted = adapt(source);
      // SAFETY: the forwarder passes its arguments to `adapted` and returns its result, so it has `C`'s call signatures.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- TypeScript cannot give a forwarding function the call signatures of a generic `C`
      const callable = ((...args: never[]) => adapted(...args)) as C;

      return Object.assign(callable, {
        [ConstructorId]: source[ConstructorId],
        [Relocate]: (
          path: JExpr.Path.Path,
          bound?: Bound,
        ): Result.Result<Adapted<C>, ProgramError.Construction> =>
          pipe(relocatable[Relocate](path, bound), Result.map(build)),
      });
    };

    return build(self);
  },
);
