/**
 * HashQL programs and the builders that construct them.
 *
 * {@link program} wraps a root expression as a program. {@link compile} serializes a program to J-Expr JSON text. {@link Expression} builds the typed expressions. {@link TypeExpression} annotates type syntax with semantic descriptors. A builder that fails stores a {@link ProgramError.Construction} in its expression instead of throwing. {@link Inputs} extracts the input requirements a program's caller must supply.
 *
 * @module
 */
import { Result, pipe } from "effect";

import { compileResult } from "../JExpr/compile.js";
import * as Expression from "./Expression.js";
import * as ProgramError from "./ProgramError.js";

import type * as Type from "../Type.js";

/**
 * A root {@link Expression.Expression} carrying its result descriptor and input requirements.
 *
 * The wrapper does not establish that the expression constructed successfully or that the HashQL compiler accepts it. {@link compile} extracts the syntax and returns any {@link ProgramError.Construction} the expression stored. Query execution is separate.
 */
export interface Program<T extends Type.Any, Requirements> {
  /** The expression whose syntax becomes the program, including its retained construction result. */
  readonly root: Expression.Expression<T, Requirements>;
}

/**
 * Extracts input requirements from a program's root, including optional requirements supplied by defaults.
 *
 * A union of programs requires every input that any member requires, as {@link Expression.Inputs} does for a union of expressions.
 */
export type Inputs<P> = [P] extends [{ readonly root: infer Root }]
  ? Expression.Inputs<Root>
  : never;

/**
 * Wraps a root expression without validating or evaluating it.
 *
 * The constructor freezes the wrapper. It keeps the original handle as {@link Program.root}. See {@link compile} for serialization and failure handling.
 */
export const program = <T extends Type.Any, Inputs>(
  root: Expression.Expression<T, Inputs>,
): Program<T, Inputs> => Object.freeze({ root });

/**
 * Serializes a program to J-Expr JSON text, or returns the {@link ProgramError.Construction} its root stored.
 *
 * This is syntax serialization, not HashQL compiler execution. It does not resolve names, check the program against a graph schema or execute a query. The text is what `JExpr.compile` writes, keeping each numeric literal's source spelling.
 *
 * The builders validate syntax as they store it, so `compile` does not decode the tree again. It checks each numeric literal's spelling as it writes, because {@link Expression.fromNode} and {@link Expression.fromResult} take a tree on trust. Literal text that `JExpr.make` would reject, such as `NaN`, and an object with no constructor key return the `InvalidExpression` reason.
 *
 * @example <caption>Serialize an expression for a HashQL consumer.</caption>
 * ```ts
 * import assert from "node:assert/strict";
 * import { Program } from "@local/hashql";
 * import { Result } from "effect";
 *
 * const greeting = Program.program(Program.Expression.literal("hello"));
 * assert.equal(Result.getOrThrow(Program.compile(greeting)), '{"#literal":"hello"}');
 * ```
 */
export const compile = <T extends Type.Any, Inputs>(
  self: Program<T, Inputs>,
): Result.Result<string, ProgramError.Construction> =>
  pipe(
    self.root,
    Expression.toJExpr,
    Result.flatMap((expression) =>
      Result.mapError(compileResult(expression), (cause) =>
        ProgramError.Construction.make({
          reason: ProgramError.Reason.make({
            _tag: "InvalidExpression",
            cause,
          }),
        }),
      ),
    ),
  );

export * as Expression from "./Expression.js";
export type * as Inputs from "./Inputs.js";
export * as ProgramError from "./ProgramError.js";
export * as TypeExpression from "./TypeExpression.js";
