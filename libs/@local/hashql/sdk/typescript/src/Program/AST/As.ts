import { Pipeable } from "effect";

import * as Referential from "../../internal/referential.js";
import * as JExpr from "../../JExpr/index.js";

import type { TypeNode } from "../TAST/TypeNode.js";
import type { Node } from "./Node.js";

export class As
  extends Pipeable.Class
  implements
    Node.Of<
      "As",
      JExpr.Call.Call,
      readonly [TypeNode.Any],
      readonly [Node.Any]
    >
{
  readonly _tag = "As" as const;
  readonly value: Node.Any;
  readonly type: TypeNode.Any;

  readonly [Referential.References]: readonly Referential.ReferenceId[] = [];

  constructor(value: Node.Any, type: TypeNode.Any) {
    super();

    this.value = value;
    this.type = type;
  }

  get children(): readonly [Node.Any] {
    return [this.value];
  }

  get types(): readonly [TypeNode.Any] {
    return [this.type];
  }

  // oxlint-disable-next-line eslint/class-methods-use-this -- `Node.Of` requires the method, and a call needs only its children's syntax
  toExpr(
    [type]: readonly [JExpr.Type.Type],
    [value]: readonly [JExpr.Expression],
  ): JExpr.Call.Call {
    return JExpr.as(value, type);
  }
}
