import * as Result from "./Result";
import * as TaggedError from "./TaggedError";

import type * as Num from "./Num";
import type { Brand } from "@blockprotocol/type-system";

/** An opaque node identity within one generation. */
export type NodeId = Brand<Num.u32, "NodeId">;

/** Invalid column storage or an index outside its rows. */
export type NodeIdColumnErrorReason =
  | { readonly _tag: "invalid-length"; readonly byteLength: number }
  | {
      readonly _tag: "invalid-index";
      readonly index: number;
      readonly length: number;
    };

/** A malformed node column or an invalid lookup. */
export class NodeIdColumnError extends TaggedError.TaggedError<
  "NodeIdColumnError",
  NodeIdColumnErrorReason
> {
  /** Describes the rejected column or lookup. */
  constructor(reason: NodeIdColumnErrorReason) {
    let message: string;

    switch (reason._tag) {
      case "invalid-length":
        message = `node column length ${reason.byteLength} is not a multiple of 4 bytes`;
        break;
      case "invalid-index":
        message = `node column index ${reason.index} is outside ${reason.length} rows`;
        break;
    }

    super("NodeIdColumnError", reason, message);
  }
}

/** A borrowed column of little-endian, unsigned node identities. */
export class NodeIdColumn<T extends ArrayBufferLike> {
  readonly #buffer: DataView<T>;

  private constructor(buffer: DataView<T>) {
    this.#buffer = buffer;
  }

  /** Borrows storage containing whole four-byte identities. */
  static make<T extends ArrayBufferLike>(
    buffer: DataView<T>,
  ): Result.Result<NodeIdColumn<T>, NodeIdColumnError> {
    if (buffer.byteLength % 4 !== 0) {
      return Result.err(
        new NodeIdColumnError({
          _tag: "invalid-length",
          byteLength: buffer.byteLength,
        }),
      );
    }

    return Result.ok(new NodeIdColumn(buffer));
  }

  /** Decodes the supplied byte range without copying its storage. */
  static decode<T extends ArrayBufferLike>(
    bytes: Uint8Array<T>,
  ): Result.Result<NodeIdColumn<T>, NodeIdColumnError> {
    return NodeIdColumn.make(
      new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    );
  }

  /** Number of identities in the column. */
  get length(): number {
    return this.#buffer.byteLength / 4;
  }

  /** Reads an index already checked against the column length. */
  #read(index: number): NodeId {
    return this.#buffer.getUint32(index * 4, true) as NodeId;
  }

  /**
   * Reads a zero-based row index.
   *
   * Returns {@link NodeIdColumnError} for a negative, fractional, non-finite or out-of-range index.
   */
  at(index: number): Result.Result<NodeId, NodeIdColumnError> {
    if (!Number.isSafeInteger(index) || index < 0 || index >= this.length) {
      return Result.err(
        new NodeIdColumnError({
          _tag: "invalid-index",
          index,
          length: this.length,
        }),
      );
    }

    return Result.ok(this.#read(index));
  }

  /** Iterates identities in column order. */
  *[Symbol.iterator](): IterableIterator<NodeId> {
    for (let index = 0; index < this.length; index += 1) {
      yield this.#read(index);
    }
  }
}
