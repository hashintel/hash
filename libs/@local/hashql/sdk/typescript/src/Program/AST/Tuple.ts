import { Pipeable } from "effect";

import * as JExpr from "../../JExpr/index.js";

import type { Node } from "./Node.js";

export class Tuple extends Pipeable.Class implements Node.Of<readonly Node[]> {
  readonly members: readonly Node[];

  constructor(members: readonly Node[]) {
    super();

    this.members = members;
  }

  get children(): readonly Node[] {
    return this.members;
  }

  // oxlint-disable-next-line eslint/class-methods-use-this -- `Node.Of` requires the method, and a tuple needs only its children's syntax
  toExpr(members: readonly JExpr.Expression[]): JExpr.Expression {
    return JExpr.tuple(...members);
  }
}
