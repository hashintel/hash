import { Pipeable } from "effect";

import * as Referential from "../../internal/referential.js";
import * as JExpr from "../../JExpr/index.js";

import type { Node } from "./Node.js";

export class Call
  extends Pipeable.Class
  implements Node.Of<"Call", readonly [Node.Any, ...Node.Any[]]>
{
  readonly _tag = "Call" as const;
  readonly callee: Node.Any;
  readonly arguments: readonly Node.Any[];
  readonly [Referential.References]: readonly Referential.ReferenceId[];

  constructor(callee: Node.Any, arguments_: readonly Node.Any[]) {
    super();

    this.callee = callee;
    this.arguments = arguments_;
    this[Referential.References] = [];
  }

  get children(): readonly [Node.Any, ...Node.Any[]] {
    return [this.callee, ...this.arguments];
  }

  // oxlint-disable-next-line eslint/class-methods-use-this -- `Node.Of` requires the method, and a call needs only its children's syntax
  toExpr([callee, ...args]: readonly [
    JExpr.Expression,
    ...JExpr.Expression[],
  ]): JExpr.Expression {
    return JExpr.call(callee, ...args);
  }
}
