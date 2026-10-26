/**
 * HashQL syntax construction and J-Expr encoding.
 *
 * {@link JExpr} builds and checks syntax trees, then encodes them as J-Expr JSON. The HashQL compiler owns name resolution and type checking. This package constructs programs without executing them.
 *
 * @module
 */
export * as JExpr from "./JExpr/index.js";
