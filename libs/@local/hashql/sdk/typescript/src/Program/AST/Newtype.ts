import { Pipeable } from "effect";

import * as Ident from "../../JExpr/Ident.js";
import * as JExpr from "../../JExpr/index.js";

import type { Binding } from "./Binding.js";
import type { Node } from "./Node.js";
import type { ReferenceId, TypeSyntax } from "./Reference.js";

export class Newtype<T extends Node>
  extends Pipeable.Class
  implements Node.Of<readonly [T]>
{
  readonly binding: Binding<TypeSyntax>;
  /** The bindings of the type and of its constructor, which share the name. */
  readonly ids: { readonly type: ReferenceId; readonly value: ReferenceId };
  readonly child: T;

  constructor(
    binding: Binding<TypeSyntax>,
    ids: { readonly type: ReferenceId; readonly value: ReferenceId },
    child: T,
  ) {
    super();

    this.binding = binding;
    this.ids = ids;
    this.child = child;
  }

  get children(): readonly [T] {
    return [this.child];
  }

  toExpr([body]: readonly [JExpr.Expression]): JExpr.Expression {
    return JExpr.newtype(
      Ident.compile(this.binding.name),
      this.binding.value.syntax,
      body,
    );
  }
}

/** Recognizes a `Newtype` node with its child typed as a `Node`, where `instanceof` alone gives `Newtype<any>`. */
export const isNewtype = (node: Node): node is Newtype<Node> =>
  node instanceof Newtype;
