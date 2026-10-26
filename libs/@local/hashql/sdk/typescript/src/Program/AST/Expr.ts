import { Pipeable } from "effect";

import type * as JExpr from "../../JExpr/index.js";
import type { Node } from "./Node.js";

export class Expr extends Pipeable.Class implements Node {
  readonly expression: JExpr.Expression;

  constructor(expression: JExpr.Expression) {
    super();

    this.expression = expression;
  }

  compile(): JExpr.Expression {
    return this.expression;
  }
}
