import * as Result from "./Result";
import * as TaggedError from "./TaggedError";

import type { Brand } from "@blockprotocol/type-system";

export type U8 = Brand<number, "u8">;
export type U16 = Brand<number, "u16">;
export type U32 = Brand<number, "u32">;
export type U64 = Brand<bigint, "u64">;
export type I8 = Brand<number, "i8">;
export type I16 = Brand<number, "i16">;
export type I32 = Brand<number, "i32">;
export type I64 = Brand<bigint, "i64">;
export type F32 = Brand<number, "f32">;
export type F64 = Brand<number, "f64">;

/** A byte-range or text-decoding failure. */
export type DecoderErrorReason =
  | {
      readonly _tag: "invalid-range";
      readonly byteOffset: number;
      readonly byteLength: number;
    }
  | {
      readonly _tag: "eof";

      readonly byteLength: number;
      readonly requestedByteLength: number;
    }
  | {
      readonly _tag: "invalid-string";
    };

/** A rejected byte read with its range or UTF-8 failure. */
export class DecoderError extends TaggedError.TaggedError<
  "DecoderError",
  DecoderErrorReason
> {
  /** Describes the read failure and retains an optional cause. */
  constructor(reason: DecoderErrorReason, options?: ErrorOptions) {
    let message: string;

    switch (reason._tag) {
      case "eof":
        message = `end of input (${reason.byteLength} bytes, requested ${reason.requestedByteLength} bytes)`;
        break;
      case "invalid-range":
        message = `invalid byte range: offset ${reason.byteOffset}, length ${reason.byteLength}`;
        break;
      case "invalid-string":
        message = "invalid UTF-8 string";
        break;
    }

    super("DecoderError", reason, message, options);
  }
}

export class Decoder<T extends ArrayBufferLike> {
  #view: DataView<T>;
  #byteOffset: number;

  constructor(view: DataView<T>) {
    this.#view = view;
    this.#byteOffset = 0;
  }

  #checkLength(
    byteOffset: number,
    byteLength: number,
  ): Result.Result<void, DecoderError> {
    if (
      !Number.isSafeInteger(byteOffset) ||
      byteOffset < 0 ||
      !Number.isSafeInteger(byteLength) ||
      byteLength < 0
    ) {
      return Result.err(
        new DecoderError({ _tag: "invalid-range", byteOffset, byteLength }),
      );
    }

    if (
      byteOffset > this.#view.byteLength ||
      byteLength > this.#view.byteLength - byteOffset
    ) {
      return Result.err(
        new DecoderError({
          _tag: "eof",
          byteLength: this.#view.byteLength,
          requestedByteLength: byteLength,
        }),
      );
    }

    return Result.ok(undefined);
  }

  #checkOffsetLength(byteLength: number): Result.Result<void, DecoderError> {
    return this.#checkLength(this.#byteOffset, byteLength);
  }

  /** Size of the input view in bytes. */
  get byteLength(): number {
    return this.#view.byteLength;
  }

  /** Current byte offset relative to the input view. */
  get offset(): number {
    return this.#byteOffset;
  }

  /** Number of bytes following the cursor. */
  get remaining(): number {
    return this.byteLength - this.#byteOffset;
  }

  /**
   * Moves the cursor to an absolute offset within the input view.
   *
   * Returns {@link DecoderError} for an invalid offset or an offset past the input. Failure leaves the cursor unchanged.
   */
  seek(offset: number): Result.Result<void, DecoderError> {
    return Result.map(this.#checkLength(offset, 0), () => {
      this.#byteOffset = offset;
    });
  }

  nextU8(): Result.Result<U8, DecoderError> {
    return Result.map(this.#checkOffsetLength(1), () => {
      const value = this.#view.getUint8(this.#byteOffset);
      this.#byteOffset += 1;

      return value as U8;
    });
  }

  nextU16(): Result.Result<U16, DecoderError> {
    return Result.map(this.#checkOffsetLength(2), () => {
      const value = this.#view.getUint16(this.#byteOffset, true);
      this.#byteOffset += 2;

      return value as U16;
    });
  }

  nextU32(): Result.Result<U32, DecoderError> {
    return Result.map(this.#checkOffsetLength(4), () => {
      const value = this.#view.getUint32(this.#byteOffset, true);
      this.#byteOffset += 4;

      return value as U32;
    });
  }

  nextU64(): Result.Result<U64, DecoderError> {
    return Result.map(this.#checkOffsetLength(8), () => {
      const value = this.#view.getBigUint64(this.#byteOffset, true);
      this.#byteOffset += 8;

      return value as U64;
    });
  }

  nextI8(): Result.Result<I8, DecoderError> {
    return Result.map(this.#checkOffsetLength(1), () => {
      const value = this.#view.getInt8(this.#byteOffset);
      this.#byteOffset += 1;

      return value as I8;
    });
  }

  nextI16(): Result.Result<I16, DecoderError> {
    return Result.map(this.#checkOffsetLength(2), () => {
      const value = this.#view.getInt16(this.#byteOffset, true);
      this.#byteOffset += 2;

      return value as I16;
    });
  }

  nextI32(): Result.Result<I32, DecoderError> {
    return Result.map(this.#checkOffsetLength(4), () => {
      const value = this.#view.getInt32(this.#byteOffset, true);
      this.#byteOffset += 4;

      return value as I32;
    });
  }

  nextI64(): Result.Result<I64, DecoderError> {
    return Result.map(this.#checkOffsetLength(8), () => {
      const value = this.#view.getBigInt64(this.#byteOffset, true);
      this.#byteOffset += 8;

      return value as I64;
    });
  }

  nextF32(): Result.Result<F32, DecoderError> {
    return Result.map(this.#checkOffsetLength(4), () => {
      const value = this.#view.getFloat32(this.#byteOffset, true);
      this.#byteOffset += 4;

      return value as F32;
    });
  }

  nextF64(): Result.Result<F64, DecoderError> {
    return Result.map(this.#checkOffsetLength(8), () => {
      const value = this.#view.getFloat64(this.#byteOffset, true);
      this.#byteOffset += 8;

      return value as F64;
    });
  }

  nextUint8Array(length: number): Result.Result<Uint8Array<T>, DecoderError> {
    return Result.map(this.#checkOffsetLength(length), () => {
      const value = new Uint8Array(
        this.#view.buffer,
        this.#view.byteOffset + this.#byteOffset,
        length,
      );

      this.#byteOffset += length;

      return value;
    });
  }

  uint8Array(
    offset: number,
    length: number,
  ): Result.Result<Uint8Array<T>, DecoderError> {
    return Result.map(this.#checkLength(offset, length), () => {
      const value = new Uint8Array(
        this.#view.buffer,
        this.#view.byteOffset + offset,
        length,
      );

      return value;
    });
  }

  nextString(length: number): Result.Result<string, DecoderError> {
    return Result.andThen(this.nextUint8Array(length), (buffer) =>
      Result.catch(
        () =>
          Result.ok(
            new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
              buffer,
            ),
          ),
        (cause) =>
          Result.err(new DecoderError({ _tag: "invalid-string" }, { cause })),
      ),
    );
  }
}
