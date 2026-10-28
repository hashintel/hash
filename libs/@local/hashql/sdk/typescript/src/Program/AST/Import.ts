import { Pipeable } from "effect";

import * as JExpr from "../../JExpr/index.js";
import * as Path from "../../JExpr/Path.js";

import type { Node } from "./Node.js";

export class Import<T extends Node>
  extends Pipeable.Class
  implements Node.Of<readonly [T]>
{
  readonly path: Path.Path;
  readonly imports: JExpr.Imports;
  readonly child: T;

  constructor(path: Path.Path, imports: JExpr.Imports, child: T) {
    super();

    this.path = path;
    this.imports = imports;
    this.child = child;
  }

  get children(): readonly [T] {
    return [this.child];
  }

  toExpr([body]: readonly [JExpr.Expression]): JExpr.Expression {
    return JExpr.use(Path.compile(this.path), this.imports, body);
  }
}
