import { Result } from "effect";

import * as Ident from "../../jexpr/Ident.js";
import * as ProgramError from "../ProgramError.js";

export interface Binding<Value> {
  readonly name: Ident.Ident;
  readonly value: Value;
}

// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- constructs a named binding
export const make = <Value>(
  name: string,
  value: Value,
): Result.Result<Binding<Value>, ProgramError.Construction> =>
  Ident.decodeResult(name).pipe(
    Result.mapError(
      (cause) =>
        new ProgramError.Construction({
          reason: ProgramError.Reason.InvalidBindingName({ name, cause }),
        }),
    ),
    Result.map((name) => ({ name, value })),
  );
