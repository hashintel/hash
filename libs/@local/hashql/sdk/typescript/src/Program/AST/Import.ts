import { Pipeable } from "effect";

import * as Referential from "../../internal/referential.js";
import * as JExpr from "../../JExpr/index.js";

import type { Node } from "./Node.js";
import type { Path } from "./Path.js";

export class Import<T extends Node.Any>
  extends Pipeable.Class
  implements
    Node.Of<"Import", JExpr.Call.Call, readonly [], readonly [Path, T]>
{
  readonly _tag = "Import" as const;
  readonly path: Path;
  readonly imports: JExpr.Imports;
  readonly child: T;
  readonly types: readonly [] = [];
  readonly [Referential.References]: readonly Referential.ReferenceId[] = [];

  constructor(path: Path, imports: JExpr.Imports, child: T) {
    super();

    this.path = path;
    this.imports = imports;
    this.child = child;
  }

  get children(): readonly [Path, T] {
    return [this.path, this.child];
  }

  toExpr(
    _types: readonly [],
    [path, body]: readonly [string, JExpr.Expression],
  ): JExpr.Call.Call {
    return JExpr.use(path, this.imports, body);
  }
}
