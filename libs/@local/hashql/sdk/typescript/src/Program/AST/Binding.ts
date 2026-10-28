import { Result, pipe } from "effect";

import * as Ident from "../../JExpr/Ident.js";
import * as ProgramError from "../ProgramError.js";

export interface Binding<V> {
  readonly name: Ident.Ident;
  readonly value: V;
}

// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- constructs a named binding
export const make = <V>(
  name: string,
  value: V,
): Result.Result<Binding<V>, ProgramError.Construction> =>
  pipe(
    name,
    Ident.decodeResult,
    Result.mapError((cause) =>
      ProgramError.Construction.invalidBindingName(name, cause),
    ),
    Result.map((name) => ({ name, value })),
  );
