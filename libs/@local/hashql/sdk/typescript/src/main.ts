/**
 * HashQL syntax construction, semantic type descriptors and J-Expr encoding.
 *
 * {@link JExpr} builds and checks syntax trees, then encodes them as J-Expr JSON. {@link Program.TypeExpression} annotates type syntax with trusted semantic descriptors from {@link Type}, retaining construction failures from {@link Program.ProgramError}. The HashQL compiler owns name resolution and type checking. This package constructs programs without executing them.
 *
 * @module
 */
export * as JExpr from "./JExpr/index.js";
export * as Program from "./Program/index.js";
export type * as Type from "./Type/index.js";
