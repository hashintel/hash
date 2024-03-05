import * as S from "@effect/schema/Schema";
import { identity } from "effect/Function";

export const NumberDataType = S.struct({
  type: S.literal("number", "integer"),
  multipleOf: S.optional(S.number),
  minimum: S.optional(S.number),
  maximum: S.optional(S.number),
  exclusiveMinimum: S.optional(S.number),
  exclusiveMaximum: S.optional(S.number),
  const: S.optional(S.number),
});

export type NumberDataType = S.Schema.To<typeof NumberDataType>;

export function makeSchema(type: NumberDataType) {
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
