import { z } from "zod";

import type { SingleValueSchema } from "@blockprotocol/type-system";

export const getNumberExample = (
  schemas: Extract<SingleValueSchema, { type: "number" }>[],
  index: number,
): number | undefined => {
  const constraints = schemas.map((schema) => {
    let validator = z.number();
    if (!("enum" in schema)) {
      if (schema.minimum !== undefined) {
        validator = validator.min(schema.minimum);
      }
      if (schema.maximum !== undefined) {
        validator = validator.max(schema.maximum);
      }
      if (schema.exclusiveMinimum !== undefined) {
        validator = validator.gt(schema.exclusiveMinimum);
      }
      if (schema.exclusiveMaximum !== undefined) {
        validator = validator.lt(schema.exclusiveMaximum);
      }
      if (schema.multipleOf !== undefined) {
        if (!Number.isFinite(schema.multipleOf) || schema.multipleOf <= 0) {
          return undefined;
        }
        validator = validator.multipleOf(schema.multipleOf);
      }
    }
    return validator;
  });
  const accepts = (value: number) =>
    constraints.every((validator) => validator?.safeParse(value).success) &&
    schemas.every(
      (schema) => !("enum" in schema) || schema.enum.includes(value),
    );

  const enumeration = schemas.find((schema) => "enum" in schema);
  if (enumeration && "enum" in enumeration) {
    return enumeration.enum.slice(0, 64).find(accepts);
  }

  const bounds = schemas.flatMap((schema) =>
    "enum" in schema
      ? []
      : [
          schema.minimum,
          schema.exclusiveMinimum,
          schema.maximum,
          schema.exclusiveMaximum,
        ].filter(
          (value): value is number =>
            value !== undefined && Number.isFinite(value),
        ),
  );
  const minimum = Math.max(
    -Infinity,
    ...schemas.flatMap((schema) =>
      "enum" in schema
        ? []
        : [schema.minimum ?? -Infinity, schema.exclusiveMinimum ?? -Infinity],
    ),
  );
  const maximum = Math.min(
    Infinity,
    ...schemas.flatMap((schema) =>
      "enum" in schema
        ? []
        : [schema.maximum ?? Infinity, schema.exclusiveMaximum ?? Infinity],
    ),
  );
  if (minimum > maximum || constraints.some((constraint) => !constraint)) {
    return undefined;
  }
  const candidates = [
    [42, 128, 224][index % 3] ?? 42,
    1,
    0.5,
    0,
    -1,
    minimum / 2 + maximum / 2,
    ...bounds,
    ...bounds.flatMap((bound) => [bound + 1, bound - 1]),
  ].filter(Number.isFinite);
  const step = Math.max(
    0,
    ...schemas.map((schema) =>
      "multipleOf" in schema ? (schema.multipleOf ?? 0) : 0,
    ),
  );
  if (step > 0 && Number.isFinite(step)) {
    for (const target of [...candidates]) {
      const start = Math.round(target / step);
      for (let offset = 0; offset < 64; offset++) {
        for (const direction of [1, -1]) {
          const value = Number(
            ((start + offset * direction) * step).toPrecision(15),
          );
          if (accepts(value)) {
            return value;
          }
        }
      }
    }
  }
  return candidates.find(accepts);
};
