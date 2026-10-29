import { Array, Pipeable } from "effect";

import * as Referential from "../../internal/referential.js";
import * as JExpr from "../../JExpr/index.js";
import { References } from "./Reference.js";

import type { Node } from "./Node.js";

type DictEntry = readonly [key: Node.Any, value: Node.Any];

export class Dict
  extends Pipeable.Class
  implements Node.Of<"Dict", readonly Node.Any[]>
{
  /** The annotation on the dictionary, such as `::kernel::type::Dict<String, Integer>`. */
  readonly type: TypeSyntax;
  readonly entries: readonly DictEntry[];

  constructor(entries: readonly DictEntry[], type: TypeSyntax) {
    super();

    this.type = type;
    this.entries = entries;
  }

  get [Referential.References](): readonly Referential.ReferenceId[] {
    return this.type.references;
  }

  /** Every key, then every value, so `toExpr` pairs them back up by position. */
  get children(): readonly Node.Any[] {
    return [
      ...Array.map(this.entries, ([key]) => key),
      ...Array.map(this.entries, ([, value]) => value),
    ];
  }

  toExpr(syntax: readonly JExpr.Expression[]): JExpr.Expression {
    const [keys, values] = Array.splitAt(syntax, this.entries.length);
    return JExpr.typed(JExpr.dict(Array.zip(keys, values)), this.type.syntax);
  }
}
