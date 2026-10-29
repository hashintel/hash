import { Pipeable } from "effect";

import * as JExpr from "../../JExpr/index.js";
import { Path } from "./Path.js";

import type { Node } from "./Node.js";

export class Import<T extends Node.Any>
  extends Pipeable.Class
  implements Node.Of<"Import", readonly [Path, T]>
{
  readonly _tag = "Import" as const;
  readonly path: Path;
  readonly imports: JExpr.Imports;
  readonly child: T;

  constructor(path: Path, imports: JExpr.Imports, child: T) {
    super();

    this.path = path;
    this.imports = imports;
    this.child = child;
  }

  get children(): readonly [Path, T] {
    return [this.path, this.child];
  }

  toExpr([path, body]: readonly [
    JExpr.Expression,
    JExpr.Expression,
  ]): JExpr.Expression {
    return JExpr.use(path, this.imports, body);
  }
}
