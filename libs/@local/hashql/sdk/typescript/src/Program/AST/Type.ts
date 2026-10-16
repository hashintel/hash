import * as Ident from "../../JExpr/Ident.js";
import * as JExpr from "../../JExpr/index.js";

import type * as Syntax from "../../JExpr/Type/index.js";
import type { Binding } from "./Binding.js";
import type { Node } from "./Node.js";

export class Type<Child extends Node> implements Node {
  readonly binding: Binding<Syntax.Type>;
  readonly child: Child;

  constructor(binding: Binding<Syntax.Type>, child: Child) {
    this.binding = binding;
    this.child = child;
  }

  compile(): JExpr.Expression {
    return JExpr.type(
      Ident.compile(this.binding.name),
      this.binding.value,
      this.child.compile(),
    );
  }
}
