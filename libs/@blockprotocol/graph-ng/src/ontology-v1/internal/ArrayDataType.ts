import * as S from "@effect/schema/Schema";
import { Predicate } from "effect";
import * as Equivalence from "effect/Equivalence";
import { identity } from "effect/Function";

import * as Json from "../../Json.js";

const Value = S.array(Json.Value);
const ValueEquivalence = Equivalence.array(Json.ValueEquivalence);

// The type-system currently only supports a minimal set of JSON Schema features regarding objects.
export const ArrayDataType = S.struct({
  type: S.literal("array"),
  const: S.optional(Value),
});

export type ArrayDataType = S.Schema.To<typeof ArrayDataType>;

export function makeSchema(type: ArrayDataType) {
  return Value.pipe(
    Predicate.isNotUndefined(type.const)
      ? S.filter((value) => ValueEquivalence(type.const!, value))
      : identity,
  );
}

export type ValueSchema = ReturnType<typeof makeSchema>;
