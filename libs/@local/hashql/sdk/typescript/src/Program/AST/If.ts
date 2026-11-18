import { Pipeable } from "effect";

import * as Referential from "../../internal/referential.js";
import * as JExpr from "../../JExpr/index.js";

import type { Node } from "./Node.js";

/** A conditional with an optional alternate, which emits the `if` special form. */
export class If<Then extends Node.Any, Else extends Node.Any | undefined>
  extends Pipeable.Class
  implements
    Node.Of<"If", JExpr.Call.Call, readonly [], If.Children<Then, Else>>
{
  readonly _tag = "If" as const;
  readonly condition: Node.Any;
  readonly consequent: Then;
  /** Without an alternate, HashQL wraps the consequent in `Some` and produces `None` when the condition is false. */
  readonly alternate: Else;
  readonly types: readonly [] = [];
  readonly [Referential.References]: readonly Referential.ReferenceId[] = [];

  constructor(condition: Node.Any, consequent: Then, alternate: Else) {
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
  toExpr(
    _types: readonly [],
    [condition, consequent, alternate]: readonly [
      JExpr.Expression,
      JExpr.Expression,
      JExpr.Expression?,
    ],
  ): JExpr.Call.Call {
    return JExpr.if(condition, consequent, alternate);
  }
}

export declare namespace If {
  /** The condition and the consequent, followed by the alternate when there is one. */
  export type Children<
    Then extends Node.Any,
    Else extends Node.Any | undefined,
  > = readonly [Node.Any, Then] | readonly [Node.Any, Then, NonNullable<Else>];
}
