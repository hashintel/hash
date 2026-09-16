import * as TypeSystem from "@blockprotocol/type-system";

import * as Result from "./result";
import * as TaggedError from "./tagged-error";

import type * as CborDecoder from "./cbor-decoder";

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

// Column reads create fixed-width views without repeating identity validation.
const readIdentityRow = Symbol("readIdentityRow");

/**
 * A web UUID followed by an entity UUID, borrowing 32 bytes.
 *
 * Keep the buffer attached and unchanged while using the identity. Its string representation is an {@link TypeSystem.EntityId} without a draft component.
 */
export class BinaryEntityId {
  readonly #inner: Uint8Array;

  private constructor(inner: Uint8Array) {
    this.#inner = inner;
  }

  /** Borrows exactly 32 bytes or returns an identity-length error. */
  static make(
    this: void,
    inner: Uint8Array,
  ): Result.Result<BinaryEntityId, BinaryEntityIdError> {
    if (inner.byteLength !== 32) {
      return Result.err(
        new BinaryEntityIdError({
          _tag: "identity-length",
          byteLength: inner.byteLength,
        }),
      );
    }
    return Result.ok(new BinaryEntityId(inner));
  }

  static [readIdentityRow](view: DataView, index: number): BinaryEntityId {
    return new BinaryEntityId(
      new Uint8Array(view.buffer, view.byteOffset + index * 32, 32),
    );
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

  private constructor(buffer: DataView<T>) {
    this.#buffer = buffer;
  }

  /** Borrows whole binary identities without imposing row order. */
  static make<T extends ArrayBufferLike>(
    buffer: DataView<T>,
  ): Result.Result<BinaryEntityIdColumn<T>, BinaryEntityIdError> {
    if (buffer.byteLength % 32 !== 0) {
      return Result.err(
        new BinaryEntityIdError({
          _tag: "column-length",
          byteLength: buffer.byteLength,
        }),
      );
    }
    return Result.ok(new BinaryEntityIdColumn(buffer));
  }

  /** Decodes the supplied byte range without copying its storage. */
  static decode<T extends ArrayBufferLike>(
    bytes: Uint8Array<T>,
  ): Result.Result<BinaryEntityIdColumn<T>, BinaryEntityIdError> {
    return BinaryEntityIdColumn.make(
      new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    );
  }

  /** Number of identities in the column. */
  get length(): number {
    return this.#buffer.byteLength / 32;
  }

  /** Reads an index already checked against the column length. */
  #read(index: number): BinaryEntityId {
    return BinaryEntityId[readIdentityRow](this.#buffer, index);
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

/** Borrows an entity identity from a CBOR byte string. */
export const Visitor: CborDecoder.CborVisitor<
  BinaryEntityId,
  BinaryEntityIdError
> = {
  expecting: "a 32-byte entity identity",
  visitByteString: BinaryEntityId.make,
};
