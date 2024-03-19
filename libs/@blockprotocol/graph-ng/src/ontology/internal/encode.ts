import { Data, Either, Predicate } from "effect";

export class JsonSchemaTypeError extends Data.TaggedError(
  "JsonSchemaTypeError",
)<{
  key: string;
  isOptional: boolean;

  expectedType: string;
  receivedValue: unknown;
}> {}

const isNumberOrUndefined: (value: unknown) => value is number | undefined =
  Predicate.or(Predicate.isUndefined, Predicate.isNumber) as never;
const isStringOrUndefined: (value: unknown) => value is string | undefined =
  Predicate.or(Predicate.isUndefined, Predicate.isString) as never;

export function asNumberOrUndefined<
  S extends Record<string, unknown>,
  K extends keyof S,
>(schema: S, key: K): Either.Either<number | undefined, JsonSchemaTypeError> {
  const value = schema[key];

  if (isNumberOrUndefined(value)) {
    return Either.right(value);
  }

  return Either.left(
    new JsonSchemaTypeError({
      key: key as string, // safe because we know it's a string (see extends)
      isOptional: true,
      expectedType: "number",
      receivedValue: value,
    }),
  );
}

export function asStringOrUndefined<
  S extends Record<string, unknown>,
  K extends keyof S,
>(schema: S, key: K): Either.Either<string | undefined, JsonSchemaTypeError> {
  const value = schema[key];

  if (isStringOrUndefined(value)) {
    return Either.right(value);
  }

  return Either.left(
    new JsonSchemaTypeError({
      key: key as string, // safe because we know it's a string (see extends)
      isOptional: true,
      expectedType: "string",
      receivedValue: value,
    }),
  );
}
