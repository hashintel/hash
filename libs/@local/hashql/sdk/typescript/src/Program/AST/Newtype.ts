import { Pipeable, Predicate } from "effect";

import * as Referential from "../../internal/referential.js";
import * as Ident from "../../JExpr/Ident.js";
import * as JExpr from "../../JExpr/index.js";

import type { Binding } from "../Binding.js";
import type { TypeNode } from "../TAST/TypeNode.js";
import type { Node } from "./Node.js";

/** A nominal type and its constructor over a body, which emits the `newtype` special form. */
export class Newtype<T extends Node.Any>
  extends Pipeable.Class
  implements
    Node.Of<"Newtype", JExpr.Call.Call, readonly [TypeNode.Any], readonly [T]>
{
  readonly _tag = "Newtype" as const;
  readonly binding: Binding.Type;
  readonly valueReference: Referential.ReferenceId<"value">;
  readonly child: T;
  readonly [Referential.References]: readonly Referential.ReferenceId[];

  constructor(
    binding: Binding.Type,
    valueReference: Referential.ReferenceId<"value">,
    child: T,
  ) {
    super();

    this.binding = binding;
    this.valueReference = valueReference;
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
    return JExpr.newtype(Ident.compile(this.binding.name), type, body);
  }
}

/** Recognizes a `Newtype` node with its child typed as a `Node`, where `instanceof` alone gives `Newtype<any>`. */
export const isNewtype = (node: Node.Any): node is Newtype<Node.Any> =>
  Predicate.isTagged(node, "Newtype");
