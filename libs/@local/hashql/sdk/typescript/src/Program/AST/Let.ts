import { Pipeable } from "effect";

import * as Ident from "../../JExpr/Ident.js";
import * as JExpr from "../../JExpr/index.js";

import type { Binding } from "./Binding.js";
import type { Node } from "./Node.js";

export class Let<T extends Node>
  extends Pipeable.Class
  implements Node.Of<readonly [Node, T]>
{
  readonly binding: Binding<Node>;
  readonly child: T;

  constructor(binding: Binding<Node>, child: T) {
    super();

    this.binding = binding;
    this.child = child;
  }

  get children(): readonly [Node, T] {
    return [this.binding.value, this.child];
  }

  toExpr([value, body]: readonly [
    JExpr.Expression,
    JExpr.Expression,
  ]): JExpr.Expression {
    return JExpr.let(Ident.compile(this.binding.name), value, body);
  }
}
