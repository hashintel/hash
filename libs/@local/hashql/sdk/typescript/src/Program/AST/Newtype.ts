import { Pipeable } from "effect";

import * as Ident from "../../JExpr/Ident.js";
import * as JExpr from "../../JExpr/index.js";

import type * as Syntax from "../../JExpr/Type/index.js";
import type { Binding } from "./Binding.js";
import type { Node } from "./Node.js";

export class Newtype<T extends Node>
  extends Pipeable.Class
  implements Node.Of<readonly [T]>
{
  readonly binding: Binding<Syntax.Type>;
  readonly child: T;

  constructor(binding: Binding<Syntax.Type>, child: T) {
    super();

    this.binding = binding;
    this.child = child;
  }

  get children(): readonly [T] {
    return [this.child];
  }

  toExpr([body]: readonly [JExpr.Expression]): JExpr.Expression {
    return JExpr.newtype(
      Ident.compile(this.binding.name),
      this.binding.value,
      body,
    );
  }
}
