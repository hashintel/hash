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
    };

/** A type-mask column cannot satisfy a storage or lookup request. */
export class TypeMaskColumnError extends TaggedError.TaggedError<
  "TypeMaskColumnError",
  TypeMaskColumnErrorReason
> {
  /** Describes the rejected storage, type count, or row index. */
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
    }

    super("TypeMaskColumnError", reason, message);
  }
}

/** A type index outside a mask's requested colored types. */
export interface TypeMaskErrorReason {
  readonly _tag: "invalid-type";
  readonly type: number;
  readonly typeCount: number;
}

/** A rejected membership lookup on a point's type mask. */
export class TypeMaskError extends TaggedError.TaggedError<
  "TypeMaskError",
  TypeMaskErrorReason
> {
  constructor(reason: TypeMaskErrorReason) {
    super(
      "TypeMaskError",
      reason,
      `type index ${reason.type} is outside ${reason.typeCount} colored types`,
    );
  }
}

// Column construction validates row widths and the requested type count once.
const readMaskRow = Symbol("readMaskRow");

/**
 * A borrowed point mask over its requested colored types.
 *
 * Type `i` occupies bit `i % 8` of byte `floor(i / 8)`, counting from the least significant bit. Iteration yields matching type indexes in ascending order, excluding padding bits beyond {@link TypeMask.typeCount}.
 *
 * Obtain a mask from {@link TypeMaskColumn}. Keep the input buffer attached and unchanged while using the mask.
 */
export class TypeMask<T extends ArrayBufferLike> implements Iterable<number> {
  readonly #bytes: Uint8Array<T>;
  readonly #typeCount: number;

  private constructor(bytes: Uint8Array<T>, typeCount: number) {
    this.#bytes = bytes;
    this.#typeCount = typeCount;
  }

  static [readMaskRow]<T extends ArrayBufferLike>(
    bytes: Uint8Array<T>,
    typeCount: number,
  ): TypeMask<T> {
    return new TypeMask(bytes, typeCount);
  }

  /** Number of requested types, excluding storage padding. */
  get typeCount(): number {
    return this.#typeCount;
  }

  #has(type: number): boolean {
    const byte = this.#bytes[Math.floor(type / 8)]!;
    // eslint-disable-next-line no-bitwise -- Read the requested least-significant-bit-first mask bit.
    return (byte & (1 << (type % 8))) !== 0;
  }

  /**
   * Reports whether the point matches one requested type.
   *
   * Returns {@link TypeMaskError} for a negative, fractional, non-finite, or out-of-range type index.
   */
  has(type: number): Result.Result<boolean, TypeMaskError> {
    if (!Number.isSafeInteger(type) || type < 0 || type >= this.#typeCount) {
      return Result.err(
        new TypeMaskError({
          _tag: "invalid-type",
          type,
          typeCount: this.#typeCount,
        }),
      );
    }
    return Result.ok(this.#has(type));
  }

  /** Yields matching type indexes without including padding bits. */
  *iter(): Generator<number, void, unknown> {
    for (let type = 0; type < this.#typeCount; type += 1) {
      if (this.#has(type)) {
        yield type;
      }
    }
  }

  [Symbol.iterator](): Generator<number, void, unknown> {
    return this.iter();
  }
}

/** Bytes one row of `typeCount` mask bits occupies. */
export const strideOf = (typeCount: number): number => Math.ceil(typeCount / 8);

/**
 * A borrowed column of per-point colored-type bitmasks.
 *
 * Row `p` starts at byte `p * stride`. Both indexed access and iteration return {@link TypeMask} values with the column's requested type count.
 *
 * Keep the input buffer attached and unchanged while using the column or its rows.
 */
export class TypeMaskColumn<T extends ArrayBufferLike> implements Iterable<
  TypeMask<T>
> {
  readonly #bytes: Uint8Array<T>;
  readonly #typeCount: number;
  readonly #stride: number;

  private constructor(bytes: Uint8Array<T>, typeCount: number, stride: number) {
    this.#bytes = bytes;
    this.#typeCount = typeCount;
    this.#stride = stride;
  }

  /** Borrows whole mask rows, deriving their width from the requested type count. */
  static make<T extends ArrayBufferLike>(
    bytes: Uint8Array<T>,
    typeCount: number,
  ): Result.Result<TypeMaskColumn<T>, TypeMaskColumnError> {
    if (!Number.isSafeInteger(typeCount) || typeCount <= 0) {
      return Result.err(
        new TypeMaskColumnError({ _tag: "invalid-type-count", typeCount }),
      );
    }

    const stride = strideOf(typeCount);
    if (bytes.byteLength % stride !== 0) {
      return Result.err(
        new TypeMaskColumnError({
          _tag: "invalid-length",
          byteLength: bytes.byteLength,
          stride,
        }),
      );
    }

    return Result.ok(new TypeMaskColumn(bytes, typeCount, stride));
  }

  /** Retains encoded mask bytes, including padding bits the lookup methods ignore. */
  static decode(typeCount: number) {
    return <Buffer extends ArrayBufferLike>(
      bytes: Uint8Array<Buffer>,
    ): Result.Result<TypeMaskColumn<Buffer>, TypeMaskColumnError> =>
      TypeMaskColumn.make(bytes, typeCount);
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
  #read(index: number): TypeMask<T> {
    return TypeMask[readMaskRow](
      this.#bytes.subarray(index * this.#stride, (index + 1) * this.#stride),
      this.#typeCount,
    );
  }

  /**
   * Borrows one point's type mask.
   *
   * Returns {@link TypeMaskColumnError} for a negative, fractional, non-finite, or out-of-range index.
   */
  at(index: number): Result.Result<TypeMask<T>, TypeMaskColumnError> {
    return Result.map(this.#checkIndex(index), () => this.#read(index));
  }

  /** Yields borrowed masks in row order. */
  *[Symbol.iterator](): Generator<TypeMask<T>, void, unknown> {
    for (let index = 0; index < this.length; index += 1) {
      yield this.#read(index);
    }
  }
}
