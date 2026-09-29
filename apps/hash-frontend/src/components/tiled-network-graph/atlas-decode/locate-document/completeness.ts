import * as Result from "../result";
import * as LocateError from "./error";

import type * as Num from "../num";

/** Per-link completeness in whole 64-bit words, independent of point type masks. */
export class Completeness implements Iterable<boolean> {
  readonly #bytes: Uint8Array;
  readonly #length: Num.u64;

  private constructor(bytes: Uint8Array, length: Num.u64) {
    this.#bytes = bytes;
    this.#length = length;
  }

  static make(
    length: Num.u64,
    bytes: Uint8Array,
  ): Result.Result<Completeness, LocateError.LocateDocumentError> {
    const expected = ((length + 63n) / 64n) * 8n;

    return Result.ok(bytes).pipe(
      Result.filter(
        (storage: Uint8Array) => BigInt(storage.byteLength) === expected,
        (storage) =>
          LocateError.LocateDocumentError.invalidLength(
            "completeness",
            expected,
            storage.byteLength,
          ),
      ),
      Result.map((storage) => new Completeness(storage, length)),
    );
  }

  get length(): Num.u64 {
    return this.#length;
  }

  /** Reads completeness for a delivered link. Index bounds exclude unused padding bits. */
  at(index: number): Result.Result<boolean, LocateError.LocateDocumentError> {
    if (
      !Number.isSafeInteger(index) ||
      index < 0 ||
      BigInt(index) >= this.#length
    ) {
      return Result.err(
        LocateError.LocateDocumentError.invalid(
          "completeness.index",
          `out of bounds: ${index}`,
        ),
      );
    }

    return Result.ok(this.#read(BigInt(index)));
  }

  #read(index: bigint): boolean {
    const byte = this.#bytes[Number(index / 8n)]!;
    return Math.floor(byte / 2 ** Number(index % 8n)) % 2 === 1;
  }

  /** Yields one boolean per delivered link, excluding word padding. */
  *[Symbol.iterator](): Generator<boolean, void, unknown> {
    for (let index = 0n; index < this.#length; index += 1n) {
      yield this.#read(index);
    }
  }
}
