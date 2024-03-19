import { ParseError } from "@effect/schema/ParseResult";
import { Data } from "effect";

import { VisitError } from "../internal/EncodeContext.js";

export type MalformedPropertyTypeReason =
  | "[INTERNAL] annotation missing"
  | "[INTERNAL] annotation is not a PropertyType";

export type EncodeErrorReason = Data.TaggedEnum<{
  MalformedPropertyType: { reason: MalformedPropertyTypeReason };
  InvalidUrl: { cause: ParseError };
  Visit: { cause: VisitError };
}>;
export const EncodeErrorReason = Data.taggedEnum<EncodeErrorReason>();

export class EncodeError extends Data.TaggedError(
  "@blockprotocol/graph/PropertyType/EncodeError",
)<{ reason: EncodeErrorReason }> {
  static malformedPropertyType(
    reason: MalformedPropertyTypeReason,
  ): EncodeError {
    return new EncodeError({
      reason: EncodeErrorReason.MalformedPropertyType({ reason }),
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
}
