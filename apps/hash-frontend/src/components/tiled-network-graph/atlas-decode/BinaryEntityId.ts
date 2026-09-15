import * as Result from "./Result";
import * as TaggedError from "./TaggedError";

/** Invalid identity storage or an index outside an identity column. */
export type BinaryEntityIdErrorReason =
  | { readonly _tag: "identity-length"; readonly byteLength: number }
  | { readonly _tag: "column-length"; readonly byteLength: number }
  | {
      readonly _tag: "invalid-index";
      readonly index: number;
      readonly length: number;
    };

/** A malformed entity identity or an invalid column lookup. */
export class BinaryEntityIdError extends TaggedError.TaggedError<
  "BinaryEntityIdError",
  BinaryEntityIdErrorReason
> {
  /** Describes the rejected identity or lookup. */
  constructor(reason: BinaryEntityIdErrorReason) {
    let message: string;

    switch (reason._tag) {
      case "identity-length":
        message = `entity identity requires 32 bytes, received ${reason.byteLength}`;
        break;
      case "column-length":
        message = `entity identity column length ${reason.byteLength} is not a multiple of 32 bytes`;
        break;
      case "invalid-index":
        message = `entity identity index ${reason.index} is outside ${reason.length} rows`;
        break;
    }

    super("BinaryEntityIdError", reason, message);
  }
}

/** A web UUID followed by an entity UUID, borrowing 32 bytes. */
export class BinaryEntityId {
  readonly #inner: Uint8Array;

  /**
   * Borrows one binary entity identity.
   *
   * @throws {BinaryEntityIdError} If the byte length is not 32.
   */
  constructor(inner: Uint8Array) {
    if (inner.byteLength !== 32) {
      throw new BinaryEntityIdError({
        _tag: "identity-length",
        byteLength: inner.byteLength,
      });
    }

    this.#inner = inner;
  }

  /** The borrowed identity bytes in web/entity order. */
  get bytes(): Uint8Array {
    return this.#inner;
  }
}

/** A borrowed column of 32-byte binary entity identities. */
export class BinaryEntityIdColumn<T extends ArrayBufferLike> {
  readonly #buffer: DataView<T>;

  /**
   * Borrows a whole number of entity identities.
   *
   * @throws {BinaryEntityIdError} If the byte length is not divisible by 32.
   */
  constructor(buffer: DataView<T>) {
    if (buffer.byteLength % 32 !== 0) {
      throw new BinaryEntityIdError({
        _tag: "column-length",
        byteLength: buffer.byteLength,
      });
    }

    this.#buffer = buffer;
  }

  /** Number of identities in the column. */
  get length(): number {
    return this.#buffer.byteLength / 32;
  }

  /** Reads an index already checked against the column length. */
  #read(index: number): BinaryEntityId {
    return new BinaryEntityId(
      new Uint8Array(
        this.#buffer.buffer,
        this.#buffer.byteOffset + index * 32,
        32,
      ),
    );
  }

  /**
   * Borrows the identity at a zero-based row index.
   *
   * Returns {@link BinaryEntityIdError} for a negative, fractional, non-finite or out-of-range index. Bounds apply to this column's view, not the backing buffer.
   */
  at(index: number): Result.Result<BinaryEntityId, BinaryEntityIdError> {
    if (!Number.isSafeInteger(index) || index < 0 || index >= this.length) {
      return Result.err(
        new BinaryEntityIdError({
          _tag: "invalid-index",
          index,
          length: this.length,
        }),
      );
    }

    return Result.ok(this.#read(index));
  }

  /** Iterates borrowed identities in column order. */
  *[Symbol.iterator](): IterableIterator<BinaryEntityId> {
    for (let index = 0; index < this.length; index += 1) {
      yield this.#read(index);
    }
  }
}
