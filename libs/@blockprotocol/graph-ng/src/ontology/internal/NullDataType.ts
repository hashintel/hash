import * as S from "@effect/schema/Schema";
import { identity } from "effect/Function";

export const NullDataType = S.struct({
  type: S.literal("null"),
  const: S.optional(S.null),
});

export type NullDataType = S.Schema.To<typeof NullDataType>;

export function makeSchema(type: NullDataType) {
  return S.null.pipe(
    type.const ? S.filter((value) => value === type.const) : identity,
  );
}

export type ValueSchema = ReturnType<typeof makeSchema>;
