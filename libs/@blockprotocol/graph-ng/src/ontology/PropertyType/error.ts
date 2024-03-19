import { ParseError } from "@effect/schema/ParseResult";
import { Data } from "effect";

import { InternalError } from "../DataType/error.js";
import { JsonSchemaTypeError } from "../internal/encode.js";
import { VisitError } from "../internal/EncodeContext.js";
import { AST } from "@effect/schema";

export type IncompleteReason = "missing title";

export type MalformedPropertyObjectReason =
  | "records are unsupported"
  | "expected string key"
  | "key is not BaseUrl of PropertyTypeUrl"
  | "expected PropertyType as value";

export type MalformedArrayReason =
  | "tuple with rest elements are unsupported"
  | "tuple with trailing elements are unsupported"
  | "optional tuple elements are unsupported"
  | "tuple elements must be the same";

export type EncodeErrorReason = Data.TaggedEnum<{
  Internal: { cause: InternalError };
  InvalidUrl: { cause: ParseError };
  Visit: { cause: VisitError };
  JsonSchema: { cause: JsonSchemaTypeError };
  Incomplete: { reason: IncompleteReason };
  MalformedPropertyObject: { reason: MalformedPropertyObjectReason };
  MalformedArray: { reason: MalformedArrayReason };
  UnableToEncode: { node: AST.AST };
}>;
export const EncodeErrorReason = Data.taggedEnum<EncodeErrorReason>();

export class EncodeError extends Data.TaggedError(
  "@blockprotocol/graph/PropertyType/EncodeError",
)<{ reason: EncodeErrorReason }> {
  static internal(this: void, cause: InternalError): EncodeError {
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

  static malformedPropertyObject(
    reason: MalformedPropertyObjectReason,
  ): EncodeError {
    return new EncodeError({
      reason: EncodeErrorReason.MalformedPropertyObject({ reason }),
    });
  }

  static malformedArray(reason: MalformedArrayReason): EncodeError {
    return new EncodeError({
      reason: EncodeErrorReason.MalformedArray({ reason }),
    });
  }

  static incomplete(reason: IncompleteReason): EncodeError {
    return new EncodeError({
      reason: EncodeErrorReason.Incomplete({ reason }),
    });
  }

  static unableToEncode(node: AST.AST): EncodeError {
    return new EncodeError({
      reason: EncodeErrorReason.UnableToEncode({ node }),
    });
  }
}
