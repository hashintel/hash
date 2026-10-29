import { Pipeable } from "effect";

import * as Referential from "../../internal/referential.js";

import type * as JExpr from "../../JExpr/index.js";
import type { TypeNode } from "./TypeNode.js";

/** Type syntax built outside the tree, which names no binding of the program. */
export class Syntax
  extends Pipeable.Class
  implements TypeNode.Of<JExpr.Type.Type, readonly []>
{
  readonly _tag: JExpr.Type.Type["_tag"];
  readonly syntax: JExpr.Type.Type;
  readonly children: readonly [] = [];
  readonly [Referential.References]: readonly Referential.ReferenceId[] = [];

  constructor(syntax: JExpr.Type.Type) {
    super();

    this._tag = syntax._tag;
    this.syntax = syntax;
  }

  toType(): JExpr.Type.Type {
    return this.syntax;
  }
}
