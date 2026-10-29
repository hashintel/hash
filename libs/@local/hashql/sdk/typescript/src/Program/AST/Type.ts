import { Pipeable, Predicate } from "effect";

import * as Referential from "../../internal/referential.js";
import * as Ident from "../../JExpr/Ident.js";
import * as JExpr from "../../JExpr/index.js";

import type { Binding } from "../Binding.js";
import type { TypeNode } from "../TAST/TypeNode.js";
import type { Node } from "./Node.js";

/** A type alias over a body, which emits the `type` special form. */
export class Type<T extends Node.Any>
  extends Pipeable.Class
  implements
    Node.Of<"Type", JExpr.Call.Call, readonly [TypeNode.Any], readonly [T]>
{
  readonly _tag = "Type" as const;
  readonly binding: Binding.Type;

  readonly child: T;
  readonly [Referential.References]: readonly Referential.ReferenceId[];

  constructor(binding: Binding.Type, child: T) {
    super();

    this.binding = binding;
    this.child = child;
    this[Referential.References] = [];
  }

  get types(): readonly [TypeNode.Any] {
    return [this.binding.value];
  }

  get children(): readonly [T] {
    return [this.child];
  }

  toExpr(
    [type]: readonly [JExpr.Type.Type],
    [body]: readonly [JExpr.Expression],
  ): JExpr.Call.Call {
    return JExpr.type(Ident.compile(this.binding.name), type, body);
  }
}

/** Recognizes a `Type` node with its child typed as a `Node`, where `instanceof` alone gives `Type<any>`. */
export const isType = (node: Node.Any): node is Type<Node.Any> =>
  Predicate.isTagged(node, "Type");
