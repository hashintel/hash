import { ParseError } from "@effect/schema/ParseResult";
import { Data } from "effect";
import { VisitError } from "../internal/EncodeContext.js";
import { JsonSchemaTypeError } from "../internal/encode.js";

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

export type IncompleteReason = "missing title";

export type MalformedRecordReason =
  | "index signature required"
  | "more than one index signature"
  | "parameter must be a string"
  | "value is not of type `Json.Value`";

export type MalformedEnumReason =
  | "non-consecutive integer values"
  | "floating point values"
  | "empty"
  | "mixed";

export type EncodeErrorReason = Data.TaggedEnum<{
  UnsupportedKeyword: {
    keyword: UnsupportedKeyword;
  };
  UnsupportedType: {
    type: UnsupportedType;
  };
  UnsupportedNode: {
    node: UnsupportedNode;
  };
  Visit: {
    cause: VisitError;
  };
  Internal: {
    cause: InternalError;
  };
  UnsupportedLiteral: {
    literal: UnsupportedLiteral;
  };
  JsonSchema: {
    cause: JsonSchemaTypeError;
  };
  InvalidUrl: {
    cause: ParseError;
  };
  MalformedEnum: {
    reason: MalformedEnumReason;
  };
  MalformedRecord: {
    reason: MalformedRecordReason;
  };
  Incomplete: {
    reason: IncompleteReason;
  };
}>;
export const EncodeErrorReason = Data.taggedEnum<EncodeErrorReason>();

export class EncodeError extends Data.TaggedError(
  "@blockprotocol/graph/DataType/EncodeError",
)<{ reason: EncodeErrorReason }> {
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

  static visit(this: void, cause: VisitError): EncodeError {
    return new EncodeError({
      reason: EncodeErrorReason.Visit({ cause }),
    });
  }

  static internal(this: void, cause: InternalError): EncodeError {
    return new EncodeError({
      reason: EncodeErrorReason.Internal({ cause }),
    });
  }

  static unsupportedLiteral(literal: UnsupportedLiteral): EncodeError {
    return new EncodeError({
      reason: EncodeErrorReason.UnsupportedLiteral({ literal }),
    });
  }

  static jsonSchema(this: void, cause: JsonSchemaTypeError): EncodeError {
    return new EncodeError({
      reason: EncodeErrorReason.JsonSchema({ cause }),
    });
  }

  static malformedEnum(reason: MalformedEnumReason): EncodeError {
    return new EncodeError({
      reason: EncodeErrorReason.MalformedEnum({ reason }),
    });
  }

  static malformedRecord(reason: MalformedRecordReason): EncodeError {
    return new EncodeError({
      reason: EncodeErrorReason.MalformedRecord({ reason }),
    });
  }

  static invalidUrl(cause: ParseError): EncodeError {
    return new EncodeError({
      reason: EncodeErrorReason.InvalidUrl({ cause }),
    });
  }

  static incomplete(reason: IncompleteReason): EncodeError {
    return new EncodeError({
      reason: EncodeErrorReason.Incomplete({ reason }),
    });
  }
}

export type DecodeErrorReason = Data.TaggedEnum<{
  Encode: {
    cause: EncodeError;
  };
}>;

export const DecodeErrorReason = Data.taggedEnum<DecodeErrorReason>();

export class DecodeError extends Data.TaggedError(
  "@blockprotocol/graph/DataType/DecodeError",
)<{ reason: DecodeErrorReason }> {
  static encode(cause: EncodeError): DecodeError {
    return new DecodeError({
      reason: DecodeErrorReason.Encode({ cause }),
    });
  }
}

export type AnnotationErrorReason =
  | "missing"
  | "expected function"
  | "expected function to return `DataType`";

export type InternalErrorReason = Data.TaggedEnum<{
  Annotation: {
    reason: AnnotationErrorReason;
  };
}>;
export const InternalErrorReason = Data.taggedEnum<InternalErrorReason>();

export class InternalError extends Data.TaggedError(
  "@blockprotocol/graph/DataType/InternalError",
)<{ reason: InternalErrorReason }> {
  static annotation(reason: AnnotationErrorReason): InternalError {
    return new InternalError({
      reason: InternalErrorReason.Annotation({ reason }),
    });
  }
}
