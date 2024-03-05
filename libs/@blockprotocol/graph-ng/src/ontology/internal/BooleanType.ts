import * as S from "@effect/schema/Schema";

export const BooleanType = S.struct({
  type: S.literal("boolean"),
});

export type BooleanType = S.Schema.To<typeof BooleanType>;

export function makeSchema(_: BooleanType) {
  return S.boolean;
}

export type ValueSchema = ReturnType<typeof makeSchema>;
