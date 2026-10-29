import { Pipeable } from "effect";

import * as Referential from "../../internal/referential.js";
import * as JExpr from "../../JExpr/index.js";

import type { Node } from "./Node.js";

/** A read of a field or a tuple element, which emits the `access` special form. */
export class Access
  extends Pipeable.Class
  implements
    Node.Of<"Access", JExpr.Call.Call, readonly [], readonly [Node.Any]>
{
  readonly _tag = "Access" as const;
  readonly value: Node.Any;
  /** A field name, or a zero-based tuple position. */
  readonly field: string | number;
  readonly types: readonly [] = [];
  readonly [Referential.References]: readonly Referential.ReferenceId[] = [];

  constructor(value: Node.Any, field: string | number) {
    super();

    this.value = value;
    this.field = field;
  }

  get children(): readonly [Node.Any] {
    return [this.value];
  }

  toExpr(
    _types: readonly [],
    [value]: readonly [JExpr.Expression],
  ): JExpr.Call.Call {
    return JExpr.access(value, this.field);
  }
}
