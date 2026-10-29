import { Pipeable } from "effect";

import * as Referential from "../../internal/referential.js";
import * as JExpr from "../../JExpr/index.js";

import type { Node } from "./Node.js";

/** A collection lookup by an index expression, which emits the `index` special form. */
export class Subscript
  extends Pipeable.Class
  implements
    Node.Of<
      "Subscript",
      JExpr.Call.Call,
      readonly [],
      readonly [Node.Any, Node.Any]
    >
{
  readonly _tag = "Subscript" as const;
  readonly value: Node.Any;
  readonly position: Node.Any;
  readonly types: readonly [] = [];
  readonly [Referential.References]: readonly Referential.ReferenceId[] = [];

  constructor(value: Node.Any, position: Node.Any) {
    super();

    this.value = value;
    this.position = position;
  }

  get children(): readonly [Node.Any, Node.Any] {
    return [this.value, this.position];
  }

  // oxlint-disable-next-line eslint/class-methods-use-this -- `Node.Of` requires the method, and a lookup needs only its children's syntax
  toExpr(
    _types: readonly [],
    [value, position]: readonly [JExpr.Expression, JExpr.Expression],
  ): JExpr.Call.Call {
    return JExpr.index(value, position);
  }
}
