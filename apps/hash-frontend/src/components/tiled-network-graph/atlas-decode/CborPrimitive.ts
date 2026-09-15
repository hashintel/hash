/** CBOR visitors shared by document schemas. */
import * as Result from "./Result";
import * as TaggedError from "./TaggedError";

import type { CborVisitor, CborDecoderError } from "./CborDecoder";
import type { U64 } from "./Decoder";

/** An array length that differs from its enclosing schema's declaration. */
export interface ArrayVisitorErrorReason {
  readonly _tag: "length";
  readonly field: string;
  readonly expected: U64;
  readonly actual: number;
}

/** A rejected array length, independent of element decoding failures. */
export class ArrayVisitorError extends TaggedError.TaggedError<
  "ArrayVisitorError",
  ArrayVisitorErrorReason
> {
  /** Describes the expected and encoded array lengths. */
  constructor(reason: ArrayVisitorErrorReason) {
    let message: string;

    switch (reason._tag) {
      case "length":
        message = `${reason.field} requires ${reason.expected} entries, received ${reason.actual}`;
        break;
    }

    super("ArrayVisitorError", reason, message);
  }
}

/** Accepts unsigned integers without narrowing to JavaScript numbers. */
export const unsigned: CborVisitor<U64, never> = {
  expecting: "an unsigned integer",
  visitUnsignedInteger: Result.ok,
};

/** Accepts CBOR booleans. */
export const boolean: CborVisitor<boolean, never> = {
  expecting: "a boolean",
  visitBoolean: Result.ok,
};

/**
 * Collects array elements with their receiving visitor.
 *
 * When count is supplied, a length mismatch returns {@link ArrayVisitorError} before any element is visited. Element and CBOR errors propagate to the document decoder. Without count, only the decoder bounds the length.
 */
export const array = <T, E>(
  element: CborVisitor<T, E>,
  field: string,
  count?: U64,
): CborVisitor<T[], E | ArrayVisitorError> => ({
  expecting: field,
  visitArray: (access) =>
    Result.gen(function* readArray(): Result.gen.Return<
      T[],
      E | ArrayVisitorError | CborDecoderError
    > {
      if (count !== undefined && BigInt(access.remaining) !== count) {
        return yield* Result.err(
          new ArrayVisitorError({
            _tag: "length",
            field,
            expected: count,
            actual: access.remaining,
          }),
        );
      }

      const values: T[] = [];
      while (access.remaining > 0) {
        values.push(yield* access.readElement(element));
      }
      return values;
    }),
});
