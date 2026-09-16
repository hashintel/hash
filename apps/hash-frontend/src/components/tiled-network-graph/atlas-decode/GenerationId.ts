import * as Result from "./Result";
import * as TaggedError from "./TaggedError";

import type * as CborDecoder from "./CborDecoder";

/** A malformed binary or hexadecimal generation identity. */
export type GenerationIdErrorReason =
  | { readonly _tag: "invalid-length"; readonly byteLength: number }
  | { readonly _tag: "invalid-hex" };

/** An invalid generation identity representation. */
export class GenerationIdError extends TaggedError.TaggedError<
  "GenerationIdError",
  GenerationIdErrorReason
> {
  /** Describes the rejected representation. */
  constructor(reason: GenerationIdErrorReason) {
    let message: string;
    switch (reason._tag) {
      case "invalid-length":
        message = `generation identity requires 32 bytes, received ${reason.byteLength}`;
        break;
      case "invalid-hex":
        message =
          "generation identity requires 64 lowercase hexadecimal digits";
        break;
    }

    super("GenerationIdError", reason, message);
  }
}

/** A 32-byte generation identity, borrowed from binary input or allocated by {@link GenerationId.fromHex}. */
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

  /**
   * Decodes the canonical hexadecimal identity used by JSON responses.
   *
   * Returns {@link GenerationIdError} unless the input contains exactly 64 lowercase hexadecimal digits. Success allocates a new 32-byte buffer.
   */
  static fromHex(
    value: string,
  ): Result.Result<GenerationId, GenerationIdError> {
    if (value.length !== 64 || /[^0-9a-f]/u.test(value)) {
      return Result.err(new GenerationIdError({ _tag: "invalid-hex" }));
    }

    const bytes = new Uint8Array(32);
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
    }
    return Result.ok(new GenerationId(bytes));
  }

  /** Formats the identity as 64 lowercase hexadecimal digits, preserving leading zeroes. */
  toString(): string {
    let hex = "";
    for (const byte of this.#inner) {
      hex += byte.toString(16).padStart(2, "0");
    }
    return hex;
  }

  /** The generation identity's bytes, sharing its storage. */
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
