import { Pipeable } from "effect";

import * as Ident from "../../JExpr/Ident.js";
import * as JExpr from "../../JExpr/index.js";

import type { Binding } from "./Binding.js";
import type { Node } from "./Node.js";
import type { ReferenceId, TypeSyntax } from "./Reference.js";

export class Type<T extends Node>
  extends Pipeable.Class
  implements Node.Of<readonly [T]>
{
  readonly binding: Binding<TypeSyntax>;
  /** The binding the references to this type name came from. */
  readonly id: ReferenceId;
  readonly child: T;

  constructor(binding: Binding<TypeSyntax>, id: ReferenceId, child: T) {
    super();

    this.binding = binding;
    this.id = id;
    this.child = child;
  }

  get children(): readonly [T] {
    return [this.child];
  }

  toExpr([body]: readonly [JExpr.Expression]): JExpr.Expression {
    return JExpr.type(
      Ident.compile(this.binding.name),
      this.binding.value.syntax,
      body,
    );
  }
}

/** Recognizes a `Type` node with its child typed as a `Node`, where `instanceof` alone gives `Type<any>`. */
export const isType = (node: Node): node is Type<Node> => node instanceof Type;
