import * as S from "@effect/schema/Schema";
import { identity } from "effect/Function";
import * as Json from "./Json";
import * as Equivalence from "@effect/schema/Equivalence";

const Value = S.record(S.string, Json.Value);
const ValueEquivalence = Equivalence.make(Value);

// The type-system currently only supports a minimal set of JSON Schema features regarding objects.
export const ObjectType = S.struct({
  type: S.literal("object"),
  const: S.optional(Value),
});

export type ObjectType = S.Schema.To<typeof ObjectType>;

export function makeSchema(type: ObjectType) {
  return Value.pipe(
    type.const
      ? S.filter((value) => ValueEquivalence(type.const!, value))
      : identity,
  );
}

export type ValueSchema = ReturnType<typeof makeSchema>;
