import { Pipeable } from "effect";

import * as JExpr from "../../JExpr/index.js";
import { References } from "./Reference.js";

import type { Node } from "./Node.js";
import type { ReferenceId, TypeSyntax } from "./Reference.js";

export class Input
  extends Pipeable.Class
  implements Node.Of<readonly [] | readonly [Node]>
{
  readonly name: string;
  readonly type: TypeSyntax;
  /** The value HashQL uses when the host supplies no input of this name. */
  readonly defaultValue: Node | undefined;

  constructor(name: string, type: TypeSyntax, defaultValue: Node | undefined) {
    super();

    this.name = name;
    this.type = type;
    this.defaultValue = defaultValue;
  }

  get [References](): readonly ReferenceId[] {
    return this.type.references;
  }

  get children(): readonly [] | readonly [Node] {
    if (this.defaultValue === undefined) {
      return [];
    }

    return [this.defaultValue];
  }

  toExpr([defaultValue]: readonly [JExpr.Expression?]): JExpr.Expression {
    return JExpr.input(this.name, this.type.syntax, defaultValue);
  }
}
