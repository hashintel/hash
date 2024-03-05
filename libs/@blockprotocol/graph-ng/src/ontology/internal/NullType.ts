import * as S from "@effect/schema/Schema";
import { identity } from "effect/Function";

export const NullType = S.struct({
  type: S.literal("null"),
  const: S.optional(S.null),
});

export type NullType = S.Schema.To<typeof NullType>;

export function makeSchema(type: NullType) {
  return S.null.pipe(
    type.const ? S.filter((value) => value === type.const) : identity,
  );
}

export type ValueSchema = ReturnType<typeof makeSchema>;
