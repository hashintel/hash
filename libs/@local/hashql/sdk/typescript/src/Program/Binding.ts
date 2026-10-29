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

type MakeReturn<U extends Referential.Universe, V> = Result.Result<
  Binding<U, V>,
  ProgramError.Construction
>;

const makeUnchecked = <U extends Referential.Universe, V>(
  id: Referential.ReferenceId<U>,
  name: string,
  value: V,
): MakeReturn<U, V> =>
  pipe(
    name,
    Ident.decodeResult,
    Result.mapError((cause) =>
      ProgramError.Construction.invalidBindingName(name, cause),
    ),
    Result.map((name) => ({ id, name, value })),
  );

// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- constructs a named binding
export const make = <U extends Referential.Universe, V>(
  id: Referential.ReferenceId<U>,
  name: string,
  value: V,
): Binding<U, V> extends Binding.Any ? MakeReturn<U, V> : never =>
  // SAFETY: the type works unconditionally, it's just a typechk so that people don't supply the wrong combination
  // oxlint-disable-next-line typescript/no-restricted-types typescript/no-unsafe-type-assertion -- the type works unconditionally
  makeUnchecked(id, name, value) as unknown as Binding<U, V> extends Binding.Any
    ? MakeReturn<U, V>
    : never;
