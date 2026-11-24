import { Pipeable } from "effect";

import * as Referential from "../../internal/referential.js";
import * as JExpr from "../../JExpr/index.js";

import type { TypeNode } from "./TypeNode.js";

/** A union of one or more types. */
export class Union
  extends Pipeable.Class
  implements
    TypeNode.Of<
      JExpr.Type.Union.Union,
      readonly [TypeNode.Any, ...TypeNode.Any[]]
    >
{
  readonly _tag = "Union" as const;
  readonly children: readonly [TypeNode.Any, ...TypeNode.Any[]];
  readonly [Referential.References]: readonly Referential.ReferenceId[] = [];

  constructor(members: readonly [TypeNode.Any, ...TypeNode.Any[]]) {
    super();

    this.children = members;
  }

  // oxlint-disable-next-line eslint/class-methods-use-this -- `TypeNode.Of` requires the method, and a union needs only its members' syntax
  toType(
    members: readonly [JExpr.Type.Type, ...JExpr.Type.Type[]],
  ): JExpr.Type.Union.Union {
    return JExpr.Type.union(...members);
  }
}
