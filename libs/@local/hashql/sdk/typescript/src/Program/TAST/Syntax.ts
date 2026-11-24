import { Pipeable, Result, pipe } from "effect";

import * as Overflow from "../../internal/overflow.js";
import * as Referential from "../../internal/referential.js";
import * as JExpr from "../../JExpr/index.js";
import * as ProgramError from "../ProgramError.js";

import type { TypeNode } from "./TypeNode.js";

/** Type syntax built outside the tree, which names no binding of the program. */
export class Syntax
  extends Pipeable.Class
  implements TypeNode.Of<JExpr.Type.Type, readonly []>
{
  readonly _tag: JExpr.Type.Type["_tag"];
  readonly syntax: JExpr.Type.Type;
  readonly children: readonly [] = [];
  readonly [Referential.References]: readonly Referential.ReferenceId[] = [];

  constructor(syntax: JExpr.Type.Type) {
    super();

    this._tag = syntax._tag;
    this.syntax = syntax;
  }

  toType(): JExpr.Type.Type {
    return this.syntax;
  }
}

const makeType = Overflow.makeResult(JExpr.Type.Schema);

/**
 * Wraps type syntax a caller built, after checking it against the J-Expr type schema.
 *
 * A caller can write type syntax as an object literal, whose names no parser has read. Every other node takes names and paths that a parser decoded before they reached it. With this check, a tree therefore holds valid syntax by construction. Syntax the schema refuses, such as a struct member whose name is not an identifier, returns a {@link ProgramError.Construction} with the `InvalidExpression` reason. Syntax nested deep enough to exhaust the call stack during the check returns the same reason.
 */
export const fromSyntax = (
  syntax: JExpr.Type.Type,
): Result.Result<Syntax, ProgramError.Construction> =>
  pipe(
    makeType(syntax),
    Result.mapBoth({
      onFailure: (cause) => ProgramError.Construction.invalidExpression(cause),
      onSuccess: () => new Syntax(syntax),
    }),
  );
