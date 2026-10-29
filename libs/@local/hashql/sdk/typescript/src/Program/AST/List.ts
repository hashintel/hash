import { Pipeable } from "effect";

import * as Referential from "../../internal/referential.js";
import * as JExpr from "../../JExpr/index.js";

import type { TypeNode } from "../TAST/TypeNode.js";
import type { Node } from "./Node.js";

/** A list literal, with the type that annotates it when there is one. */
export class List
  extends Pipeable.Class
  implements
    Node.Of<
      "List",
      JExpr.List.List,
      readonly [] | readonly [TypeNode.Any],
      readonly Node.Any[]
    >
{
  readonly _tag = "List" as const;

  /** The annotation on the list, such as `::kernel::type::List<Integer>`. */
  readonly types: readonly [] | readonly [TypeNode.Any];
  readonly members: readonly Node.Any[];
  readonly [Referential.References]: readonly Referential.ReferenceId[] = [];

  constructor(members: readonly Node.Any[], type?: TypeNode.Any) {
    super();

    this.types = type === undefined ? [] : [type];
    this.members = members;
  }

  get children(): readonly Node.Any[] {
    return this.members;
  }

  // oxlint-disable-next-line eslint/class-methods-use-this -- `Node.Of` requires the method, and a list needs only its annotation's and members' syntax
  toExpr(
    [type]: readonly [JExpr.Type.Type?],
    members: readonly JExpr.Expression[],
  ): JExpr.List.List {
    const expr = JExpr.list(...members);
    if (type === undefined) {
      return expr;
    }

    return JExpr.typed(expr, type);
  }
}
