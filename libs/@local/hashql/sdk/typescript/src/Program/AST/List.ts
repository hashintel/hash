import { Pipeable } from "effect";

import * as JExpr from "../../JExpr/index.js";
import { References } from "./Reference.js";

import type { Node } from "./Node.js";
import type { ReferenceId, TypeSyntax } from "./Reference.js";

export class List extends Pipeable.Class implements Node.Of<readonly Node[]> {
  /** The annotation on the list, such as `::kernel::type::List<Integer>`. */
  readonly type: TypeSyntax;
  readonly members: readonly Node[];

  constructor(type: TypeSyntax, members: readonly Node[]) {
    super();

    this.type = type;
    this.members = members;
  }

  get [References](): readonly ReferenceId[] {
    return this.type.references;
  }

  get children(): readonly Node[] {
    return this.members;
  }

  toExpr(members: readonly JExpr.Expression[]): JExpr.Expression {
    return JExpr.typed(JExpr.list(...members), this.type.syntax);
  }
}
