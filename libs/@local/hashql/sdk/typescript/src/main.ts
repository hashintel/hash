/**
 * Typed HashQL syntax construction and J-Expr encoding.
 *
 * Use `@local/hashql/draft` for synchronous authoring with an explicit input schema, or `@local/hashql/do` for ordered declaration steps and inferred input requirements. Both produce typed expressions. {@link Expression} also provides direct construction, and {@link Program} wraps a root expression for serialization.
 *
 * {@link Type} describes semantic types at compile time. {@link TypeExpression} carries their syntax at runtime. {@link Module} declares trusted external names, and {@link JExpr} provides the lower-level syntax model. The SDK builds programs but does not execute them. Its type declarations require TypeScript 7.
 *
 * @module
 */
export * as JExpr from "./jexpr/index.js";
export * as Expression from "./program/Expression.js";
export * as Module from "./program/Module.js";
export * as Operators from "./program/Operators.js";
export * as Prelude from "./program/Prelude.js";
export * as Structural from "./program/Structural.js";
export * as Program from "./program/index.js";
export * as ProgramError from "./program/ProgramError.js";
export { program } from "./program/index.js";
export { ifElse as If, assume } from "./program/Expression.js";
export * as TypeExpression from "./program/TypeExpression.js";
export type * as Type from "./type/index.js";
export type * as Inputs from "./program/Inputs.js";
