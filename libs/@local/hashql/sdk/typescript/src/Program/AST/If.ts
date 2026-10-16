import * as JExpr from "../../JExpr/index.js";

import type { Node } from "./Node.js";

export class If<Then extends Node, Else extends Node> implements Node {
  readonly condition: Node;
  readonly consequent: Then;
  readonly alternate: Else;

  constructor(condition: Node, consequent: Then, alternate: Else) {
    this.condition = condition;
    this.consequent = consequent;
    this.alternate = alternate;
  }

  compile(): JExpr.Expression {
    return JExpr.if(
      this.condition.compile(),
      this.consequent.compile(),
      this.alternate.compile(),
    );
  }
}
