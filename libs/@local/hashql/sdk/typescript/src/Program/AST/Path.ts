import { Pipeable } from "effect";

import * as Referential from "../../internal/referential.js";
import * as JExpr from "../../JExpr/index.js";

import type { Node } from "./Node.js";

export class Path
  extends Pipeable.Class
  implements Node.Of<"Path", readonly []>
{
  readonly _tag: "Path" = "Path";
  readonly path: JExpr.Path.Path;
  readonly children: readonly [];
  readonly [Referential.References]: readonly Referential.ReferenceId[];

  constructor(reference: Referential.ReferenceId, path: JExpr.Path.Path) {
    super();

    this[Referential.References] = [reference];
    this.path = path;
    this.children = [];
  }

  toExpr(_syntax: readonly []): JExpr.Expression {
    return JExpr.Path.compile(this.path);
  }
}
