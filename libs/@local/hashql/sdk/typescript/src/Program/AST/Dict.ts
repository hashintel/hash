import { Array, Pipeable } from "effect";

import * as Referential from "../../internal/referential.js";
import * as JExpr from "../../JExpr/index.js";

import type { TypeNode } from "../TAST/TypeNode.js";
import type { Node } from "./Node.js";

/** One dict entry, as its key node and its value node. */
type DictEntry = readonly [key: Node.Any, value: Node.Any];

/** A dict literal, with the type that annotates it when there is one. */
export class Dict
  extends Pipeable.Class
  implements
    Node.Of<
      "Dict",
      JExpr.Dict.Dict,
      readonly [] | readonly [TypeNode.Any],
      readonly Node.Any[]
    >
{
  readonly _tag = "Dict" as const;
  readonly types: readonly [] | readonly [TypeNode.Any];
  readonly entries: readonly DictEntry[];
  readonly [Referential.References]: readonly Referential.ReferenceId[] = [];

  constructor(entries: readonly DictEntry[], type?: TypeNode.Any) {
    super();

    this.types = type === undefined ? [] : [type];
    this.entries = entries;
  }

  /** Every key, then every value, so `toExpr` pairs them back up by position. */
  get children(): readonly Node.Any[] {
    return [
      ...Array.map(this.entries, ([key]) => key),
      ...Array.map(this.entries, ([, value]) => value),
    ];
  }

  toExpr(
    [type]: readonly [JExpr.Type.Type?],
    children: readonly JExpr.Expression[],
  ): JExpr.Dict.Dict {
    const [keys, values] = Array.splitAt(children, this.entries.length);

    const dict = JExpr.dict(Array.zip(keys, values));
    if (type === undefined) {
      return dict;
    }

    return JExpr.typed(dict, type);
  }
}
