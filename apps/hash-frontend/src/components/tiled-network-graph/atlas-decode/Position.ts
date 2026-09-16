import * as Num from "./Num";
import * as Result from "./Result";
import * as TaggedError from "./TaggedError";

/** A malformed position column or an out-of-range row lookup. */
export type PositionColumnErrorReason =
  | { readonly _tag: "invalid-length"; readonly byteLength: number }
  | {
      readonly _tag: "invalid-index";
      readonly index: number;
      readonly length: number;
    };

/** A position column cannot satisfy a storage or lookup request. */
export class PositionColumnError extends TaggedError.TaggedError<
  "PositionColumnError",
  PositionColumnErrorReason
> {
  /** Describes the invalid storage width or row index. */
  constructor(reason: PositionColumnErrorReason) {
    let message: string;
    switch (reason._tag) {
      case "invalid-length":
        message = `position column byte length must be a multiple of 8, received ${reason.byteLength}`;
        break;
      case "invalid-index":
        message = `position index ${reason.index} is outside ${reason.length} rows`;
        break;
    }
    super("PositionColumnError", reason, message);
  }
}

/** An x/y pair stored as single-precision coordinates. */
export type Position = readonly [x: Num.f32, y: Num.f32];

/**
 * Borrows interleaved little-endian coordinate pairs.
 *
 * Reads do not require the input view's absolute offset to be aligned. Keep its buffer attached and unchanged while using the column. Coordinates retain their encoded f32 values, including non-finite values.
 */
export class PositionColumn<
  T extends ArrayBufferLike,
> implements Iterable<Position> {
  readonly #view: DataView<T>;

  /**
   * Borrows a view containing whole {@link Position} rows.
   */
  private constructor(view: DataView<T>) {
    this.#view = view;
  }

  static make<T extends ArrayBufferLike>(
    view: DataView<T>,
  ): Result.Result<PositionColumn<T>, PositionColumnError> {
    if (view.byteLength % 8 !== 0) {
      return Result.err(
        new PositionColumnError({
          _tag: "invalid-length",
          byteLength: view.byteLength,
        }),
      );
    }

    return Result.ok(new PositionColumn(view));
  }

  static decode<T extends ArrayBufferLike>(
    bytes: Uint8Array<T>,
  ): Result.Result<PositionColumn<T>, PositionColumnError> {
    return PositionColumn.make(
      new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    );
  }

  /** The number of complete coordinate pairs. */
  get length(): number {
    return this.#view.byteLength / 8;
  }

  #read(index: number): Position {
    return [
      Num.f32.unsafe(this.#view.getFloat32(index * 8, true)),
      Num.f32.unsafe(this.#view.getFloat32(index * 8 + 4, true)),
    ];
  }

  /** Returns a row, or an error unless its index is an in-range integer. */
  at(index: number): Result.Result<Position, PositionColumnError> {
    if (!Number.isSafeInteger(index) || index < 0 || index >= this.length) {
      return Result.err(
        new PositionColumnError({
          _tag: "invalid-index",
          index,
          length: this.length,
        }),
      );
    }

    return Result.ok(this.#read(index));
  }

  /** Yields coordinate pairs in row order. */
  *[Symbol.iterator](): Generator<Position, void, unknown> {
    for (let index = 0; index < this.length; index += 1) {
      yield this.#read(index);
    }
  }
}
