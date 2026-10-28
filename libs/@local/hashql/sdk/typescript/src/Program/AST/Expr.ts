import { Pipeable } from "effect";

import type * as JExpr from "../../JExpr/index.js";
import type { Node } from "./Node.js";

export class Expr extends Pipeable.Class implements Node.Of<readonly []> {
  readonly expression: JExpr.Expression;
  readonly children: readonly [] = [];

  constructor(expression: JExpr.Expression) {
    super();

    this.expression = expression;
  }

  toExpr(): JExpr.Expression {
    return this.expression;
  }
}
