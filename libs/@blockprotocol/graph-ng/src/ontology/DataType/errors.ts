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

export type UnsupportedLiteral = "bigint";

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
  CyclicSchema: {};
  TypeLiteral: {
    reason: TypeLiteralReason;
  };
  // The DataType annotation is missing
  DataTypeMalformed: {};
  NoTitle: {};
  UnsupportedLiteral: {
    literal: UnsupportedLiteral;
  };
}>;
export const EncodeErrorReason = Data.taggedEnum<ValidationErrorReason>();

export class EncodeError extends Data.TaggedError(
  "@blockprotocol/graph/DataType/ValidationError",
)<{ reason: ValidationErrorReason }> {
  static unsupportedKeyword(keyword: UnsupportedKeyword): EncodeError {
    return new EncodeError({
      reason: EncodeErrorReason.UnsupportedKeyword({ keyword }),
    });
  }

  static customTypeNotSupported(): EncodeError {
    return new EncodeError({
      reason: EncodeErrorReason.CustomTypeNotSupported(),
    });
  }

  static unionNotSupported(): EncodeError {
    return new EncodeError({
      reason: EncodeErrorReason.UnionNotSupported(),
    });
  }

  static cyclicSchema(): EncodeError {
    return new EncodeError({
      reason: EncodeErrorReason.CyclicSchema(),
    });
  }

  static typeLiteral(reason: TypeLiteralReason): EncodeError {
    return new EncodeError({
      reason: EncodeErrorReason.TypeLiteral({ reason }),
    });
  }

  static dataTypeMalformed(): EncodeError {
    return new EncodeError({
      reason: EncodeErrorReason.DataTypeMalformed(),
    });
  }

  static noTitle(): EncodeError {
    return new EncodeError({
      reason: EncodeErrorReason.NoTitle(),
    });
  }

  static unsupportedLiteral(literal: UnsupportedLiteral): EncodeError {
    return new EncodeError({
      reason: EncodeErrorReason.UnsupportedLiteral({ literal }),
    });
  }
}
