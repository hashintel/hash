import type * as JExpr from "../../JExpr/index.js";
import type { Pipeable } from "effect";

/** A builder node that emits J-Expr syntax during expression serialization. */
export interface Node extends Pipeable.Pipeable {
  /** Returns syntax without executing the represented HashQL expression. */
  readonly compile: () => JExpr.Expression;
}

export const compile = (node: Node): JExpr.Expression => node.compile();
