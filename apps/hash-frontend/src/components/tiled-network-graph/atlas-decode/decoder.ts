import * as Num from "./num";
import * as Result from "./result";
import * as TaggedError from "./tagged-error";

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

  nextU8(): Result.Result<Num.u8, DecoderError> {
    return Result.map(this.#checkOffsetLength(1), () => {
      const value = this.#view.getUint8(this.#byteOffset);
      this.#byteOffset += 1;

      return Num.u8.unsafe(value);
    });
  }

  nextU16(): Result.Result<Num.u16, DecoderError> {
    return Result.map(this.#checkOffsetLength(2), () => {
      const value = this.#view.getUint16(this.#byteOffset, true);
      this.#byteOffset += 2;

      return Num.u16.unsafe(value);
    });
  }

  nextU32(): Result.Result<Num.u32, DecoderError> {
    return Result.map(this.#checkOffsetLength(4), () => {
      const value = this.#view.getUint32(this.#byteOffset, true);
      this.#byteOffset += 4;

      return Num.u32.unsafe(value);
    });
  }

  nextU64(): Result.Result<Num.u64, DecoderError> {
    return Result.map(this.#checkOffsetLength(8), () => {
      const value = this.#view.getBigUint64(this.#byteOffset, true);
      this.#byteOffset += 8;

      return Num.u64.unsafe(value);
    });
  }

  nextI8(): Result.Result<Num.i8, DecoderError> {
    return Result.map(this.#checkOffsetLength(1), () => {
      const value = this.#view.getInt8(this.#byteOffset);
      this.#byteOffset += 1;

      return Num.i8.unsafe(value);
    });
  }

  nextI16(): Result.Result<Num.i16, DecoderError> {
    return Result.map(this.#checkOffsetLength(2), () => {
      const value = this.#view.getInt16(this.#byteOffset, true);
      this.#byteOffset += 2;

      return Num.i16.unsafe(value);
    });
  }

  nextI32(): Result.Result<Num.i32, DecoderError> {
    return Result.map(this.#checkOffsetLength(4), () => {
      const value = this.#view.getInt32(this.#byteOffset, true);
      this.#byteOffset += 4;

      return Num.i32.unsafe(value);
    });
  }

  nextI64(): Result.Result<Num.i64, DecoderError> {
    return Result.map(this.#checkOffsetLength(8), () => {
      const value = this.#view.getBigInt64(this.#byteOffset, true);
      this.#byteOffset += 8;

      return Num.i64.unsafe(value);
    });
  }

  nextF32(): Result.Result<Num.f32, DecoderError> {
    return Result.map(this.#checkOffsetLength(4), () => {
      const value = this.#view.getFloat32(this.#byteOffset, true);
      this.#byteOffset += 4;

      return Num.f32.unsafe(value);
    });
  }

  nextF64(): Result.Result<Num.f64, DecoderError> {
    return Result.map(this.#checkOffsetLength(8), () => {
      const value = this.#view.getFloat64(this.#byteOffset, true);
      this.#byteOffset += 8;

      return Num.f64.unsafe(value);
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
