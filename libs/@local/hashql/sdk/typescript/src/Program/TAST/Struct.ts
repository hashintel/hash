import { Array, Pipeable } from "effect";

import * as Referential from "../../internal/referential.js";

import type * as JExpr from "../../JExpr/index.js";
import type { TypeNode } from "./TypeNode.js";

/** One struct type field, as its name and its type node. */
type StructField = readonly [name: JExpr.Ident.Ident, type: TypeNode.Any];

/** A struct type. */
export class Struct
  extends Pipeable.Class
  implements TypeNode.Of<JExpr.Type.Struct.Struct, readonly TypeNode.Any[]>
{
  readonly _tag = "Struct" as const;
  /** The field names, in the order of `children`. */
  readonly fields: readonly JExpr.Ident.Ident[];
  readonly children: readonly TypeNode.Any[];
  readonly [Referential.References]: readonly Referential.ReferenceId[] = [];

  constructor(fields: readonly StructField[]) {
    super();

    const [names, children] = Array.unzip(fields);

    this.fields = names;
    this.children = children;
  }

  toType(members: readonly JExpr.Type.Type[]): JExpr.Type.Struct.Struct {
    return { _tag: "Struct", members: Array.zip(this.fields, members) };
  }
}
