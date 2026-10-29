import { Pipeable, Predicate } from "effect";

import * as Referential from "../../internal/referential.js";
import * as Ident from "../../JExpr/Ident.js";
import * as JExpr from "../../JExpr/index.js";

import type { Binding } from "../Binding.js";
import type { TypeNode } from "../TAST/TypeNode.js";
import type { Node } from "./Node.js";

/** A value binding over a body, with the type that annotates the value when there is one, which emits the `let` special form. */
export class Let<T extends Node.Any>
  extends Pipeable.Class
  implements
    Node.Of<
      "Let",
      JExpr.Call.Call,
      readonly [] | readonly [TypeNode.Any],
      readonly [Node.Any, T]
    >
{
  readonly _tag = "Let" as const;
  readonly binding: Binding.Value;

  readonly child: T;
  readonly [Referential.References]: readonly Referential.ReferenceId[];
  /** The annotation on the binding, as in `let x: Integer = 1 in x`, when it has one. */
  readonly types: readonly [] | readonly [TypeNode.Any];

  constructor(binding: Binding.Value, child: T, type?: TypeNode.Any) {
    super();

    this.binding = binding;
    this.child = child;
    this[Referential.References] = [];
    this.types = type === undefined ? [] : [type];
  }

  get children(): readonly [Node.Any, T] {
    return [this.binding.value, this.child];
  }

  toExpr(
    [type]: readonly [JExpr.Type.Type?],
    [value, body]: readonly [JExpr.Expression, Node.Expr<T>],
  ): JExpr.Call.Call {
    const name = Ident.compile(this.binding.name);
    if (type === undefined) {
      return JExpr.let(name, value, body);
    }

    return JExpr.let({ name, type }, value, body);
  }
}

/** Recognizes a `Let` node with its child typed as a `Node`, where `instanceof` alone gives `Let<any>`. */
export const isLet = (node: Node.Any): node is Let<Node.Any> =>
  Predicate.isTagged(node, "Let");
