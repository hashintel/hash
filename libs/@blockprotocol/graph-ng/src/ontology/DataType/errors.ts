import { Data } from "effect";

export type UnsupportedType =
  | "any"
  | "bigint"
  | "symbol"
  | "object"
  | "tuple"
  | "array"
  | "struct";

export type UnsupportedKeyword =
  | "undefined"
  | "void"
  | "never"
  | "unknown"
  | "unique symbol";

export type UnsupportedNode = "Declaration" | "Union";

export type UnsupportedLiteral = "bigint";

export type TypeLiteralReason =
  | "property signature present"
  | "index signature required"
  | "more than one index signature";

export type ExpectedJsonAnnotationType = "string" | "number";

export type MalformedRecordReason =
  | "index signature required"
  | "more than one index signature";

export type MalformedEnumReason =
  | "non-consecutive integer values"
  | "floating point values"
  | "empty"
  | "mixed";

export type MalformedDataTypeReason =
  | "[INTERNAL] annotation missing"
  | "[INTERNAL] annotation is not a DataType"
  | "title annotation missing";

export type ValidationErrorReason = Data.TaggedEnum<{
  UnsupportedKeyword: {
    keyword: UnsupportedKeyword;
  };
  UnsupportedType: {
    type: UnsupportedType;
  };
  UnsupportedNode: {
    node: UnsupportedNode;
  };
  CyclicSchema: {};
  TypeLiteral: {
    reason: TypeLiteralReason;
  };
  MalformedDataType: {
    reason: MalformedDataTypeReason;
  };
  UnsupportedLiteral: {
    literal: UnsupportedLiteral;
  };
  UnsupportedJsonAnnotationType: {
    field: string;

    optional: boolean;
    expected: ExpectedJsonAnnotationType;
    received: string;
  };
  MalformedEnum: {
    reason: MalformedEnumReason;
  };
  MalformedRecord: {
    reason: MalformedRecordReason;
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

  static unsupportedType(type: UnsupportedType): EncodeError {
    return new EncodeError({
      reason: EncodeErrorReason.UnsupportedType({ type }),
    });
  }

  static unsupportedNode(node: UnsupportedNode): EncodeError {
    return new EncodeError({
      reason: EncodeErrorReason.UnsupportedNode({ node }),
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

  static malformedDataType(reason: MalformedDataTypeReason): EncodeError {
    return new EncodeError({
      reason: EncodeErrorReason.MalformedDataType({ reason }),
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

  static malformedEnum(reason: MalformedEnumReason): EncodeError {
    return new EncodeError({
      reason: EncodeErrorReason.MalformedEnum({ reason }),
    });
  }
}
