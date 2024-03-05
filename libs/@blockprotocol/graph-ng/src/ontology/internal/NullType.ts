import * as S from "@effect/schema/Schema";

export const NullType = S.struct({
  type: S.literal("null"),
});

export type NullType = S.Schema.To<typeof NullType>;

export function makeSchema(_: NullType) {
  return S.null;
}

export type ValueSchema = ReturnType<typeof makeSchema>;
