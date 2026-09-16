import * as TypeSystem from "@blockprotocol/type-system";

import * as Result from "./Result";
import * as TaggedError from "./TaggedError";

import type * as CborDecoder from "./CborDecoder";

/** Invalid identity storage, ordering or an index outside an identity column. */
export type BinaryEntityIdErrorReason =
  | { readonly _tag: "identity-length"; readonly byteLength: number }
  | { readonly _tag: "column-length"; readonly byteLength: number }
  | { readonly _tag: "unordered"; readonly index: number }
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
      case "unordered":
        message = `entity identity at row ${reason.index} must sort after its preceding row`;
        break;
      case "invalid-index":
        message = `entity identity index ${reason.index} is outside ${reason.length} rows`;
        break;
    }

    super("BinaryEntityIdError", reason, message);
  }
}

/**
 * A web UUID followed by an entity UUID, borrowing 32 bytes.
 *
 * Keep the buffer attached and unchanged while using the identity. Its string representation is an {@link TypeSystem.EntityId} without a draft component.
 */
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

  /** Formats one UUID in lowercase, hyphenated hexadecimal. */
  #uuidAt(offset: 0 | 16): string {
    let uuid = "";
    for (let index = 0; index < 16; index += 1) {
      if (index === 4 || index === 6 || index === 8 || index === 10) {
        uuid += "-";
      }

      uuid += this.#inner[offset + index]!.toString(16).padStart(2, "0");
    }

    return uuid;
  }

  /** Formats the entity identity as lowercase `webUuid~entityUuid`. */
  toString(): TypeSystem.EntityId {
    // Each half is a complete UUID in byte order, with its role fixed by the binary representation.
    return TypeSystem.entityIdFromComponents(
      this.#uuidAt(0) as TypeSystem.WebId,
      this.#uuidAt(16) as TypeSystem.EntityUuid,
    );
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

  /** Compares adjacent rows by unsigned bytes in web/entity order. */
  #compareRows(index: number): number {
    const current = index * 32;
    const previous = current - 32;
    for (let offset = 0; offset < 32; offset += 1) {
      const difference =
        this.#buffer.getUint8(previous + offset) -
        this.#buffer.getUint8(current + offset);
      if (difference !== 0) {
        return difference;
      }
    }
    return 0;
  }

  /**
   * Validates strictly ascending byte order without sorting or copying identities.
   *
   * Returns {@link BinaryEntityIdError} at the first duplicate or descending row. Empty and single-row columns succeed. Validation compares adjacent rows and applies to the buffer's current contents.
   */
  validateOrder(): Result.Result<void, BinaryEntityIdError> {
    for (let index = 1; index < this.length; index += 1) {
      if (this.#compareRows(index) >= 0) {
        return Result.err(
          new BinaryEntityIdError({ _tag: "unordered", index }),
        );
      }
    }

    return Result.ok(undefined);
  }

  /** Iterates borrowed identities in column order. */
  *[Symbol.iterator](): IterableIterator<BinaryEntityId> {
    for (let index = 0; index < this.length; index += 1) {
      yield this.#read(index);
    }
  }
}

/** Borrows an entity identity from a CBOR byte string. */
export const Visitor: CborDecoder.CborVisitor<
  BinaryEntityId,
  BinaryEntityIdError
> = {
  expecting: "a 32-byte entity identity",
  visitByteString: (value) =>
    Result.catch(
      () => Result.ok(new BinaryEntityId(value)),
      (cause) => {
        if (cause instanceof BinaryEntityIdError) {
          return Result.err(cause);
        }

        throw cause;
      },
    ),
};
