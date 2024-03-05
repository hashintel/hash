import * as S from "@effect/schema/Schema";
import { identity } from "effect/Function";

export const BooleanDataType = S.struct({
  type: S.literal("boolean"),
  const: S.optional(S.boolean),
});

export type BooleanDataType = S.Schema.To<typeof BooleanDataType>;

export function makeSchema(type: BooleanDataType) {
  return S.boolean.pipe(
    type.const ? S.filter((value) => value === type.const) : identity,
  );
}

export type ValueSchema = ReturnType<typeof makeSchema>;
