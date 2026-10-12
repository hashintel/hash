import type * as JExpr from "../../jexpr/index.js";

export interface Node {
  readonly compile: () => JExpr.Expression;
}
