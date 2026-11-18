import { Pipeable } from "effect";

import * as Referential from "../../internal/referential.js";
import * as JExpr from "../../JExpr/index.js";

import type { TypeNode } from "./TypeNode.js";

/** A tuple type. */
export class Tuple
  extends Pipeable.Class
  implements TypeNode.Of<JExpr.Type.Tuple.Tuple, readonly TypeNode.Any[]>
{
  readonly _tag = "Tuple" as const;
  readonly children: readonly TypeNode.Any[];
  readonly [Referential.References]: readonly Referential.ReferenceId[] = [];

  constructor(members: readonly TypeNode.Any[]) {
    super();

    this.children = members;
  }

  // oxlint-disable-next-line eslint/class-methods-use-this -- `TypeNode.Of` requires the method, and a tuple needs only its members' syntax
  toType(members: readonly JExpr.Type.Type[]): JExpr.Type.Tuple.Tuple {
    return JExpr.Type.tuple(...members);
  }
}
