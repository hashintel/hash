/**
 * Explicit predicate construction with fluent and data-last composition.
 *
 * Ordinary expressions have no operator methods. These constructors return Boolean expressions with chaining methods. Binding one through let produces an ordinary expression again. Both composition forms emit HashQL calls, not host predicates, and preserve every operand's input requirements.
 *
 * @module
 */
import { Array, Function, Pipeable, Result, flow, pipe } from "effect";

import * as Relocation from "../internal/relocation.js";
import * as JExpr from "../JExpr/index.js";
import * as AST from "./AST/index.js";
import * as Expression from "./Expression.js";

import type * as Type from "../Type.js";
import type * as ExpressionType from "./ExpressionType.js";
import type * as Inputs from "./Inputs.js";
import type * as ProgramError from "./ProgramError.js";

type BooleanValue = Expression.Value<Type.PrimitiveBoolean>;
type Requirements<L, R> = Inputs.Merge<
  Expression.Value.Inputs<L>,
  Expression.Value.Inputs<R>
>;

/**
 * A Boolean expression with fluent logical composition and a retained input record.
 *
 * Chaining constructs syntax rather than testing a host condition. Binding the result with a declaration gives an ordinary Boolean expression. Use the standalone operators to continue composing that binding. See {@link eq} for both fluent and pipe-based forms.
 */
export interface Predicate<I> extends Expression.Expression<
  Type.PrimitiveBoolean,
  I
> {
  /** Combines this predicate with another Boolean operand, retaining both sets of inputs. */
  readonly and: <const R extends BooleanValue>(
    other: R,
  ) => Predicate<Inputs.Merge<I, Expression.Value.Inputs<R>>>;
  /** Constructs a disjunction without short-circuiting host-side operand construction. */
  readonly or: <const R extends BooleanValue>(
    other: R,
  ) => Predicate<Inputs.Merge<I, Expression.Value.Inputs<R>>>;
  /** Negates the represented predicate without changing its input requirements. */
  readonly not: () => Predicate<I>;
  /** Compares this predicate with `true` through `::core::cmp::eq`. */
  readonly isTrue: () => Predicate<I>;
  /** Compares this predicate with `false` through `::core::cmp::eq`. */
  readonly isFalse: () => Predicate<I>;

  readonly [Relocation.Relocate]: (
    path: JExpr.Path.Path,
  ) => Result.Result<Predicate<I>, ProgramError.Construction>;
}

const call = <I>(
  path: string,
  operands: readonly Expression.Value.Any[],
): Predicate<I> =>
  pipe(
    operands,
    Array.map(Expression.toJExpr),
    Result.all,
    Result.map((arguments_) => new AST.Expr(JExpr.call(path, ...arguments_))),
    // oxlint-disable-next-line eslint/no-use-before-define -- syntax construction and predicate decoration are mutually recursive
    predicate<I>,
  );

/** Copies own handle metadata and explicitly forwards proxy-provided expression operations. */
const predicate = <I>(
  node: Result.Result<AST.Node, ProgramError.Construction>,
): Predicate<I> => {
  const expression = Expression.fromResult<Type.PrimitiveBoolean, I>(node);

  return {
    ...expression,
    ...Pipeable.Prototype,
    $projectUnsafe: expression.$projectUnsafe,
    $indexUnsafe: expression.$indexUnsafe,
    and: <const R extends BooleanValue>(
      other: R,
    ): Predicate<Inputs.Merge<I, Expression.Value.Inputs<R>>> =>
      call("::core::bool::and", [expression, other]),
    or: <const R extends BooleanValue>(
      other: R,
    ): Predicate<Inputs.Merge<I, Expression.Value.Inputs<R>>> =>
      call("::core::bool::or", [expression, other]),
    not: (): Predicate<I> => call("::core::bool::not", [expression]),
    isTrue: (): Predicate<I> => call("::core::cmp::eq", [expression, true]),
    isFalse: (): Predicate<I> => call("::core::cmp::eq", [expression, false]),
    [Relocation.Relocate]: flow(
      expression[Relocation.Relocate],
      Result.map(flow(Expression.toNode, predicate<I>)),
    ),
  };
};

/** Direct and data-last comparison forms, checking the second supplied operand against the first operand's semantic descriptor. */
interface Comparison {
  <const R extends Expression.Value.Any>(
    right: R,
  ): <
    const L extends Expression.Value<
      ExpressionType.Normalize<Expression.Value.Type<R>>
    >,
  >(
    left: L,
  ) => Predicate<Requirements<L, R>>;
  <
    const L extends Expression.Value.Any,
    const R extends Expression.Value<
      ExpressionType.Normalize<Expression.Value.Type<L>>
    >,
  >(
    left: L,
    right: R,
  ): Predicate<Requirements<L, R>>;
}

const comparison = (path: string): Comparison =>
  Function.dual(
    2,
    <
      const L extends Expression.Value.Any,
      const R extends Expression.Value<
        ExpressionType.Normalize<Expression.Value.Type<L>>
      >,
    >(
      left: L,
      right: R,
    ): Predicate<Requirements<L, R>> => call(path, [left, right]),
  );

/**
 * Constructs equality between operands with matching semantic descriptors.
 *
 * `eq(left, right)` checks the right descriptor against the left. `eq(right)(left)` fixes the right descriptor first. Host primitives use their SDK descriptors: use bigint with an Integer expression and number with a Number expression. The operands' descriptors must be identical, with no subtyping. To compare a nullable index result with `null`, give `null` the same union descriptor through {@link Expression.assume}. The result retains both operands' inputs and construction failures.
 *
 * @example <caption>Compose the same predicate with chaining or a pipe.</caption>
 * ```ts
 * import assert from "node:assert/strict";
 * import { Program } from "@local/hashql";
 * import { Result, pipe } from "effect";
 *
 * const { Expression, Operators, Structural } = Program;
 * const count = Structural.input("count", BigInt);
 * const chained = Operators.eq(count, 1n).and(true).not();
 * const piped = pipe(count, Operators.eq(1n), Operators.and(true), Operators.not);
 * assert.deepEqual(
 *   Result.getOrThrow(Expression.toJExpr(chained)),
 *   Result.getOrThrow(Expression.toJExpr(piped)),
 * );
 * ```
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- the curried form fixes the right descriptor and checks the left; both argument orders have exact-type tests
export const eq: Comparison = comparison("::core::cmp::eq");

/** Constructs inequality with the same operand constraints and composition forms as {@link eq}. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- the curried form fixes the right descriptor and checks the left; both argument orders have exact-type tests
export const ne: Comparison = comparison("::core::cmp::ne");

/** Direct and data-last forms that combine two Boolean operands and their input requirements. */
interface BooleanCombination {
  <const R extends BooleanValue>(
    right: R,
  ): <const L extends BooleanValue>(left: L) => Predicate<Requirements<L, R>>;
  <const L extends BooleanValue, const R extends BooleanValue>(
    left: L,
    right: R,
  ): Predicate<Requirements<L, R>>;
}

const combination = (path: string): BooleanCombination =>
  Function.dual(
    2,
    <const L extends BooleanValue, const R extends BooleanValue>(
      left: L,
      right: R,
    ): Predicate<Requirements<L, R>> => call(path, [left, right]),
  );

/** Constructs a Boolean conjunction, directly or as `and(right)(left)`, without short-circuiting host construction. */
export const and: BooleanCombination = combination("::core::bool::and");

/** Constructs a Boolean disjunction, directly or as `or(right)(left)`, without short-circuiting host construction. */
export const or: BooleanCombination = combination("::core::bool::or");

/** Constructs Boolean negation while retaining the operand's inputs and construction failures. */
export const not = <const E extends BooleanValue>(
  expression: E,
): Predicate<Expression.Value.Inputs<E>> =>
  call("::core::bool::not", [expression]);

/** Constructs an equality comparison with true, returning a chainable {@link Predicate}. */
export const isTrue = <const E extends BooleanValue>(
  expression: E,
): Predicate<Expression.Value.Inputs<E>> =>
  call("::core::cmp::eq", [expression, true]);

/** Constructs an equality comparison with false, returning a chainable {@link Predicate}. */
export const isFalse = <const E extends BooleanValue>(
  expression: E,
): Predicate<Expression.Value.Inputs<E>> =>
  call("::core::cmp::eq", [expression, false]);

type Optional<E extends Expression.Value.Any> =
  ExpressionType.Normalize<Expression.Value.Type<E>> extends Type.Union<infer M>
    ? Extract<
        M[number],
        Type.Opaque<"::core::option::None", Type.Any>
      > extends never
      ? never
      : E
    : never;

/**
 * Compares an optional value with the HashQL `::core::option::None` constructor.
 *
 * The operand's normalized descriptor must be a union with a {@link Type.Opaque} member whose name is the string `"::core::option::None"`. The check compares that name, so it rejects a None declared under a symbol identity or any other name. Null is a different value and does not satisfy this constraint. The resulting equality expression retains the operand's TypeScript descriptor without narrowing it.
 */
export const isNone = <const E extends Expression.Value.Any>(
  expression: E & Optional<E>,
): Predicate<Expression.Value.Inputs<E>> =>
  pipe(
    expression,
    Expression.toJExpr,
    Result.map(
      (value) =>
        new AST.Expr(
          JExpr.call(
            "::core::cmp::eq",
            value,
            JExpr.call("::core::option::None"),
          ),
        ),
    ),
    predicate<Expression.Value.Inputs<E>>,
  );

/** The same constructors are available on authoring contexts and as standalone functions. */
export interface Operations {
  readonly eq: typeof eq;
  readonly ne: typeof ne;
  readonly and: typeof and;
  readonly or: typeof or;
  readonly not: typeof not;
  readonly isTrue: typeof isTrue;
  readonly isFalse: typeof isFalse;
  readonly isNone: typeof isNone;
}
