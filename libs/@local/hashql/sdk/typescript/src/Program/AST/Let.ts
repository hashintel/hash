import { Pipeable } from "effect";

import * as Ident from "../../JExpr/Ident.js";
import * as JExpr from "../../JExpr/index.js";

import type { Binding } from "./Binding.js";
import type { Node } from "./Node.js";

export class Let<T extends Node> extends Pipeable.Class implements Node {
  readonly binding: Binding<Node>;
  readonly child: T;

  constructor(binding: Binding<Node>, child: T) {
    super();

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
