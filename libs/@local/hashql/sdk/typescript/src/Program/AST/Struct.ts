import { Array, Pipeable, Record } from "effect";

import * as JExpr from "../../JExpr/index.js";

import type { Node } from "./Node.js";

export class Struct extends Pipeable.Class implements Node.Of<readonly Node[]> {
  /** The field names, in the order of `children`. */
  readonly names: readonly string[];
  readonly children: readonly Node[];

  constructor(fields: readonly (readonly [name: string, value: Node])[]) {
    super();

    this.names = Array.map(fields, ([name]) => name);
    this.children = Array.map(fields, ([, value]) => value);
  }

  toExpr(values: readonly JExpr.Expression[]): JExpr.Expression {
    return JExpr.struct(Record.fromEntries(Array.zip(this.names, values)));
  }
}
