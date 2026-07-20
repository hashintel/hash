/**
 * Reader for the SALTILE deterministic CBOR subset (normative profile:
 * `SPEC-ADDENDUM-WIRE.md` section 4). The profile restricts RFC 8949
 * deterministic encoding further: definite lengths only, unsigned
 * integer map keys in strictly ascending order, no tags, floats always
 * IEEE 754 single precision.
 *
 * Byte strings decode to views over the input buffer, never copies.
 * Text strings decode through one fatal TextDecoder pass, so invalid
 * UTF-8 is a named error rather than replacement characters.
 */

/** A decoded value of the subset. */
export type CborValue =
  | number
  | boolean
  | null
  | string
  | Uint8Array
  | readonly CborValue[]
  | ReadonlyMap<number, CborValue>;

/** A payload violated the SALTILE CBOR profile. */
export class SaltileCborError extends Error {
  override readonly name = "SaltileCborError";
  /** Byte offset within the decoded payload at which the check applies. */
  readonly offset: number;

  constructor(detail: string, offset: number) {
    super(`${detail} (at byte ${offset})`);
    this.offset = offset;
  }
}

/**
 * Nesting bound; the deepest wire schema is three levels, so the cap
 * exists to make hostile input a named error instead of stack
 * exhaustion.
 */
const MAXIMUM_DEPTH = 16;

const utf8 = new TextDecoder("utf-8", { fatal: true });

/** Shortest-form minima per additional-info width. */
const shortestMinimum: Readonly<Record<number, number>> = {
  24: 24,
  25: 0x100,
  26: 0x1_0000,
};

class Reader {
  readonly #bytes: Uint8Array;
  readonly #view: DataView;
  #offset = 0;

  constructor(bytes: Uint8Array) {
    this.#bytes = bytes;
    this.#view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  #fail(detail: string, offset: number): never {
    throw new SaltileCborError(detail, offset);
  }

  /** Reads a definite-length argument, enforcing shortest form. */
  #readArgument(info: number): number {
    const headOffset = this.#offset - 1;
    if (info < 24) {
      return info;
    }
    if (info > 27) {
      return this.#fail(
        info === 31
          ? "indefinite lengths are outside the profile"
          : `reserved additional info ${info}`,
        headOffset,
      );
    }

    const width = 2 ** (info - 24);
    if (this.#offset + width > this.#bytes.length) {
      return this.#fail(
        "payload ends inside an integer argument",
        this.#offset,
      );
    }

    let value: number;
    if (info === 27) {
      const wide = this.#view.getBigUint64(this.#offset, false);
      if (wide > BigInt(Number.MAX_SAFE_INTEGER)) {
        return this.#fail(
          "integer exceeds the safe JavaScript range",
          this.#offset,
        );
      }
      value = Number(wide);
      if (value <= 0xffff_ffff) {
        return this.#fail("integer is not shortest-form encoded", headOffset);
      }
    } else {
      value =
        info === 24
          ? this.#view.getUint8(this.#offset)
          : info === 25
            ? this.#view.getUint16(this.#offset, false)
            : this.#view.getUint32(this.#offset, false);
      if (value < shortestMinimum[info]!) {
        return this.#fail("integer is not shortest-form encoded", headOffset);
      }
    }
    this.#offset += width;
    return value;
  }

  readValue(depth: number): CborValue {
    if (depth > MAXIMUM_DEPTH) {
      return this.#fail(`nesting exceeds depth ${MAXIMUM_DEPTH}`, this.#offset);
    }
    if (this.#offset >= this.#bytes.length) {
      return this.#fail("payload ends where a value is required", this.#offset);
    }

    const headOffset = this.#offset;
    const head = this.#bytes[this.#offset]!;
    this.#offset += 1;
    const major = Math.floor(head / 32);
    const info = head % 32;

    switch (major) {
      case 0: {
        return this.#readArgument(info);
      }
      case 1: {
        return -1 - this.#readArgument(info);
      }
      case 2: {
        const length = this.#readArgument(info);
        if (this.#offset + length > this.#bytes.length) {
          return this.#fail("payload ends inside a byte string", this.#offset);
        }
        const start = this.#offset;
        this.#offset += length;
        return this.#bytes.subarray(start, start + length);
      }
      case 3: {
        const length = this.#readArgument(info);
        if (this.#offset + length > this.#bytes.length) {
          return this.#fail("payload ends inside a text string", this.#offset);
        }
        const start = this.#offset;
        this.#offset += length;
        try {
          return utf8.decode(this.#bytes.subarray(start, start + length));
        } catch {
          return this.#fail("text string is not valid UTF-8", start);
        }
      }
      case 4: {
        const length = this.#readArgument(info);
        const entries: CborValue[] = [];
        for (let index = 0; index < length; index += 1) {
          entries.push(this.readValue(depth + 1));
        }
        return entries;
      }
      case 5: {
        const length = this.#readArgument(info);
        const entries = new Map<number, CborValue>();
        let previousKey = -1;
        for (let index = 0; index < length; index += 1) {
          const keyOffset = this.#offset;
          const key = this.readValue(depth + 1);
          if (typeof key !== "number" || !Number.isInteger(key) || key < 0) {
            return this.#fail("map keys must be unsigned integers", keyOffset);
          }
          if (key <= previousKey) {
            return this.#fail(
              key === previousKey
                ? `map key ${key} occurs twice`
                : "map keys are not in ascending order",
              keyOffset,
            );
          }
          previousKey = key;
          entries.set(key, this.readValue(depth + 1));
        }
        return entries;
      }
      case 6: {
        return this.#fail("tags are outside the profile", headOffset);
      }
      default: {
        switch (info) {
          case 20: {
            return false;
          }
          case 21: {
            return true;
          }
          case 22: {
            return null;
          }
          case 26: {
            if (this.#offset + 4 > this.#bytes.length) {
              return this.#fail("payload ends inside a float", this.#offset);
            }
            const value = this.#view.getFloat32(this.#offset, false);
            this.#offset += 4;
            return value;
          }
          case 25:
          case 27: {
            return this.#fail(
              "floats must be IEEE 754 single precision",
              headOffset,
            );
          }
          default: {
            return this.#fail(
              `simple value ${info} is outside the profile`,
              headOffset,
            );
          }
        }
      }
    }
  }

  finish(value: CborValue): CborValue {
    if (this.#offset !== this.#bytes.length) {
      return this.#fail(
        `payload carries ${this.#bytes.length - this.#offset} trailing bytes`,
        this.#offset,
      );
    }
    return value;
  }
}

/**
 * Decodes exactly one value spanning the whole payload.
 *
 * @throws {@link SaltileCborError} on any profile violation, including
 *   trailing bytes after the value.
 */
export const decodeCbor = (bytes: Uint8Array): CborValue => {
  const reader = new Reader(bytes);
  return reader.finish(reader.readValue(0));
};
