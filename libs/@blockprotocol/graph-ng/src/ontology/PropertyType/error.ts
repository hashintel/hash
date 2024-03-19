import { ParseError } from "@effect/schema/ParseResult";
import { Data } from "effect";

import { VisitError } from "../internal/EncodeContext.js";
import { JsonSchemaTypeError } from "../internal/encode.js";
import { InternalError } from "../DataType/error.js";

export type MalformedRecordReason = "expected string key";

export type IncompleteReason = "missing title";

export type EncodeErrorReason = Data.TaggedEnum<{
  Internal: { cause: InternalError };
  InvalidUrl: { cause: ParseError };
  Visit: { cause: VisitError };
  JsonSchema: { cause: JsonSchemaTypeError };
  MalformedRecord: { reason: MalformedRecordReason };
  Incomplete: { reason: IncompleteReason };
}>;
export const EncodeErrorReason = Data.taggedEnum<EncodeErrorReason>();

export class EncodeError extends Data.TaggedError(
  "@blockprotocol/graph/PropertyType/EncodeError",
)<{ reason: EncodeErrorReason }> {
  static internal(cause: InternalError): EncodeError {
    return new EncodeError({
      reason: EncodeErrorReason.Internal({ cause }),
    });
  }

  static invalidUrl(cause: ParseError): EncodeError {
    return new EncodeError({
      reason: EncodeErrorReason.InvalidUrl({ cause }),
    });
  }

  static visit(this: void, cause: VisitError): EncodeError {
    return new EncodeError({
      reason: EncodeErrorReason.Visit({ cause }),
    });
  }

  static jsonSchema(this: void, cause: JsonSchemaTypeError): EncodeError {
    return new EncodeError({
      reason: EncodeErrorReason.JsonSchema({ cause }),
    });
  }

  static malformedRecord(reason: MalformedRecordReason): EncodeError {
    return new EncodeError({
      reason: EncodeErrorReason.MalformedRecord({ reason }),
    });
  }

  static incomplete(reason: IncompleteReason): EncodeError {
    return new EncodeError({
      reason: EncodeErrorReason.Incomplete({ reason }),
    });
  }
}
