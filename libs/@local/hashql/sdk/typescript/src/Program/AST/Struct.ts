import { Array, Pipeable, Record } from "effect";

import * as JExpr from "../../JExpr/index.js";

import type { Node } from "./Node.js";

type StructField = readonly [name: JExpr.Ident.Ident, value: Node.Any];

export class Struct
  extends Pipeable.Class
  implements Node.Of<"Struct", JExpr.Struct.Struct, readonly Node.Any[]>
{
  readonly _tag = "Struct" as const;
  /** The field names, in the order of `children`. */
  readonly names: readonly JExpr.Ident.Ident[];
  readonly children: readonly Node.Any[];

  constructor(fields: readonly StructField[]) {
    super();

    const [names, children] = Array.unzip(fields);

    this.names = names;
    this.children = children;
  }

  toExpr(values: readonly JExpr.Expression[]): JExpr.Struct.Struct {
    return JExpr.struct(
      Record.fromEntries(
        Array.zip(Array.map(this.names, JExpr.Ident.compile), values),
      ),
    );
  }
}
