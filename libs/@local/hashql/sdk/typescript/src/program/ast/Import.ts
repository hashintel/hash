import * as JExpr from "../../jexpr/index.js";
import * as Path from "../../jexpr/Path.js";

import type { Node } from "./Node.js";

export class Import<Child extends Node> implements Node {
  readonly path: Path.Path;
  readonly imports: JExpr.Imports;
  readonly child: Child;

  constructor(path: Path.Path, imports: JExpr.Imports, child: Child) {
    this.path = path;
    this.imports = imports;
    this.child = child;
  }

  compile(): JExpr.Expression {
    return JExpr.use(
      Path.compile(this.path),
      this.imports,
      this.child.compile(),
    );
  }
}
