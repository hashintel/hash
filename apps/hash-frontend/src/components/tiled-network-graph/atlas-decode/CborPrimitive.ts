/** CBOR visitors shared by document schemas. */
import * as Result from "./Result";
import * as TaggedError from "./TaggedError";

import type * as CborDecoder from "./CborDecoder";
import type * as Decoder from "./Decoder";

/** An array length that differs from its enclosing schema's declaration. */
export interface ArrayVisitorErrorReason {
  readonly _tag: "length";
  readonly field: string;
  readonly expected: Decoder.U64;
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
export const unsigned: CborDecoder.CborVisitor<Decoder.U64, never> = {
  expecting: "an unsigned integer",
  visitUnsignedInteger: Result.ok,
};

/** Accepts CBOR booleans. */
export const boolean: CborDecoder.CborVisitor<boolean, never> = {
  expecting: "a boolean",
  visitBoolean: Result.ok,
};

/** Accepts UTF-8 text strings. */
export const text: CborDecoder.CborVisitor<string, never> = {
  expecting: "a text string",
  visitTextString: Result.ok,
};

/**
 * Accepts null in addition to the element visitor's supported values.
 *
 * @returns The element's value or error, or null for an explicit CBOR null.
 */
export const nullable = <T, E>(
  element: Omit<CborDecoder.CborVisitor<T, E>, "visitNull">,
): CborDecoder.CborVisitor<T | null, E> => ({
  ...element,
  expecting: `${element.expecting} or null`,
  visitNull: () => Result.ok(null),
});

/**
 * Collects array elements with their receiving visitor.
 *
 * When count is supplied, a length mismatch returns {@link ArrayVisitorError} before any element is visited. Element and CBOR errors propagate to the document decoder. Without count, only the decoder bounds the length.
 */
export const array = <T, E>(
  element: CborDecoder.CborVisitor<T, E>,
  field: string,
  count?: Decoder.U64,
): CborDecoder.CborVisitor<T[], E | ArrayVisitorError> => ({
  expecting: field,
  visitArray: Result.fn(function* readArray(
    access: CborDecoder.CborArrayAccess,
  ): Result.gen.Return<
    T[],
    E | ArrayVisitorError | CborDecoder.CborDecoderError
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
