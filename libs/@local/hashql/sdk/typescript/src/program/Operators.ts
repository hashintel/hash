/**
 * Explicit predicate construction with fluent and data-last composition.
 *
 * Ordinary expressions have no operator methods. These constructors return Boolean expressions with chaining methods. Binding one through let produces an ordinary expression again. Both composition forms emit HashQL calls, not host predicates, and preserve every operand's input requirements.
 *
 * @module
 */
import { Array, Function, Result, pipe } from "effect";

import { Relocate } from "../internal/relocation.js";
import * as JExpr from "../jexpr/index.js";
import * as AST from "./ast/index.js";
import * as Expression from "./Expression.js";

import type * as Type from "../type/index.js";
import type { Normalize } from "./ExpressionType.js";
import type * as Inputs from "./Inputs.js";
import type * as ProgramError from "./ProgramError.js";

type BooleanValue = Expression.Value<Type.PrimitiveBoolean>;
type Requirements<L, R> = Inputs.Merge<
  Expression.Inputs<L>,
  Expression.Inputs<R>
>;

export interface Predicate<I> extends Expression.Expression<
  Type.PrimitiveBoolean,
  I
> {
  readonly and: <const R extends BooleanValue>(
    other: R,
  ) => Predicate<Inputs.Merge<I, Expression.Inputs<R>>>;
  readonly or: <const R extends BooleanValue>(
    other: R,
  ) => Predicate<Inputs.Merge<I, Expression.Inputs<R>>>;
  readonly not: () => Predicate<I>;
  readonly [Relocate]: (
    path: JExpr.Path.Path,
  ) => Result.Result<Predicate<I>, ProgramError.Construction>;
}

const call = <I>(
  path: string,
  operands: readonly Expression.AnyValue[],
): Predicate<I> =>
  // oxlint-disable-next-line eslint/no-use-before-define -- syntax construction and predicate decoration are mutually recursive
  predicate<I>(
    pipe(
      operands,
      Array.map(Expression.toJExpr),
      Result.all,
      Result.map((arguments_) => new AST.Expr(JExpr.call(path, ...arguments_))),
    ),
  );

/** Copies metadata from a freshly constructed handle, whose marker properties are own and enumerable. */
const predicate = <I>(
  node: Result.Result<AST.Node, ProgramError.Construction>,
): Predicate<I> => {
  const expression = Expression.fromResult<Type.PrimitiveBoolean, I>(node);
  return {
    ...expression,
    and: <const R extends BooleanValue>(
      other: R,
    ): Predicate<Inputs.Merge<I, Expression.Inputs<R>>> =>
      call("::core::bool::and", [expression, other]),
    or: <const R extends BooleanValue>(
      other: R,
    ): Predicate<Inputs.Merge<I, Expression.Inputs<R>>> =>
      call("::core::bool::or", [expression, other]),
    not: (): Predicate<I> => call("::core::bool::not", [expression]),
    [Relocate]: (path) =>
      pipe(
        expression[Relocate](path),
        Result.map((moved) => predicate<I>(Expression.toNode(moved))),
      ),
  };
};

interface Comparison {
  <const R extends Expression.AnyValue>(
    right: R,
  ): <const L extends Expression.Value<Normalize<Expression.TypeOf<R>>>>(
    left: L,
  ) => Predicate<Requirements<L, R>>;
  <
    const L extends Expression.AnyValue,
    const R extends Expression.Value<Normalize<Expression.TypeOf<L>>>,
  >(
    left: L,
    right: R,
  ): Predicate<Requirements<L, R>>;
}

const comparison = (path: string): Comparison =>
  Function.dual(
    2,
    <
      const L extends Expression.AnyValue,
      const R extends Expression.Value<Normalize<Expression.TypeOf<L>>>,
    >(
      left: L,
      right: R,
    ): Predicate<Requirements<L, R>> => call(path, [left, right]),
  );

/** Compares operands with the same semantic descriptor. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- the curried form fixes the right descriptor and checks the left; both argument orders have exact-type tests
export const eq: Comparison = comparison("::core::cmp::eq");
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- the curried form fixes the right descriptor and checks the left; both argument orders have exact-type tests
export const ne: Comparison = comparison("::core::cmp::ne");

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

export const and: BooleanCombination = combination("::core::bool::and");
export const or: BooleanCombination = combination("::core::bool::or");
export const not = <const E extends BooleanValue>(
  expression: E,
): Predicate<Expression.Inputs<E>> => call("::core::bool::not", [expression]);
export const isTrue = <const E extends BooleanValue>(
  expression: E,
): Predicate<Expression.Inputs<E>> =>
  call("::core::cmp::eq", [expression, true]);
export const isFalse = <const E extends BooleanValue>(
  expression: E,
): Predicate<Expression.Inputs<E>> =>
  call("::core::cmp::eq", [expression, false]);

type Optional<E extends Expression.AnyValue> =
  Normalize<Expression.TypeOf<E>> extends Type.Union<infer M>
    ? Extract<
        M[number],
        Type.Opaque<"::core::option::None", Type.Any>
      > extends never
      ? never
      : E
    : never;

export const isNone = <const E extends Expression.AnyValue>(
  expression: E & Optional<E>,
): Predicate<Expression.Inputs<E>> =>
  pipe(
    Expression.toJExpr(expression),
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
    predicate<Expression.Inputs<E>>,
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

export const operations: Operations = {
  eq,
  ne,
  and,
  or,
  not,
  isTrue,
  isFalse,
  isNone,
};
