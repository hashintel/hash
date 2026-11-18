import { Result, pipe } from "effect";

import * as Ident from "../JExpr/Ident.js";
import * as ProgramError from "./ProgramError.js";

import type * as Referential from "../internal/referential.js";
import type { Node } from "./AST/Node.js";
import type { TypeNode } from "./TAST/TypeNode.js";

/** A name a declaration binds in the universe `U`, with the id its references resolve to and the node it binds. */
export interface Binding<U extends Referential.Universe, V> {
  readonly id: Referential.ReferenceId<U>;
  readonly name: Ident.Ident;
  readonly value: V;
}

export declare namespace Binding {
  /** A value name bound to the node of its initializer, as a `let` binds it. */
  export interface Value extends Binding<"value", Node.Any> {}

  /** A type name bound to the type node of its definition, as a `type` or `newtype` binds it. */
  export interface Type extends Binding<"type", TypeNode.Any> {}

  export type Any = Value | Type;
}

/** Decodes the name a binding declares, before the producer makes the binding's id from it. */
export const decodeName = (
  name: string,
): Result.Result<Ident.Ident, ProgramError.Construction> =>
  pipe(
    name,
    Ident.decodeResult,
    Result.mapError((cause) =>
      ProgramError.Construction.invalidBindingName(name, cause),
    ),
  );

/** The node a binding of each universe binds. */
interface Bound {
  readonly value: Node.Any;
  readonly type: TypeNode.Any;
}

/** Binds a value to the name its id carries. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- constructs a named binding
export const make = <U extends keyof Bound>(
  id: Referential.ReferenceId<U>,
  value: Bound[U],
): Binding<U, Bound[U]> => ({ id, name: id.ident, value });
