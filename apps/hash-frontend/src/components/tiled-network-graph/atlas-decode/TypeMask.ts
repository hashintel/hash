import * as Result from "./Result";
import * as TaggedError from "./TaggedError";

/** A malformed mask column, an unusable type count, or an out-of-range lookup. */
export type TypeMaskColumnErrorReason =
  | { readonly _tag: "invalid-type-count"; readonly typeCount: number }
  | {
      readonly _tag: "invalid-length";
      readonly byteLength: number;
      readonly stride: number;
    }
  | {
      readonly _tag: "invalid-index";
      readonly index: number;
      readonly length: number;
    }
  | {
      readonly _tag: "invalid-type";
      readonly type: number;
      readonly typeCount: number;
    };

/** A type-mask column cannot satisfy a storage or lookup request. */
export class TypeMaskColumnError extends TaggedError.TaggedError<
  "TypeMaskColumnError",
  TypeMaskColumnErrorReason
> {
  /** Describes the rejected storage, type count, row, or type index. */
  constructor(reason: TypeMaskColumnErrorReason) {
    let message: string;

    switch (reason._tag) {
      case "invalid-type-count":
        message = `type count must be a positive safe integer, received ${reason.typeCount}`;
        break;
      case "invalid-length":
        message = `mask column byte length ${reason.byteLength} is not a multiple of its ${reason.stride}-byte stride`;
        break;
      case "invalid-index":
        message = `mask column index ${reason.index} is outside ${reason.length} rows`;
        break;
      case "invalid-type":
        message = `type index ${reason.type} is outside ${reason.typeCount} colored types`;
        break;
    }

    super("TypeMaskColumnError", reason, message);
  }
}

/** Bytes one row of `typeCount` mask bits occupies. */
export const strideOf = (typeCount: number): number => Math.ceil(typeCount / 8);

/**
 * A borrowed column of per-point colored-type bitmasks.
 *
 * Row `p` starts at byte `p * stride`. Type `i` occupies bit `i % 8` of byte `floor(i / 8)`, counting from the least significant bit. Each set bit identifies a requested type that the point matches. Lookup methods ignore padding bits at or above {@link TypeMaskColumn.typeCount}.
 *
 * Keep the input buffer attached and unchanged while using the column.
 */
export class TypeMaskColumn<T extends ArrayBufferLike> implements Iterable<
  Uint8Array<T>
> {
  readonly #bytes: Uint8Array<T>;
  readonly #typeCount: number;
  readonly #stride: number;

  /**
   * Borrows a whole number of mask rows for `typeCount` colored types.
   *
   * @throws {TypeMaskColumnError} If the type count is not a positive safe integer, or the byte length is not a multiple of the resulting stride.
   */
  constructor(bytes: Uint8Array<T>, typeCount: number) {
    if (!Number.isSafeInteger(typeCount) || typeCount <= 0) {
      throw new TypeMaskColumnError({ _tag: "invalid-type-count", typeCount });
    }

    const stride = strideOf(typeCount);
    if (bytes.byteLength % stride !== 0) {
      throw new TypeMaskColumnError({
        _tag: "invalid-length",
        byteLength: bytes.byteLength,
        stride,
      });
    }

    this.#bytes = bytes;
    this.#typeCount = typeCount;
    this.#stride = stride;
  }

  /** Number of mask rows. */
  get length(): number {
    return this.#bytes.byteLength / this.#stride;
  }

  /** Colored types the column carries one bit for. */
  get typeCount(): number {
    return this.#typeCount;
  }

  /** Bytes each row occupies. */
  get stride(): number {
    return this.#stride;
  }

  /** Rejects an index outside the column's rows. */
  #checkIndex(index: number): Result.Result<void, TypeMaskColumnError> {
    if (!Number.isSafeInteger(index) || index < 0 || index >= this.length) {
      return Result.err(
        new TypeMaskColumnError({
          _tag: "invalid-index",
          index,
          length: this.length,
        }),
      );
    }

    return Result.ok(undefined);
  }

  /** Returns a row already checked against the column length. */
  #read(index: number): Uint8Array<T> {
    return this.#bytes.subarray(
      index * this.#stride,
      (index + 1) * this.#stride,
    );
  }

  /**
   * Borrows one row's mask bytes.
   *
   * Returns {@link TypeMaskColumnError} for a negative, fractional, non-finite, or out-of-range index.
   */
  at(index: number): Result.Result<Uint8Array<T>, TypeMaskColumnError> {
    return Result.map(this.#checkIndex(index), () => this.#read(index));
  }

  /**
   * Reports whether a row carries one colored type.
   *
   * Returns {@link TypeMaskColumnError} for an out-of-range row or a type index outside {@link TypeMaskColumn.typeCount}.
   */
  has(
    index: number,
    type: number,
  ): Result.Result<boolean, TypeMaskColumnError> {
    if (!Number.isSafeInteger(type) || type < 0 || type >= this.#typeCount) {
      return Result.err(
        new TypeMaskColumnError({
          _tag: "invalid-type",
          type,
          typeCount: this.#typeCount,
        }),
      );
    }

    return Result.map(this.#checkIndex(index), () => {
      const byte =
        this.#bytes[index * this.#stride + Math.floor(type / 8)] ?? 0;

      // eslint-disable-next-line no-bitwise -- Read the requested least-significant-bit-first mask bit.
      return (byte & (1 << (type % 8))) !== 0;
    });
  }

  /**
   * Lists a row's colored types as ascending type indexes.
   *
   * Returns {@link TypeMaskColumnError} for an out-of-range index. An empty list is a point that matches no requested type.
   */
  types(index: number): Result.Result<number[], TypeMaskColumnError> {
    return Result.map(this.#checkIndex(index), () => {
      const types: number[] = [];
      for (let type = 0; type < this.#typeCount; type += 1) {
        const byte =
          this.#bytes[index * this.#stride + Math.floor(type / 8)] ?? 0;
        // eslint-disable-next-line no-bitwise -- Read the requested least-significant-bit-first mask bit.
        if ((byte & (1 << (type % 8))) !== 0) {
          types.push(type);
        }
      }

      return types;
    });
  }

  /** Yields borrowed mask rows in row order. */
  *[Symbol.iterator](): Generator<Uint8Array<T>, void, unknown> {
    for (let index = 0; index < this.length; index += 1) {
      yield this.#read(index);
    }
  }
}
