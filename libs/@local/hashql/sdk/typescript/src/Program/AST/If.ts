import { Pipeable } from "effect";

import * as JExpr from "../../JExpr/index.js";

import type { Node } from "./Node.js";

export class If<Then extends Node, Else extends Node>
  extends Pipeable.Class
  implements Node.Of<readonly [Node, Then, Else]>
{
  readonly condition: Node;
  readonly consequent: Then;
  readonly alternate: Else;

  constructor(condition: Node, consequent: Then, alternate: Else) {
    super();

    this.condition = condition;
    this.consequent = consequent;
    this.alternate = alternate;
  }

  get children(): readonly [Node, Then, Else] {
    return [this.condition, this.consequent, this.alternate];
  }

  // oxlint-disable-next-line eslint/class-methods-use-this -- `Node.Of` requires the method, and a conditional needs only its children's syntax
  toExpr([condition, consequent, alternate]: readonly [
    JExpr.Expression,
    JExpr.Expression,
    JExpr.Expression,
  ]): JExpr.Expression {
    return JExpr.if(condition, consequent, alternate);
  }
}
