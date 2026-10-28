import { Pipeable } from "effect";

import * as JExpr from "../../JExpr/index.js";

import type { Node } from "./Node.js";

export class If<Then extends Node, Else extends Node | undefined>
  extends Pipeable.Class
  implements Node.Of<If.Children<Then, Else>>
{
  readonly condition: Node;
  readonly consequent: Then;
  /** Without an alternate, HashQL wraps the consequent in `Some` and produces `None` when the condition is false. */
  readonly alternate: Else;

  constructor(condition: Node, consequent: Then, alternate: Else) {
    super();

    this.condition = condition;
    this.consequent = consequent;
    this.alternate = alternate;
  }

  get children(): If.Children<Then, Else> {
    if (this.alternate === undefined) {
      return [this.condition, this.consequent];
    }

    return [this.condition, this.consequent, this.alternate];
  }

  // oxlint-disable-next-line eslint/class-methods-use-this -- `Node.Of` requires the method, and a conditional needs only its children's syntax
  toExpr([condition, consequent, alternate]: readonly [
    JExpr.Expression,
    JExpr.Expression,
    JExpr.Expression?,
  ]): JExpr.Expression {
    return JExpr.if(condition, consequent, alternate);
  }
}

export declare namespace If {
  /** The condition and the consequent, followed by the alternate when there is one. */
  export type Children<Then extends Node, Else extends Node | undefined> =
    | readonly [Node, Then]
    | readonly [Node, Then, NonNullable<Else>];
}
