import { Pipeable } from "effect";

import * as Referential from "../../internal/referential.js";
import * as JExpr from "../../JExpr/index.js";

import type { Node } from "./Node.js";

export class Tuple
  extends Pipeable.Class
  implements Node.Of<"Tuple", JExpr.Tuple.Tuple, readonly Node.Any[]>
{
  readonly _tag = "Tuple" as const;
  readonly members: readonly Node.Any[];
  readonly [Referential.References]: readonly Referential.ReferenceId[];

  constructor(members: readonly Node.Any[]) {
    super();

    this.members = members;
    this[Referential.References] = [];
  }

  get children(): readonly Node.Any[] {
    return this.members;
  }

  // oxlint-disable-next-line eslint/class-methods-use-this -- `Node.Of` requires the method, and a tuple needs only its children's syntax
  toExpr(members: readonly JExpr.Expression[]): JExpr.Tuple.Tuple {
    return JExpr.tuple(...members);
  }
}
