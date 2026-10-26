/**
 * Programs and their J-Expr serialization.
 *
 * @module
 */
import { Result, pipe } from "effect";

import * as JExpr from "../JExpr/index.js";
import * as Expression from "./Expression.js";

import type * as Type from "../Type.js";
import type * as ProgramError from "./ProgramError.js";

/**
 * A root expression carrying its result descriptor and input requirements.
 *
 * The wrapper does not establish that the expression constructed successfully or that the HashQL compiler accepts it. {@link compile} extracts syntax and returns any construction failure. Query execution is separate.
 */
export interface Program<T extends Type.Any, Requirements> {
  /** The expression whose syntax becomes the program, including its retained construction result. */
  readonly root: Expression.Expression<T, Requirements>;
}

/** Extracts input requirements from a program's root, including optional requirements supplied by defaults. */
export type Inputs<P> = P extends { readonly root: infer Root }
  ? Expression.Inputs<Root>
  : never;

/**
 * Wraps a root expression without validating or evaluating it.
 *
 * The constructor freezes the wrapper and retains the original handle. Its inferred result descriptor and inputs remain available through the {@link Program} type. See {@link compile} for serialization and failure handling.
 */
export const program = <T extends Type.Any, Inputs>(
  root: Expression.Expression<T, Inputs>,
): Program<T, Inputs> => Object.freeze({ root });

/**
 * Serializes a program to J-Expr JSON text, or returns its retained construction failure.
 *
 * This is syntax serialization, not HashQL compiler execution. It does not resolve names, check the program against a graph schema or execute a query. The J-Expr serializer preserves numeric literal source text.
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
  pipe(self.root, Expression.toJExpr, Result.map(JExpr.compile));

export * as Expression from "./Expression.js";
export type * as Inputs from "./Inputs.js";
export * as ProgramError from "./ProgramError.js";
export * as TypeExpression from "./TypeExpression.js";
