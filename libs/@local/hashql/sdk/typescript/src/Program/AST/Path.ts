import { Pipeable } from "effect";

import * as Referential from "../../internal/referential.js";
import * as JExpr from "../../JExpr/index.js";

import type { Node } from "./Node.js";

export class Path
  extends Pipeable.Class
  implements Node.Of<"Path", string, readonly [], readonly []>
{
  readonly _tag = "Path" as const;
  readonly path: JExpr.Path.Path;
  readonly children: readonly [];
  readonly types: readonly [];
  readonly [Referential.References]: readonly Referential.ReferenceId[];

  constructor(reference: Referential.ReferenceId, path: JExpr.Path.Path) {
    super();

    this[Referential.References] = [reference];
    this.path = path;
    this.children = [];
    this.types = [];
  }

  toExpr(_types: readonly [], _children: readonly []): string {
    return JExpr.Path.compile(this.path);
  }
}
