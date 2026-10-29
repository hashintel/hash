import { Pipeable } from "effect";

import * as Ident from "../../JExpr/Ident.js";
import * as JExpr from "../../JExpr/index.js";

import type { Binding } from "./Binding.js";
import type { Node } from "./Node.js";
import type { ReferenceId } from "./Reference.js";

export class Let<T extends Node>
  extends Pipeable.Class
  implements Node.Of<readonly [Node, T]>
{
  readonly binding: Binding<Node>;
  /** The binding the references to this name in `child` came from. */
  readonly id: ReferenceId;
  readonly child: T;

  constructor(binding: Binding<Node>, id: ReferenceId, child: T) {
    super();

    this.binding = binding;
    this.id = id;
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

/** Recognizes a `Let` node with its child typed as a `Node`, where `instanceof` alone gives `Let<any>`. */
export const isLet = (node: Node): node is Let<Node> => node instanceof Let;
