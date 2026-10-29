import { Pipeable } from "effect";

import * as Referential from "../../internal/referential.js";
import * as JExpr from "../../JExpr/index.js";

import type { TypeNode } from "../TAST/TypeNode.js";
import type { Node } from "./Node.js";

export class Input
  extends Pipeable.Class
  implements
    Node.Of<
      "Input",
      JExpr.Call.Call,
      readonly [TypeNode.Any],
      readonly [] | readonly [Node.Any]
    >
{
  readonly _tag = "Input" as const;
  readonly name: JExpr.Ident.Ident;
  readonly types: readonly [TypeNode.Any];

  /** The value HashQL uses when the host supplies no input of this name. */
  readonly defaultValue: Node.Any | undefined;
  readonly [Referential.References]: readonly Referential.ReferenceId[] = [];

  constructor(
    name: JExpr.Ident.Ident,
    type: TypeNode.Any,
    defaultValue: Node.Any | undefined,
  ) {
    super();

    this.name = name;
    this.types = [type];
    this.defaultValue = defaultValue;
  }

  get children(): readonly [] | readonly [Node.Any] {
    if (this.defaultValue === undefined) {
      return [];
    }

    return [this.defaultValue];
  }

  toExpr(
    [type]: readonly [JExpr.Type.Type],
    [defaultValue]: readonly [JExpr.Expression?],
  ): JExpr.Call.Call {
    return JExpr.input(JExpr.Ident.compile(this.name), type, defaultValue);
  }
}
