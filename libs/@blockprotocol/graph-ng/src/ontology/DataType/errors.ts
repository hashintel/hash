import { Data } from "effect";

export type UnsupportedKeyword =
  | "never"
  | "unknown"
  | "any"
  | "symbol"
  | "undefined"
  | "void"
  | "unique symbol"
  | "tuple"
  | "type"
  | "object";

export type TypeLiteralReason =
  | "property signature present"
  | "index signature required"
  | "more than one index signature";

export type ValidationErrorReason = Data.TaggedEnum<{
  UnsupportedKeyword: {
    keyword: UnsupportedKeyword;
  };
  CustomTypeNotSupported: {};
  UnionNotSupported: {};
  RecursiveTypeNotSupported: {};
  TypeLiteral: {
    reason: TypeLiteralReason;
  };
}>;
export const ValidationErrorReason = Data.taggedEnum<ValidationErrorReason>();

export class ValidationError extends Data.TaggedError(
  "@blockprotocol/graph/DataType/ValidationError",
)<{ reason: ValidationErrorReason }> {}

export function unsupportedKeyword(
  keyword: UnsupportedKeyword,
): ValidationError {
  return new ValidationError({
    reason: ValidationErrorReason.UnsupportedKeyword({ keyword }),
  });
}

export function typeLiteral(reason: TypeLiteralReason): ValidationError {
  return new ValidationError({
    reason: ValidationErrorReason.TypeLiteral({ reason }),
  });
}
