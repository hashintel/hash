import * as S from "@effect/schema/Schema";
import { identity } from "effect/Function";

export const BooleanType = S.struct({
  type: S.literal("boolean"),
  const: S.optional(S.boolean),
});

export type BooleanType = S.Schema.To<typeof BooleanType>;

export function makeSchema(type: BooleanType) {
  return S.boolean.pipe(
    type.const ? S.filter((value) => value === type.const) : identity,
  );
}

export type ValueSchema = ReturnType<typeof makeSchema>;
