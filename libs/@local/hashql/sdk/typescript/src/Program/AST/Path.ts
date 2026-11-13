import { Pipeable } from "effect";

import * as Referential from "../../internal/referential.js";
import * as JExpr from "../../JExpr/index.js";

import type { Node } from "./Node.js";

/**
 * A path, such as a binding's name or a module's path.
 *
 * A path keeps the id of the binding its first segment names, when the handle it came from carries one. For an import that reads through an imported module, that binding is the module. An absolute path keeps none.
 */
export class Path
  extends Pipeable.Class
  implements Node.Of<"Path", string, readonly [], readonly []>
{
  readonly _tag = "Path" as const;
  readonly path: JExpr.Path.Path;
  readonly children: readonly [] = [];
  readonly types: readonly [] = [];
  readonly [Referential.References]: readonly Referential.ReferenceId[];

  constructor(path: JExpr.Path.Path, reference?: Referential.ReferenceId) {
    super();

    this.path = path;
    this[Referential.References] = reference === undefined ? [] : [reference];
  }

  toExpr(_types: readonly [], _children: readonly []): string {
    return JExpr.Path.compile(this.path);
  }
}
