import { Result, pipe } from "effect";

import * as Ident from "../JExpr/Ident.js";
import * as ProgramError from "./ProgramError.js";

import type * as Referential from "../internal/referential.js";
import type { Node } from "./AST/Node.js";
import type { TypeNode } from "./TAST/TypeNode.js";

export interface Binding<U extends Referential.Universe, V> {
  readonly id: Referential.ReferenceId<U>;
  readonly name: Ident.Ident;
  readonly value: V;
}

export declare namespace Binding {
  export interface Value extends Binding<"value", Node.Any> {}
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

/** Binds a value to the name its id carries. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- constructs a named binding
export const make = <U extends Referential.Universe, V>(
  id: Referential.ReferenceId<U>,
  value: V,
): Binding<U, V> extends Binding.Any ? Binding<U, V> : never =>
  // SAFETY: the type works unconditionally, it's just a typechk so that people don't supply the wrong combination
  // oxlint-disable-next-line typescript/no-restricted-types typescript/no-unsafe-type-assertion -- the type works unconditionally
  ({ id, name: id.ident, value }) as unknown as Binding<
    U,
    V
  > extends Binding.Any
    ? Binding<U, V>
    : never;
