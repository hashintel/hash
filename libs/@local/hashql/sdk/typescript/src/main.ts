/**
 * Typed HashQL syntax construction and J-Expr encoding.
 *
 * Use `@local/hashql/draft` to author a program synchronously against an explicit input schema. {@link Expression} also provides direct construction, and {@link Program} wraps a root expression for serialization.
 *
 * {@link Type} describes semantic types at compile time. {@link TypeExpression} carries their syntax at runtime. {@link Module} declares trusted external names, and {@link JExpr} provides the lower-level syntax model. The SDK builds programs but does not execute them. Its type declarations require TypeScript 7.
 *
 * @module
 */
export * as JExpr from "./JExpr/index.js";
export * as Expression from "./Program/Expression.js";
export * as Module from "./Program/Module.js";
export * as Operators from "./Program/Operators.js";
export * as Prelude from "./Program/Prelude.js";
export * as Structural from "./Program/Structural.js";
export * as Program from "./Program/index.js";
export * as ProgramError from "./Program/ProgramError.js";
export { program } from "./Program/index.js";
export { ifElse as If, assume } from "./Program/Expression.js";
export * as TypeExpression from "./Program/TypeExpression.js";
export type * as Type from "./Type/index.js";
export type * as Inputs from "./Program/Inputs.js";
