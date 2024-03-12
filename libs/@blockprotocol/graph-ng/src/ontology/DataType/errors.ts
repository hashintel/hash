import { Data } from "effect";

export type UnsupportedKeyword =
  | "never"
  | "unknown"
  | "any"
  | "symbol"
  | "undefined"
  | "void"
  | "unique symbol";

export type ValidationErrorReason = Data.TaggedEnum<{
  UnsupportedKeyword: {
    keyword: UnsupportedKeyword;
  };
  UnionNotSupported: {};
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
