/**
 * HashQL syntax construction, semantic type descriptors and J-Expr encoding.
 *
 * {@link Program.Expression} builds typed HashQL expressions from program inputs, literals, projections and calls. An expression's type records the program inputs it requires. {@link Program.Expression.toJExpr} returns the expression's J-Expr syntax or the construction failure it stored. {@link Program.program} wraps a root expression as a program. {@link Program.compile} serializes the program to J-Expr JSON text.
 *
 * {@link JExpr} builds and checks syntax trees, then encodes them as J-Expr JSON. {@link Program.TypeExpression} annotates type syntax with trusted semantic descriptors from {@link Type}, retaining construction failures from {@link Program.ProgramError}. The HashQL compiler owns name resolution and type checking. This package constructs programs without executing them.
 *
 * @module
 */
export * as JExpr from "./JExpr/index.js";
export * as Program from "./Program/index.js";
export type * as Type from "./Type.js";
