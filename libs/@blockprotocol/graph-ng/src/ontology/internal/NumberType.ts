import * as S from "@effect/schema/Schema";
import { identity } from "effect/Function";

export const NumberType = S.struct({
  type: S.literal("number", "integer"),
  multipleOf: S.optional(S.number),
  minimum: S.optional(S.number),
  maximum: S.optional(S.number),
  exclusiveMinimum: S.optional(S.number),
  exclusiveMaximum: S.optional(S.number),
  const: S.optional(S.number),
});

export type NumberType = S.Schema.To<typeof NumberType>;

export function makeSchema(type: NumberType) {
  const base = {
    integer: S.Int,
    number: S.number,
  }[type.type];

  return base.pipe(
    type.multipleOf ? S.multipleOf(type.multipleOf) : identity,
    type.minimum ? S.greaterThanOrEqualTo(type.minimum) : identity,
    type.maximum ? S.lessThanOrEqualTo(type.maximum) : identity,
    type.exclusiveMinimum ? S.greaterThan(type.exclusiveMinimum) : identity,
    type.exclusiveMaximum ? S.lessThan(type.exclusiveMaximum) : identity,
    type.const ? S.filter((value) => value === type.const) : identity,
  );
}

export type ValueSchema = ReturnType<typeof makeSchema>;
