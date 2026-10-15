import type * as JExpr from "../../jexpr/index.js";

/** A builder node that emits J-Expr syntax during expression serialization. */
export interface Node {
  /** Returns syntax without executing the represented HashQL expression. */
  readonly compile: () => JExpr.Expression;
}
