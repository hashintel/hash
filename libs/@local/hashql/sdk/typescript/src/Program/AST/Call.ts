import { Pipeable } from "effect";

import * as Referential from "../../internal/referential.js";
import * as JExpr from "../../JExpr/index.js";

import type { Node } from "./Node.js";

/** A call of a callee with positional arguments. */
export class Call
  extends Pipeable.Class
  implements
    Node.Of<
      "Call",
      JExpr.Call.Call,
      readonly [],
      readonly [Node.Any, ...Node.Any[]]
    >
{
  readonly _tag = "Call" as const;
  readonly callee: Node.Any;
  readonly arguments: readonly Node.Any[];
  readonly types: readonly [] = [];
  readonly [Referential.References]: readonly Referential.ReferenceId[] = [];

  constructor(callee: Node.Any, arguments_: readonly Node.Any[]) {
    super();

    this.callee = callee;
    this.arguments = arguments_;
  }

  get children(): readonly [Node.Any, ...Node.Any[]] {
    return [this.callee, ...this.arguments];
  }

  // oxlint-disable-next-line eslint/class-methods-use-this -- `Node.Of` requires the method, and a call needs only its children's syntax
  toExpr(
    _types: readonly [],
    [callee, ...args]: readonly [JExpr.Expression, ...JExpr.Expression[]],
  ): JExpr.Call.Call {
    return JExpr.call(callee, ...args);
  }
}
