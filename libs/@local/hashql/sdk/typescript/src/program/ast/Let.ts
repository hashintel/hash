import * as Ident from "../../jexpr/Ident.js";
import * as JExpr from "../../jexpr/index.js";

import type { Binding } from "./Binding.js";
import type { Node } from "./Node.js";

export class Let<Child extends Node> implements Node {
  readonly binding: Binding<Node>;
  readonly child: Child;

  constructor(binding: Binding<Node>, child: Child) {
    this.binding = binding;
    this.child = child;
  }

  compile(): JExpr.Expression {
    return JExpr.let(
      Ident.compile(this.binding.name),
      this.binding.value.compile(),
      this.child.compile(),
    );
  }
}
