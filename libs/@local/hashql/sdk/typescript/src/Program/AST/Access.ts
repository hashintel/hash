import { Pipeable } from "effect";

import * as Referential from "../../internal/referential.js";
import * as JExpr from "../../JExpr/index.js";

import type { Node } from "./Node.js";

export class Access
  extends Pipeable.Class
  implements Node.Of<"Access", readonly [Node.Any]>
{
  readonly _tag = "Access" as const;
  readonly value: Node.Any;
  /** A field name, or a zero-based tuple position. */
  readonly field: string | number;
  readonly [Referential.References]: readonly Referential.ReferenceId[];

  constructor(value: Node.Any, field: string | number) {
    super();

    this[Referential.References] = [];
    this.value = value;
    this.field = field;
  }

  get children(): readonly [Node.Any] {
    return [this.value];
  }

  toExpr([value]: readonly [JExpr.Expression]): JExpr.Expression {
    return JExpr.access(value, this.field);
  }
}
