import * as Result from "./Result";
import * as TaggedError from "./TaggedError";

import type * as CborDecoder from "./CborDecoder";

/** A rejected generation identity byte length. */
export interface GenerationIdErrorReason {
  readonly _tag: "invalid-length";
  readonly byteLength: number;
}

/** A generation identity whose byte length is not 32. */
export class GenerationIdError extends TaggedError.TaggedError<
  "GenerationIdError",
  GenerationIdErrorReason
> {
  /** Describes the rejected byte length. */
  constructor(reason: GenerationIdErrorReason) {
    let message: string;

    switch (reason._tag) {
      case "invalid-length":
        message = `generation identity requires 32 bytes, received ${reason.byteLength}`;
        break;
    }

    super("GenerationIdError", reason, message);
  }
}

/** A borrowed, 32-byte generation identity. */
export class GenerationId {
  readonly #inner: Uint8Array;

  /**
   * Borrows a generation identity.
   *
   * @throws {GenerationIdError} If the byte length is not 32.
   */
  constructor(inner: Uint8Array) {
    if (inner.byteLength !== 32) {
      throw new GenerationIdError({
        _tag: "invalid-length",
        byteLength: inner.byteLength,
      });
    }
    this.#inner = inner;
  }

  /** The borrowed generation identity bytes. */
  get bytes(): Uint8Array {
    return this.#inner;
  }
}

/** Constructs a generation identity from a CBOR byte string. */
export const Visitor: CborDecoder.CborVisitor<GenerationId, GenerationIdError> =
  {
    expecting: "a 32-byte generation identity",
    visitByteString: (value) =>
      Result.catch(
        () => Result.ok(new GenerationId(value)),
        (cause) => {
          if (cause instanceof GenerationIdError) {
            return Result.err(cause);
          }

          throw cause;
        },
      ),
  };
