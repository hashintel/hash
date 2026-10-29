import { Pipeable, Result } from "effect";

import * as Referential from "../../internal/referential.js";
import * as JExpr from "../../JExpr/index.js";
import * as ProgramError from "../ProgramError.js";

import type { TypeNode } from "../TAST/TypeNode.js";
import type { Node } from "./Node.js";

/** A read of a program input with its type and an optional default, which emits the `input` special form. */
export class Input
  extends Pipeable.Class
  implements
    Node.Of<
      "Input",
      JExpr.Call.Call,
      readonly [TypeNode.Any],
      readonly [] | readonly [Node.Any]
    >
{
  readonly _tag = "Input" as const;
  readonly name: JExpr.Ident.Ident;
  readonly types: readonly [TypeNode.Any];

  /** The value HashQL uses when the host supplies no input of this name. */
  readonly defaultValue: Node.Any | undefined;
  readonly [Referential.References]: readonly Referential.ReferenceId[] = [];

  constructor(
    name: JExpr.Ident.Ident,
    type: TypeNode.Any,
    defaultValue: Node.Any | undefined,
  ) {
    super();

    this.name = name;
    this.types = [type];
    this.defaultValue = defaultValue;
  }

  get children(): readonly [] | readonly [Node.Any] {
    if (this.defaultValue === undefined) {
      return [];
    }

    return [this.defaultValue];
  }

  toExpr(
    [type]: readonly [JExpr.Type.Type],
    [defaultValue]: readonly [JExpr.Expression?],
  ): JExpr.Call.Call {
    return JExpr.input(JExpr.Ident.compile(this.name), type, defaultValue);
  }
}

/** Decodes an input's name, where a name HashQL cannot spell fails with the `InvalidExpression` reason. */
export const decodeInputName = (
  name: string,
): Result.Result<JExpr.Ident.Ident, ProgramError.Construction> =>
  Result.mapError(JExpr.Ident.decodeResult(name), (cause) =>
    ProgramError.Construction.invalidExpression(cause),
  );
