import { Array, Pipeable, Record } from "effect";

import * as Referential from "../../internal/referential.js";
import * as JExpr from "../../JExpr/index.js";

import type { TypeNode } from "../TAST/TypeNode.js";
import type { Node } from "./Node.js";

/** One struct field, as its name and its value node. */
type StructField = readonly [name: JExpr.Ident.Ident, value: Node.Any];

/** A struct literal, with the type that annotates it when there is one. */
export class Struct
  extends Pipeable.Class
  implements
    Node.Of<
      "Struct",
      JExpr.Struct.Struct,
      readonly [] | readonly [TypeNode.Any],
      readonly Node.Any[]
    >
{
  readonly _tag = "Struct" as const;
  /** The field names, in the order of `children`. */
  readonly names: readonly JExpr.Ident.Ident[];
  /** The annotation on the struct, such as `(name: String)`, when it has one. */
  readonly types: readonly [] | readonly [TypeNode.Any];
  readonly children: readonly Node.Any[];
  readonly [Referential.References]: readonly Referential.ReferenceId[] = [];

  constructor(fields: readonly StructField[], type?: TypeNode.Any) {
    super();

    const [names, children] = Array.unzip(fields);

    this.names = names;
    this.types = type === undefined ? [] : [type];
    this.children = children;
  }

  toExpr(
    [type]: readonly [JExpr.Type.Type?],
    values: readonly JExpr.Expression[],
  ): JExpr.Struct.Struct {
    const expr = JExpr.struct(
      Record.fromEntries(
        Array.zip(Array.map(this.names, JExpr.Ident.compile), values),
      ),
    );
    if (type === undefined) {
      return expr;
    }

    return JExpr.typed(expr, type);
  }
}
