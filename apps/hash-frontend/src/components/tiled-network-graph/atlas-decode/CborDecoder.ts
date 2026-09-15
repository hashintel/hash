/**
 * Visitor-driven decoding of the Atlas CBOR profile.
 *
 * {@link CborDecoder} checks definite lengths, shortest integer encodings and strictly increasing unsigned map keys. Float visits retain the encoded f32 or f64 width. A {@link CborVisitor} constructs the result directly from those values.
 */

import * as Result from "./Result";
import * as TaggedError from "./TaggedError";

import type { F32, F64, U64 } from "./Decoder";

/** The encoded value category presented to a visitor. */
export type CborKind =
  | "unsigned-integer"
  | "negative-integer"
  | "byte-string"
  | "text-string"
  | "array"
  | "map"
  | "boolean"
  | "null"
  | "float32"
  | "float64";

/** A decoding failure independent of the visitor's domain errors. */
export type CborDecoderErrorReason =
  | { readonly _tag: "unexpected-end" }
  | { readonly _tag: "invalid-encoding"; readonly detail: string }
  | {
      readonly _tag: "unexpected-kind";
      readonly expected: string;
      readonly actual: CborKind;
    }
  | { readonly _tag: "invalid-utf8" }
  /** An unexpected exception, retained as the decoding error's cause. */
  | { readonly _tag: "exception" }
  | { readonly _tag: "nesting-limit"; readonly maximumDepth: number }
  | { readonly _tag: "unconsumed-container"; readonly remaining: number }
  | { readonly _tag: "trailing-data"; readonly remaining: number }
  | { readonly _tag: "invalid-access"; readonly detail: string };

/** A profile or visitation error with an offset relative to the input view. */
export class CborDecoderError extends TaggedError.TaggedError<"CborDecoderError"> {
  /** Records the failure at the byte where its check applies. */
  constructor(
    readonly reason: CborDecoderErrorReason,
    readonly offset: number,
    options?: ErrorOptions,
  ) {
    const detail =
      "detail" in reason
        ? reason.detail
        : reason._tag === "unexpected-kind"
          ? `expected ${reason.expected}, received ${reason.actual}`
          : reason._tag;

    super("CborDecoderError", `${detail} (at byte ${offset})`, options);
  }
}

/** Sequential access to a definite-length CBOR array. */
export interface CborArrayAccess {
  /** Number of elements not yet consumed. */
  readonly remaining: number;

  /**
   * Decodes the next element with its receiving visitor.
   *
   * Returns a decoding or visitor error. Reading past the declared length or outside the enclosing visit returns an invalid-access error.
   */
  readElement<T, E>(
    visitor: CborVisitor<T, E>,
  ): Result.Result<T, E | CborDecoderError>;
}

/** Sequential key/value access to a definite-length CBOR map. */
export interface CborMapAccess {
  /** Number of entries whose values have not yet been consumed. */
  readonly remaining: number;

  /**
   * Reads the next strictly increasing unsigned key.
   *
   * Returns a decoding error for a malformed key. Each key must be followed by {@link CborMapAccess.readValue} before another key is read.
   */
  readKey(): Result.Result<U64, CborDecoderError>;

  /**
   * Decodes the current key's value with its receiving visitor.
   *
   * Returns a decoding or visitor error. Reading without a key or outside the enclosing visit returns an invalid-access error.
   */
  readValue<T, E>(
    visitor: CborVisitor<T, E>,
  ): Result.Result<T, E | CborDecoderError>;
}

/**
 * Construction of a value from its encoded CBOR category.
 *
 * Implement the visits the value accepts. An omitted visit produces an unexpected-kind error naming {@link CborVisitor.expecting}. Integer values remain exact as bigint, and byte strings borrow the input buffer.
 *
 * A successful container visit consumes every entry through its access object. A read must finish before another begins on the same access object. Access closes when its visit returns. Returned visitor errors propagate unchanged. Unexpected exceptions become {@link CborDecoderError} values at {@link CborDecoder.decode}.
 */
export interface CborVisitor<T, E> {
  /** The expected domain value, used when an encoded category is unsupported. */
  readonly expecting: string;

  /** Constructs a value from an integer in [0, 2⁶⁴ − 1]. */
  visitUnsignedInteger?(value: U64): Result.Result<T, E | CborDecoderError>;

  /** Constructs a value from an integer in [−2⁶⁴, −1]. */
  visitNegativeInteger?(value: bigint): Result.Result<T, E | CborDecoderError>;

  /** Constructs a value from a view of the encoded bytes. */
  visitByteString?(value: Uint8Array): Result.Result<T, E | CborDecoderError>;

  /** Constructs a value from valid UTF-8 text, including any leading U+FEFF. */
  visitTextString?(value: string): Result.Result<T, E | CborDecoderError>;

  /** Constructs a value from an array's elements. */
  visitArray?(array: CborArrayAccess): Result.Result<T, E | CborDecoderError>;

  /** Constructs a value from a map's entries. */
  visitMap?(map: CborMapAccess): Result.Result<T, E | CborDecoderError>;

  /** Constructs a value from a boolean. */
  visitBoolean?(value: boolean): Result.Result<T, E | CborDecoderError>;

  /** Constructs a value from null. */
  visitNull?(): Result.Result<T, E | CborDecoderError>;

  /** Constructs a value from an encoded IEEE 754 single-precision float. */
  visitFloat32?(value: F32): Result.Result<T, E | CborDecoderError>;

  /** Constructs a value from an encoded IEEE 754 double-precision float. */
  visitFloat64?(value: F64): Result.Result<T, E | CborDecoderError>;
}

/** A recursion bound for nested visitor calls. */
export interface CborDecoderOptions {
  /** Maximum value depth, with the root at zero. Defaults to 16. */
  readonly maximumDepth: number;
}

/**
 * A single-payload decoder that constructs values through a {@link CborVisitor}.
 *
 * Byte strings are views of the input, and text strings allocate their decoded text. Container storage belongs to the visitor. Keep the input buffer attached and unchanged during decoding.
 *
 * @example
 * ```ts
 * const integer: CborVisitor<U64, never> = {
 *   expecting: "an unsigned integer",
 *   visitUnsignedInteger: Result.ok,
 * };
 * const result = new CborDecoder(Uint8Array.of(0x18, 0x2a)).decode(integer);
 * // result is Ok(42n).
 * ```
 */
export class CborDecoder<T extends ArrayBufferLike> {
  readonly #buffer: Uint8Array<T>;
  readonly #view: DataView<T>;
  readonly #maximumDepth: number;
  readonly #utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
  #offset = 0;
  #state: "ready" | "decoding" | "finished" = "ready";
  #error: CborDecoderError | undefined;

  /**
   * Borrows one complete CBOR payload, including a possible buffer subview.
   *
   * @throws {RangeError} If maximumDepth is not a nonnegative safe integer.
   */
  constructor(
    buffer: Uint8Array<T>,
    { maximumDepth = 16 }: Partial<Readonly<CborDecoderOptions>> = {},
  ) {
    if (!Number.isSafeInteger(maximumDepth) || maximumDepth < 0) {
      throw new RangeError("maximumDepth must be a nonnegative safe integer");
    }

    this.#buffer = buffer;
    this.#view = new DataView(
      buffer.buffer,
      buffer.byteOffset,
      buffer.byteLength,
    );
    this.#maximumDepth = maximumDepth;
  }

  /** Records the first decoding failure and prevents subsequent reads. */
  #fail(
    reason: CborDecoderErrorReason,
    offset = this.#offset,
    options?: ErrorOptions,
  ): Result.Result<never, CborDecoderError> {
    this.#error ??= new CborDecoderError(reason, offset, options);

    return Result.err(this.#error);
  }

  /** Reserves an in-bounds byte range, returning its starting offset or a decoding error. */
  #take(length: number): Result.Result<number, CborDecoderError> {
    if (this.#error) {
      return Result.err(this.#error);
    }

    if (length > this.#buffer.byteLength - this.#offset) {
      return this.#fail({ _tag: "unexpected-end" });
    }

    const start = this.#offset;
    this.#offset += length;
    return Result.ok(start);
  }

  /** Reads a shortest-form unsigned argument or returns a profile error. */
  #argument(
    info: number,
    offset: number,
  ): Result.Result<U64, CborDecoderError> {
    if (info < 24) {
      return Result.ok(BigInt(info) as U64);
    }

    if (info > 27) {
      return this.#fail(
        { _tag: "invalid-encoding", detail: "indefinite or reserved argument" },
        offset,
      );
    }

    const width = 2 ** (info - 24);
    const start = this.#take(width);
    if (Result.isErr(start)) {
      return Result.err(start.error);
    }

    const value =
      width === 1
        ? BigInt(this.#view.getUint8(start.value))
        : width === 2
          ? BigInt(this.#view.getUint16(start.value, false))
          : width === 4
            ? BigInt(this.#view.getUint32(start.value, false))
            : this.#view.getBigUint64(start.value, false);

    const minimum = width === 1 ? 24n : 2n ** BigInt(width * 4);

    if (value < minimum) {
      return this.#fail(
        {
          _tag: "invalid-encoding",
          detail: "argument is not shortest-form encoded",
        },
        offset,
      );
    }

    return Result.ok(value as U64);
  }

  /** Narrows a length only when the remaining bytes can contain its items. */
  #length(
    value: U64,
    minimumBytes: number,
  ): Result.Result<number, CborDecoderError> {
    const available = Math.floor(
      (this.#buffer.byteLength - this.#offset) / minimumBytes,
    );

    if (value > BigInt(available)) {
      return this.#fail({ _tag: "unexpected-end" });
    }

    return Result.ok(Number(value));
  }

  /** Reports an encoded category that the receiving visitor does not accept. */
  #unexpected(
    expected: string,
    actual: CborKind,
    offset: number,
  ): Result.Result<never, CborDecoderError> {
    return this.#fail({ _tag: "unexpected-kind", expected, actual }, offset);
  }

  /** Dispatches one encoded value to its visitor, returning decoding or visitor errors. */
  #read<V, E>(
    visitor: CborVisitor<V, E>,
    depth: number,
  ): Result.Result<V, E | CborDecoderError> {
    if (depth > this.#maximumDepth) {
      return this.#fail({
        _tag: "nesting-limit",
        maximumDepth: this.#maximumDepth,
      });
    }

    const start = this.#take(1);
    if (Result.isErr(start)) {
      return Result.err(start.error);
    }

    const offset = start.value;
    const head = this.#view.getUint8(offset);
    const major = Math.floor(head / 32);
    const info = head % 32;
    if (major === 7) {
      return this.#simple(visitor, info, offset);
    }

    if (major === 6) {
      return this.#fail(
        { _tag: "invalid-encoding", detail: "tags are outside the profile" },
        offset,
      );
    }

    const argument = this.#argument(info, offset);
    if (Result.isErr(argument)) {
      return Result.err(argument.error);
    }

    if (major === 0) {
      return (
        visitor.visitUnsignedInteger?.(argument.value) ??
        this.#unexpected(visitor.expecting, "unsigned-integer", offset)
      );
    }

    if (major === 1) {
      return (
        visitor.visitNegativeInteger?.(-1n - argument.value) ??
        this.#unexpected(visitor.expecting, "negative-integer", offset)
      );
    }

    const length = this.#length(argument.value, major === 5 ? 2 : 1);
    if (Result.isErr(length)) {
      return Result.err(length.error);
    }

    if (major === 4) {
      return this.#array(visitor, length.value, depth, offset);
    }

    if (major === 5) {
      return this.#map(visitor, length.value, depth, offset);
    }

    const payload = this.#take(length.value);
    if (Result.isErr(payload)) {
      return Result.err(payload.error);
    }

    const bytes = this.#buffer.subarray(
      payload.value,
      payload.value + length.value,
    );

    if (major === 2) {
      return (
        visitor.visitByteString?.(bytes) ??
        this.#unexpected(visitor.expecting, "byte-string", offset)
      );
    }

    let text: string;
    try {
      text = this.#utf8.decode(bytes);
    } catch (cause) {
      return this.#fail({ _tag: "invalid-utf8" }, payload.value, { cause });
    }

    return (
      visitor.visitTextString?.(text) ??
      this.#unexpected(visitor.expecting, "text-string", offset)
    );
  }

  /** Reads supported simple values and floats, or returns a profile or visitor error. */
  #simple<V, E>(
    visitor: CborVisitor<V, E>,
    info: number,
    offset: number,
  ): Result.Result<V, E | CborDecoderError> {
    if (info === 20 || info === 21) {
      return (
        visitor.visitBoolean?.(info === 21) ??
        this.#unexpected(visitor.expecting, "boolean", offset)
      );
    }

    if (info === 22) {
      return (
        visitor.visitNull?.() ??
        this.#unexpected(visitor.expecting, "null", offset)
      );
    }

    if (info !== 26 && info !== 27) {
      return this.#fail(
        {
          _tag: "invalid-encoding",
          detail: "unsupported simple value or float width",
        },
        offset,
      );
    }

    const start = this.#take(info === 26 ? 4 : 8);
    if (Result.isErr(start)) {
      return Result.err(start.error);
    }

    if (info === 26) {
      return (
        visitor.visitFloat32?.(
          this.#view.getFloat32(start.value, false) as F32,
        ) ?? this.#unexpected(visitor.expecting, "float32", offset)
      );
    }
    return (
      visitor.visitFloat64?.(
        this.#view.getFloat64(start.value, false) as F64,
      ) ?? this.#unexpected(visitor.expecting, "float64", offset)
    );
  }

  /** Visits an array and checks complete consumption before returning its value. */
  #array<V, E>(
    visitor: CborVisitor<V, E>,
    length: number,
    depth: number,
    offset: number,
  ): Result.Result<V, E | CborDecoderError> {
    let remaining = length;
    let active = true;

    const access: CborArrayAccess = {
      get remaining() {
        return remaining;
      },
      readElement: (elementVisitor) => {
        if (!active || remaining === 0) {
          return this.#fail({
            _tag: "invalid-access",
            detail: "array access is closed or exhausted",
          });
        }
        active = false;
        try {
          const result = this.#read(elementVisitor, depth + 1);
          if (Result.isOk(result)) {
            remaining -= 1;
          }
          return result;
        } finally {
          active = true;
        }
      },
    };

    try {
      const result =
        visitor.visitArray?.(access) ??
        this.#unexpected(visitor.expecting, "array", offset);

      if (Result.isErr(result)) {
        return result;
      }

      if (remaining !== 0) {
        return this.#fail({ _tag: "unconsumed-container", remaining });
      }

      return result;
    } finally {
      active = false;
    }
  }

  /** Reads a strictly increasing unsigned map key. */
  #key(previous: bigint): Result.Result<U64, CborDecoderError> {
    const start = this.#take(1);
    if (Result.isErr(start)) {
      return Result.err(start.error);
    }

    const head = this.#view.getUint8(start.value);
    if (head >= 32) {
      return this.#fail(
        {
          _tag: "invalid-encoding",
          detail: "map keys must be unsigned integers",
        },
        start.value,
      );
    }

    const key = this.#argument(head, start.value);
    if (Result.isErr(key)) {
      return key;
    }

    if (key.value <= previous) {
      return this.#fail(
        {
          _tag: "invalid-encoding",
          detail: "map keys must be strictly increasing",
        },
        start.value,
      );
    }

    return key;
  }

  /** Visits a map while enforcing key/value order and complete consumption. */
  #map<V, E>(
    visitor: CborVisitor<V, E>,
    length: number,
    depth: number,
    offset: number,
  ): Result.Result<V, E | CborDecoderError> {
    let remaining = length;
    let previous = -1n;
    let pendingValue = false;
    let active = true;

    const access: CborMapAccess = {
      get remaining() {
        return remaining;
      },
      readKey: () => {
        if (!active || remaining === 0 || pendingValue) {
          return this.#fail({
            _tag: "invalid-access",
            detail: "map access requires an unread key",
          });
        }

        const key = this.#key(previous);
        if (Result.isOk(key)) {
          previous = key.value;
          pendingValue = true;
        }

        return key;
      },
      readValue: (valueVisitor) => {
        if (!active || !pendingValue) {
          return this.#fail({
            _tag: "invalid-access",
            detail: "map access requires a preceding key",
          });
        }

        active = false;
        try {
          const result = this.#read(valueVisitor, depth + 1);
          if (Result.isOk(result)) {
            pendingValue = false;
            remaining -= 1;
          }
          return result;
        } finally {
          active = true;
        }
      },
    };

    try {
      const result =
        visitor.visitMap?.(access) ??
        this.#unexpected(visitor.expecting, "map", offset);
      if (Result.isErr(result)) {
        return result;
      }
      if (remaining !== 0) {
        return this.#fail({ _tag: "unconsumed-container", remaining });
      }
      return result;
    } finally {
      active = false;
    }
  }

  /**
   * Constructs a value from exactly one complete payload.
   *
   * Returns a {@link CborDecoderError} for malformed encoding, incomplete container consumption, trailing bytes or repeated decoding. Returned visitor errors propagate unchanged. An unexpected exception becomes an exception error with the thrown value as its cause, unless a decoding error was already recorded. The decoder is consumed even when decoding fails.
   */
  decode<V, E>(
    visitor: CborVisitor<V, E>,
  ): Result.Result<V, E | CborDecoderError> {
    if (this.#state !== "ready") {
      return this.#fail({
        _tag: "invalid-access",
        detail: "decoder has already been used",
      });
    }

    this.#state = "decoding";
    try {
      const result = this.#read(visitor, 0);
      if (this.#error) {
        return Result.err(this.#error);
      }

      if (Result.isErr(result)) {
        return result;
      }

      if (this.#offset !== this.#buffer.byteLength) {
        return this.#fail({
          _tag: "trailing-data",
          remaining: this.#buffer.byteLength - this.#offset,
        });
      }

      return result;
    } catch (cause) {
      return this.#fail({ _tag: "exception" }, this.#offset, { cause });
    } finally {
      this.#state = "finished";
    }
  }
}
