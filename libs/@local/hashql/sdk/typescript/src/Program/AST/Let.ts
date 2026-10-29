import { Pipeable, Predicate } from "effect";

import * as Referential from "../../internal/referential.js";
import * as Ident from "../../JExpr/Ident.js";
import * as JExpr from "../../JExpr/index.js";

import type { Binding } from "../Binding.js";
import type { Node } from "./Node.js";

export class Let<T extends Node.Any>
  extends Pipeable.Class
  implements
    Node.Of<"Let", JExpr.Call.Call, readonly [], readonly [Node.Any, T]>
{
  readonly _tag = "Let" as const;
  readonly binding: Binding.Value;

  readonly child: T;
  readonly [Referential.References]: readonly Referential.ReferenceId[];
  readonly types: readonly [] = [];

  constructor(binding: Binding.Value, child: T) {
    super();

    this.binding = binding;
    this.child = child;
    this[Referential.References] = [];
  }

  get children(): readonly [Node.Any, T] {
    return [this.binding.value, this.child];
  }

  toExpr(
    _types: readonly [],
    [value, body]: readonly [JExpr.Expression, Node.Expr<T>],
  ): JExpr.Call.Call {
    return JExpr.let(Ident.compile(this.binding.name), value, body);
  }
}

/** Recognizes a `Let` node with its child typed as a `Node`, where `instanceof` alone gives `Let<any>`. */
export const isLet = (node: Node.Any): node is Let<Node.Any> =>
  Predicate.isTagged(node, "Let");
