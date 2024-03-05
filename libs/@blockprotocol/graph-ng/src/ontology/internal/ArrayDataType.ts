import * as S from "@effect/schema/Schema";
import { identity } from "effect/Function";
import * as Equivalence from "effect/Equivalence";
import * as Json from "./Json";

const Value = S.array(Json.Value);
const ValueEquivalence = Equivalence.array(Json.ValueEquivalence);

// The type-system currently only supports a minimal set of JSON Schema features regarding objects.
export const ArrayDataType = S.struct({
  type: S.literal("array"),
  const: S.optional(Value),
});

export type ArrayDataType = S.Schema.To<typeof ArrayDataType>;

export function makeSchema(type: ArrayDataType) {
  return S.array(Json.Value).pipe(
    type.const !== undefined
      ? S.filter((value) => ValueEquivalence(type.const!, value))
      : identity,
  );
}

export type ValueSchema = ReturnType<typeof makeSchema>;
