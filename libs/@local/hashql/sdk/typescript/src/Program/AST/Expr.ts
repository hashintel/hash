import { Pipeable } from "effect";

import * as Referential from "../../internal/referential.js";

import type * as JExpr from "../../JExpr/index.js";
import type { Node } from "./Node.js";

export class Expr
  extends Pipeable.Class
  implements Node.Of<"Expr", JExpr.Expression, readonly [], readonly []>
{
  readonly _tag = "Expr" as const;
  readonly expression: JExpr.Expression;
  readonly types: readonly [] = [];
  readonly children: readonly [] = [];
  readonly [Referential.References]: readonly Referential.ReferenceId[] = [];

  constructor(expression: JExpr.Expression) {
    super();

    this.expression = expression;
  }

  toExpr(): JExpr.Expression {
    return this.expression;
  }
}
