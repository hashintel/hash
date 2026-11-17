import { Pipeable, Predicate } from "effect";

import * as Referential from "../../internal/referential.js";
import * as JExpr from "../../JExpr/index.js";

import type { Node } from "./Node.js";
import type { Path } from "./Path.js";

/** What an import brings into its body: the names as J-Expr writes them, and the ids of the bindings they make. */
export interface Imported {
  readonly syntax: JExpr.Imports;
  readonly bindings: readonly Referential.ReferenceId[];
}

/** An import's bindings over a body, which emits the `use` special form. */
export class Import<T extends Node.Any>
  extends Pipeable.Class
  implements
    Node.Of<"Import", JExpr.Call.Call, readonly [], readonly [Path, T]>
{
  readonly _tag = "Import" as const;
  readonly path: Path;
  readonly imports: JExpr.Imports;
  /** The bindings the import makes, which `child` sees and the code around the import does not. */
  readonly bindings: readonly Referential.ReferenceId[];
  readonly child: T;
  readonly types: readonly [] = [];
  readonly [Referential.References]: readonly Referential.ReferenceId[] = [];

  constructor(path: Path, { syntax, bindings }: Imported, child: T) {
    super();

    this.path = path;
    this.imports = syntax;
    this.bindings = bindings;
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

/** Recognizes an `Import` node with its child typed as a `Node`, where `instanceof` alone gives `Import<any>`. */
export const isImport = (node: Node.Any): node is Import<Node.Any> =>
  Predicate.isTagged(node, "Import");
