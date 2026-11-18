import { Pipeable } from "effect";

import * as Referential from "../../internal/referential.js";
import * as JExpr from "../../JExpr/index.js";

import type { TypeNode } from "../TAST/TypeNode.js";
import type { Node } from "./Node.js";

/** A tuple literal, with the type that annotates it when there is one. */
export class Tuple
  extends Pipeable.Class
  implements
    Node.Of<
      "Tuple",
      JExpr.Tuple.Tuple,
      readonly [] | readonly [TypeNode.Any],
      readonly Node.Any[]
    >
{
  readonly _tag = "Tuple" as const;
  readonly members: readonly Node.Any[];
  /** The annotation on the tuple, such as `(Integer, String)`, when it has one. */
  readonly types: readonly [] | readonly [TypeNode.Any];
  readonly [Referential.References]: readonly Referential.ReferenceId[] = [];

  constructor(members: readonly Node.Any[], type?: TypeNode.Any) {
    super();

    this.members = members;
    this.types = type === undefined ? [] : [type];
  }

  get children(): readonly Node.Any[] {
    return this.members;
  }

  // oxlint-disable-next-line eslint/class-methods-use-this -- `Node.Of` requires the method, and a tuple needs only its annotation's and members' syntax
  toExpr(
    [type]: readonly [JExpr.Type.Type?],
    members: readonly JExpr.Expression[],
  ): JExpr.Tuple.Tuple {
    const expr = JExpr.tuple(...members);
    if (type === undefined) {
      return expr;
    }

    return JExpr.typed(expr, type);
  }
}
