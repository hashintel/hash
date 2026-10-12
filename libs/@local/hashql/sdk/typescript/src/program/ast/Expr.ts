import type * as JExpr from "../../jexpr/index.js";
import type { Node } from "./Node.js";

export class Expr implements Node {
  readonly expression: JExpr.Expression;

  constructor(expression: JExpr.Expression) {
    this.expression = expression;
  }

  compile(): JExpr.Expression {
    return this.expression;
  }
}
