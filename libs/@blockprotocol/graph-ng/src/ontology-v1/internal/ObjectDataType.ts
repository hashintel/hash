import * as Equivalence from "@effect/schema/Equivalence";
import * as S from "@effect/schema/Schema";
import { Predicate } from "effect";
import { identity } from "effect/Function";

import * as Json from "../../internal/Json";

const Value = S.record(S.string, Json.Value);
const ValueEquivalence = Equivalence.make(Value);

// The type-system currently only supports a minimal set of JSON Schema features regarding objects.
export const ObjectDataType = S.struct({
  type: S.literal("object"),
  const: S.optional(Value),
});

export type ObjectDataType = S.Schema.To<typeof ObjectDataType>;

export function makeSchema(type: ObjectDataType) {
  return Value.pipe(
    Predicate.isNotUndefined(type.const)
      ? S.filter((value) => ValueEquivalence(type.const!, value))
      : identity,
  );
}

export type ValueSchema = ReturnType<typeof makeSchema>;
