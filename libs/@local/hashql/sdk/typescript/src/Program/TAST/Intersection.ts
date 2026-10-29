import { Pipeable } from "effect";

import * as Referential from "../../internal/referential.js";
import * as JExpr from "../../JExpr/index.js";

import type { TypeNode } from "./TypeNode.js";

/** An intersection of one or more types. */
export class Intersection
  extends Pipeable.Class
  implements
    TypeNode.Of<
      JExpr.Type.Intersection.Intersection,
      readonly [TypeNode.Any, ...TypeNode.Any[]]
    >
{
  readonly _tag = "Intersection" as const;
  readonly children: readonly [TypeNode.Any, ...TypeNode.Any[]];
  readonly [Referential.References]: readonly Referential.ReferenceId[] = [];

  constructor(members: readonly [TypeNode.Any, ...TypeNode.Any[]]) {
    super();

    this.children = members;
  }

  // oxlint-disable-next-line eslint/class-methods-use-this -- `TypeNode.Of` requires the method, and an intersection needs only its members' syntax
  toType(
    members: readonly [JExpr.Type.Type, ...JExpr.Type.Type[]],
  ): JExpr.Type.Intersection.Intersection {
    return JExpr.Type.intersection(...members);
  }
}
