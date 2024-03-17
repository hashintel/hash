import { Data } from "effect";

export type UnsupportedType = "any" | "bigint" | "symbol" | "object";

export type UnsupportedKeyword =
  | "undefined"
  | "void"
  | "never"
  | "unknown"
  | "unique symbol";

export type UnsupportedLiteral = "bigint";

export type TypeLiteralReason =
  | "property signature present"
  | "index signature required"
  | "more than one index signature";

export type ExpectedJsonAnnotationType = "string" | "number";

export type ValidationErrorReason = Data.TaggedEnum<{
  UnsupportedKeyword: {
    keyword: UnsupportedKeyword;
  };
  UnsupportedType: {
    type: UnsupportedType;
  };
  UnsupportedDeclaredType: {};
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
  UnsupportedJsonAnnotationType: {
    field: string;

    optional: boolean;
    expected: ExpectedJsonAnnotationType;
    received: string;
  };
  MixedEnum: {};
  EmptyEnum: {};
  FloatingPointEnum: {};
  NonConsecutiveIntegerEnum: {};
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

  static unsupportedType(type: UnsupportedType): EncodeError {
    return new EncodeError({
      reason: EncodeErrorReason.UnsupportedType({ type }),
    });
  }

  static unsupportedDeclaredType(): EncodeError {
    return new EncodeError({
      reason: EncodeErrorReason.UnsupportedDeclaredType(),
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

  static unsupportedJsonAnnotationType(
    field: string,

    optional: boolean,
    expected: ExpectedJsonAnnotationType,
    received: string,
  ): EncodeError {
    return new EncodeError({
      reason: EncodeErrorReason.UnsupportedJsonAnnotationType({
        field,
        optional,
        expected,
        received,
      }),
    });
  }

  static mixedEnum(): EncodeError {
    return new EncodeError({
      reason: EncodeErrorReason.MixedEnum(),
    });
  }

  static emptyEnum(): EncodeError {
    return new EncodeError({
      reason: EncodeErrorReason.EmptyEnum(),
    });
  }

  static floatingPointEnum(): EncodeError {
    return new EncodeError({
      reason: EncodeErrorReason.FloatingPointEnum(),
    });
  }

  static nonConsecutiveIntegerEnum(): EncodeError {
    return new EncodeError({
      reason: EncodeErrorReason.NonConsecutiveIntegerEnum(),
    });
  }
}
