import { describe, expect, it } from "vitest";

import { CborDecoder, CborDecoderError } from "./CborDecoder";
import { cborBstr } from "./fixtures";
import { GenerationId, GenerationIdError, Visitor } from "./GenerationId";
import * as Result from "./Result";

const identityBytes = (): Uint8Array =>
  Uint8Array.from({ length: 32 }, (_, index) => index);

/** Narrows a Result to its Err and returns the error. */
const expectErr = <E>(result: Result.Result<unknown, E>): E => {
  expect(result._tag).toBe("err");
  if (!Result.isErr(result)) {
    throw new Error("expected an Err");
  }
  return result.error;
};

/** Narrows a Result to its Ok and returns the value. */
const expectOk = <T>(result: Result.Result<T, unknown>): T => {
  expect(result._tag).toBe("ok");
  if (!Result.isOk(result)) {
    throw new Error("expected an Ok");
  }
  return result.value;
};

type Constructor<E> = new (...args: never[]) => E;

/** Catches a synchronous constructor throw. */
const expectThrows = <E extends Error>(
  fn: () => unknown,
  ctor: Constructor<E>,
): E => {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ctor);
    if (error instanceof ctor) {
      return error;
    }
  }
  throw new Error("expected a throw");
};

describe("GenerationId constructor", () => {
  it("accepts_32_bytes_borrowed", () => {
    const bytes = identityBytes();
    const generation = new GenerationId(bytes);
    expect(generation.bytes).toBe(bytes);
  });

  it.each([0, 16, 31, 33, 64])(
    "rejects_length_other_than_32_%i",
    (byteLength) => {
      const error = expectThrows(
        () => new GenerationId(new Uint8Array(byteLength)),
        GenerationIdError,
      );
      expect(error.reason).toEqual({
        _tag: "invalid-length",
        byteLength,
      });
    },
  );
});

describe("GenerationId hexadecimal conversion", () => {
  const hex =
    "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";

  it("parses_and_formats_each_byte_in_order", () => {
    const generation = expectOk(GenerationId.fromHex(hex));
    expect(generation.bytes).toEqual(identityBytes());
    expect(generation.toString()).toBe(hex);
  });

  it("preserves_leading_zeroes", () => {
    expect(new GenerationId(new Uint8Array(32)).toString()).toBe(
      "0".repeat(64),
    );
    const maximum = "f".repeat(64);
    expect(expectOk(GenerationId.fromHex(maximum)).bytes).toEqual(
      new Uint8Array(32).fill(0xff),
    );
  });

  it("formats_only_the_borrowed_subview", () => {
    const bytes = new Uint8Array(80).fill(0xff);
    bytes.set(identityBytes(), 3);
    expect(new GenerationId(bytes.subarray(3, 35)).toString()).toBe(hex);
  });

  it("allocates_distinct_storage_for_each_parse", () => {
    const first = expectOk(GenerationId.fromHex(hex));
    const second = expectOk(GenerationId.fromHex(hex));
    expect(first.bytes.buffer).not.toBe(second.bytes.buffer);
  });

  it.each([
    "",
    "0".repeat(63),
    "0".repeat(65),
    `0x${"0".repeat(64)}`,
    `g${"0".repeat(63)}`,
    hex.toUpperCase(),
    ` ${hex}`,
    `${hex}\n`,
    "０".repeat(64),
  ])("rejects_noncanonical_hex_%j", (value) => {
    expect(expectErr(GenerationId.fromHex(value)).reason).toEqual({
      _tag: "invalid-hex",
    });
  });
});

describe("GenerationId.Visitor", () => {
  it("constructs_from_cbor_byte_string", () => {
    const bytes = identityBytes();
    const payload = Uint8Array.from(cborBstr([...bytes]));
    const result = new CborDecoder(payload).decode(Visitor);

    const generation = expectOk(result);
    expect(generation).toBeInstanceOf(GenerationId);
    expect([...generation.bytes]).toEqual([...bytes]);
  });

  it("borrows_bytes_from_decoder_buffer", () => {
    const bytes = identityBytes();
    const payload = Uint8Array.from(cborBstr([...bytes]));
    const generation = expectOk(new CborDecoder(payload).decode(Visitor));

    // The byte string view is not copied: it shares the payload's buffer.
    expect(generation.bytes.buffer).toBe(payload.buffer);
  });

  it("wrong_length_is_domain_error_not_throw", () => {
    const payload = Uint8Array.from(cborBstr([1, 2, 3]));
    const result = new CborDecoder(payload).decode(Visitor);

    const error = expectErr(result);
    expect(error).toBeInstanceOf(GenerationIdError);
    expect(error.reason).toEqual({ _tag: "invalid-length", byteLength: 3 });
  });

  it("rejects_non_byte_string_value", () => {
    // 0x01 is the unsigned integer 1, a category Visitor does not accept.
    const result = new CborDecoder(Uint8Array.of(0x01)).decode(Visitor);

    const error = expectErr(result);
    expect(error).toBeInstanceOf(CborDecoderError);
    if (error instanceof CborDecoderError) {
      expect(error.reason).toEqual({
        _tag: "unexpected-kind",
        expected: "a 32-byte generation identity",
        actual: "unsigned-integer",
      });
    }
  });
});
