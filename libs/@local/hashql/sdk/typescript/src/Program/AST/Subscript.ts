import { Pipeable } from "effect";

import * as JExpr from "../../JExpr/index.js";

import type { Node } from "./Node.js";

/** A collection lookup by an index expression, which emits the `index` special form. */
export class Subscript
  extends Pipeable.Class
  implements Node.Of<readonly [Node, Node]>
{
  readonly value: Node;
  readonly position: Node;

  constructor(value: Node, position: Node) {
    super();

    this.value = value;
    this.position = position;
  }

  get children(): readonly [Node, Node] {
    return [this.value, this.position];
  }

  // oxlint-disable-next-line eslint/class-methods-use-this -- `Node.Of` requires the method, and a lookup needs only its children's syntax
  toExpr([value, position]: readonly [
    JExpr.Expression,
    JExpr.Expression,
  ]): JExpr.Expression {
    return JExpr.index(value, position);
  }
}
